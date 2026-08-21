import {
  PermanentArtifactDownloadError,
  TransientArtifactDownloadError,
} from "@art/db/artifact-download";

import { BoundedJsonError, readBoundedJson } from "./bounded-json";
import type { ArtworkDatabase, ArtworkDraft, ArtworkWriteDependencies } from "./artwork-contract";
import { ArtworkRequestError, artworkDraftSchema } from "./artwork-contract";
import {
  derivedId,
  prepared,
  resolveSharedEntities,
  sha256,
  slugify,
  type SharedEntities,
} from "./artwork-entities";
import { ingestArtworkImages } from "./artwork-ingestion";
import { authorizeInternalJob } from "./internal-job-auth";
import { enqueueArtworkEnrichment } from "./enrichment";

const CONSTRAINT =
  /SQLITE_CONSTRAINT|(?:UNIQUE|FOREIGN KEY|CHECK|NOT NULL|PRIMARY KEY) constraint failed/i;

function findArtwork(database: ArtworkDatabase, id: string, externalId?: string) {
  return prepared(
    database,
    `SELECT id, slug, title, artist FROM artwork WHERE ${externalId !== undefined ? "source_id = ? AND source_external_id = ?" : "id = ?"} LIMIT 1`,
    externalId !== undefined ? [id, externalId] : [id],
  ).first<{ id: string; slug: string; title: string; artist: string }>();
}

async function resolveCreateSlug(database: ArtworkDatabase, title: string, artworkId: string) {
  const plain = slugify(title);
  const owner = await prepared(database, "SELECT id FROM artwork WHERE slug = ? LIMIT 1", [
    plain,
  ]).first<{ id: string }>();
  if (!owner || owner.id === artworkId) return plain;
  return `${plain.slice(0, 79).replace(/-$/g, "")}-${(await sha256(artworkId)).slice(0, 16)}`;
}

function constraintFailure(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    const object = typeof current === "object" ? current : null;
    if (object && seen.has(object)) return false;
    if (object) seen.add(object);
    if (CONSTRAINT.test(current instanceof Error ? current.message : String(current))) return true;
    current = object && "cause" in object ? object.cause : undefined;
  }
  return false;
}

function writeStatements(
  database: ArtworkDatabase,
  draft: ArtworkDraft,
  artworkId: string,
  slug: string,
  shared: SharedEntities,
  images: Awaited<ReturnType<typeof ingestArtworkImages>>,
  now: number,
  updating: boolean,
) {
  const { full, thumbnail } = images;
  const record = {
    source_id: shared.sourceId,
    gallery_id: shared.galleryId,
    source_external_id: draft.sourceExternalId,
    slug,
    title: draft.title,
    artist: draft.artist,
    date_display: draft.dateDisplay,
    description: draft.description,
    medium: draft.medium,
    dimensions: draft.dimensions,
    credit_line: draft.creditLine,
    source_url: draft.sourceUrl,
    image_id: full.contentFingerprint,
    image_url: full.url,
    thumbnail_url: thumbnail.url,
    image_source_url: draft.imageSourceUrl,
    image_attribution: draft.imageAttribution,
    image_source_version: full.sourceFingerprint,
    thumbnail_source_version: thumbnail.sourceFingerprint,
    image_fingerprint: full.contentFingerprint,
    thumbnail_fingerprint: thumbnail.contentFingerprint,
    image_r2_key: full.key,
    thumbnail_r2_key: thumbnail.key,
    image_width: full.width,
    image_height: full.height,
    alt: draft.alt,
    is_public_domain: draft.isPublicDomain ? 1 : 0,
    updated_at: now,
  };
  const entries = Object.entries(record);
  const write = updating
    ? prepared(
        database,
        `UPDATE artwork SET ${entries.map(([key]) => `${key}=?`).join(",")} WHERE id=?`,
        [...entries.map(([, value]) => value), artworkId],
      )
    : prepared(
        database,
        `INSERT INTO artwork (id,${entries.map(([key]) => key).join(",")},curated_at)
        VALUES (${[artworkId, ...entries, now].map(() => "?").join(",")})`,
        [artworkId, ...entries.map(([, value]) => value), now],
      );
  const statements = [
    ...shared.inserts,
    write,
    prepared(database, "DELETE FROM artwork_category WHERE artwork_id = ?", [artworkId]),
    prepared(database, "DELETE FROM artwork_style WHERE artwork_id = ?", [artworkId]),
    prepared(database, "DELETE FROM artwork_artist WHERE artwork_id = ?", [artworkId]),
    prepared(
      database,
      "INSERT INTO artwork_artist (artwork_id, artist_id, position) VALUES (?, ?, 0)",
      [artworkId, shared.artistId],
    ),
    prepared(database, "UPDATE catalog_state SET version = version + 1 WHERE id = 1", []),
  ];
  for (const [kind, slugs, ids] of [
    ["category", draft.categorySlugs, shared.categoryIds],
    ["style", draft.styleSlugs, shared.styleIds],
  ] as const)
    statements.push(
      ...slugs.map((value) =>
        prepared(database, `INSERT INTO artwork_${kind} (artwork_id, ${kind}_id) VALUES (?, ?)`, [
          artworkId,
          ids.get(value),
        ]),
      ),
    );
  if (draft.inboxId)
    statements.push(prepared(database, "DELETE FROM art_inbox WHERE id = ?", [draft.inboxId]));
  return statements;
}

async function writeArtwork(draft: ArtworkDraft, dependencies: ArtworkWriteDependencies) {
  const { database } = dependencies;
  const target = draft.artworkId ? await findArtwork(database, draft.artworkId) : null;
  if (draft.artworkId && !target) throw new ArtworkRequestError(404, "not_found");
  let shared = await resolveSharedEntities(database, draft);
  const identity = await findArtwork(database, shared.sourceId, draft.sourceExternalId);
  if (target && identity && identity.id !== target.id)
    throw new ArtworkRequestError(409, "artwork_conflict");
  if (!target && identity) return { outcome: "duplicate", artwork: identity };

  const inbox = prepared(database, "SELECT id FROM art_inbox WHERE id = ? LIMIT 1", [
    draft.inboxId ?? "",
  ]);
  if (draft.inboxId && !(await inbox.first())) throw new ArtworkRequestError(404, "not_found");
  const artworkId = target?.id ?? (await derivedId(shared.sourceId, draft.sourceExternalId));
  let slug = target?.slug ?? (await resolveCreateSlug(database, draft.title, artworkId));
  const { imageUrl, thumbnailUrl } = draft;
  const images = await ingestArtworkImages(artworkId, imageUrl, thumbnailUrl, dependencies);
  const now = dependencies.now?.() ?? Date.now();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await database.batch(
        writeStatements(database, draft, artworkId, slug, shared, images, now, Boolean(target)),
      );
      return {
        outcome: target ? ("updated" as const) : ("created" as const),
        artwork: { id: artworkId, slug, title: draft.title, artist: draft.artist },
      };
    } catch (error) {
      if (!constraintFailure(error)) throw new ArtworkRequestError(503, "artwork_unavailable");
      if (attempt === 1) {
        const winner =
          !target && (await findArtwork(database, shared.sourceId, draft.sourceExternalId));
        if (winner) return { outcome: "duplicate" as const, artwork: winner };
        throw new ArtworkRequestError(409, "artwork_conflict");
      }
      shared = await resolveSharedEntities(database, draft); // The sole re-resolution.
      const winner = await findArtwork(database, shared.sourceId, draft.sourceExternalId);
      if (target && winner && winner.id !== target.id)
        throw new ArtworkRequestError(409, "artwork_conflict");
      if (!target && winner) return { outcome: "duplicate" as const, artwork: winner };
      if (!target) slug = await resolveCreateSlug(database, draft.title, artworkId);
    }
  }
  throw new ArtworkRequestError(503, "artwork_unavailable");
}

export async function handleArtworkWriteRequest(
  request: Request,
  dependencies: ArtworkWriteDependencies,
) {
  try {
    if (new URL(request.url).pathname !== "/internal/artworks" || request.method !== "POST")
      return new Response(null, { status: 404 });
    const authorization = await authorizeInternalJob(request, dependencies.secret);
    if (authorization !== "authorized")
      throw new ArtworkRequestError(
        authorization === "unauthorized" ? 401 : 503,
        authorization === "unauthorized" ? "unauthorized" : "artwork_unavailable",
      );
    const parsed = artworkDraftSchema.safeParse(await readBoundedJson(request, 64 * 1_024));
    if (!parsed.success) throw new ArtworkRequestError(422, "invalid_artwork");
    const result = await writeArtwork(parsed.data, dependencies);
    if (result.outcome !== "duplicate")
      await enqueueArtworkEnrichment(
        dependencies.enrichmentQueue,
        result.artwork.id,
        result.outcome === "created" ? "import" : "update",
        dependencies.now?.() ?? Date.now(),
        {
          database: dependencies.database,
          embeddingModel: dependencies.embeddingModel,
          promptVersion: dependencies.promptVersion,
          sourceMode: parsed.data.isPublicDomain ? "image" : "metadata",
          visionModel: dependencies.visionModel,
        },
      );
    return Response.json(result);
  } catch (error) {
    if (error instanceof BoundedJsonError)
      return Response.json(
        { error: error.reason === "too_large" ? "payload_too_large" : "invalid_request" },
        { status: error.status },
      );
    if (error instanceof ArtworkRequestError)
      return Response.json({ error: error.code }, { status: error.status });
    if (error instanceof PermanentArtifactDownloadError)
      return Response.json({ error: "invalid_artwork" }, { status: 422 });
    if (error instanceof TransientArtifactDownloadError)
      return Response.json({ error: "artifact_upstream_unavailable" }, { status: 502 });
    console.error("Artwork write failed", error);
    return Response.json({ error: "artwork_unavailable" }, { status: 503 });
  }
}
