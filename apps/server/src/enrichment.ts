import { z } from "zod";

import {
  type EnrichmentModelConfig,
  type EnrichmentProvider,
  type VisualFacets,
  visualFacetsSchema,
} from "./enrichment-provider";
import { authorizeInternalJob } from "./internal-job-auth";

export type EnrichmentJob = {
  artworkId: string;
  reason: "import" | "update" | "backfill";
  requestedAt: number;
};

type EnrichmentDatabase = Pick<D1Database, "prepare">;
type EnrichmentBucket = Pick<R2Bucket, "get">;
type EnrichmentQueue = Pick<Queue<EnrichmentJob>, "send" | "sendBatch">;
type EnrichmentVectorIndex = Pick<VectorizeIndex, "getByIds" | "upsert">;
type EnrichmentAnalytics = Pick<AnalyticsEngineDataset, "writeDataPoint">;

export type EnrichmentDependencies = {
  analytics?: EnrichmentAnalytics;
  bucket: EnrichmentBucket;
  database: EnrichmentDatabase;
  now?: () => number;
  provider: EnrichmentProvider;
  vectorIndex: EnrichmentVectorIndex;
};

type ArtworkForEnrichment = {
  id: string;
  title: string;
  artist: string;
  artistId: string | null;
  dateDisplay: string;
  description: string;
  medium: string;
  alt: string;
  galleryId: string;
  galleryName: string;
  isPublicDomain: number;
  thumbnailFingerprint: string;
  thumbnailR2Key: string;
  categorySlugs: string;
  styleSlugs: string;
};

function prepared(database: EnrichmentDatabase, sql: string, values: unknown[] = []) {
  return database.prepare(sql).bind(...values);
}

async function findArtwork(database: EnrichmentDatabase, artworkId: string) {
  return prepared(
    database,
    `SELECT a.id, a.title, a.artist, a.date_display AS dateDisplay,
      a.description, a.medium, a.alt, a.gallery_id AS galleryId,
      g.name AS galleryName, a.is_public_domain AS isPublicDomain,
      a.thumbnail_fingerprint AS thumbnailFingerprint, a.thumbnail_r2_key AS thumbnailR2Key,
      (SELECT aa.artist_id FROM artwork_artist aa WHERE aa.artwork_id = a.id
        ORDER BY aa.position, aa.artist_id LIMIT 1) AS artistId,
      COALESCE((SELECT json_group_array(c.slug) FROM artwork_category ac
        JOIN category c ON c.id = ac.category_id WHERE ac.artwork_id = a.id), '[]') AS categorySlugs,
      COALESCE((SELECT json_group_array(s.slug) FROM artwork_style ast
        JOIN style s ON s.id = ast.style_id WHERE ast.artwork_id = a.id), '[]') AS styleSlugs
    FROM artwork a JOIN gallery g ON g.id = a.gallery_id WHERE a.id = ? LIMIT 1`,
    [artworkId],
  ).first<ArtworkForEnrichment>();
}

function parseSlugList(value: string) {
  const parsed = z.array(z.string()).safeParse(JSON.parse(value));
  return parsed.success ? [...parsed.data].sort() : [];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalArtworkText(artwork: ArtworkForEnrichment, facets: VisualFacets | null) {
  const categories = parseSlugList(artwork.categorySlugs);
  const styles = parseSlugList(artwork.styleSlugs);
  const fields: Array<[string, string | string[]]> = [
    ["Title", artwork.title],
    ["Artist", artwork.artist],
    ["Date", artwork.dateDisplay],
    ["Medium", artwork.medium],
    ["Gallery", artwork.galleryName],
    ["Categories", categories],
    ["Styles", styles],
  ];
  if (facets) {
    fields.push(
      ["Visual description", facets.visualDescription],
      ["Palette", facets.palette],
      ["Color temperature", facets.temperature],
      ["Brightness", facets.brightness],
      ["Subjects", facets.subjects],
      ["Setting", facets.setting],
      ["Mood", facets.mood],
      ["Composition", facets.composition],
      ["Texture and mark-making", facets.textureAndMarkMaking],
      ["Abstraction", facets.abstraction],
      ["Visual density", facets.visualDensity],
      ["Motifs", facets.motifs],
    );
  }
  fields.push(["Description", artwork.description], ["Alt text", artwork.alt]);
  return fields
    .map(([label, value]) => `${label}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n");
}

async function inputFingerprint(
  artwork: ArtworkForEnrichment,
  sourceMode: "image" | "metadata",
  config: EnrichmentModelConfig,
) {
  return sha256(
    stableJson({
      alt: artwork.alt,
      artist: artwork.artist,
      categories: parseSlugList(artwork.categorySlugs),
      dateDisplay: artwork.dateDisplay,
      description: artwork.description,
      embeddingDimensions: config.embeddingDimensions,
      embeddingModel: config.embeddingModel,
      galleryId: artwork.galleryId,
      medium: artwork.medium,
      promptVersion: config.promptVersion,
      provider: config.provider,
      sourceMode,
      styles: parseSlugList(artwork.styleSlugs),
      thumbnailFingerprint: sourceMode === "image" ? artwork.thumbnailFingerprint : null,
      title: artwork.title,
      vectorGeneration: config.vectorGeneration,
      visionModel: sourceMode === "image" ? config.visionModel : null,
    }),
  );
}

async function analyzeThumbnail(
  artwork: ArtworkForEnrichment,
  dependencies: EnrichmentDependencies,
) {
  const object = await dependencies.bucket.get(artwork.thumbnailR2Key);
  if (!object) throw new Error("Artwork thumbnail is missing from R2.");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength > 2 * 1_024 * 1_024)
    throw new Error("Artwork thumbnail exceeded the size limit.");
  return dependencies.provider.analyzeArtwork({
    imageBytes: bytes,
    metadata: {
      title: artwork.title,
      artist: artwork.artist,
      medium: artwork.medium,
      date: artwork.dateDisplay,
    },
  });
}

async function markProcessing(
  database: EnrichmentDatabase,
  artworkId: string,
  sourceMode: "image" | "metadata",
  fingerprint: string,
  config: EnrichmentModelConfig,
  now: number,
) {
  await prepared(
    database,
    `INSERT INTO artwork_enrichment
      (artwork_id,status,source_mode,provider,vision_model,embedding_model,embedding_dimensions,
       prompt_version,content_fingerprint,canonical_text,visual_facets,attempts,last_error,queued_at,updated_at)
      VALUES (?,'processing',?,?,?,?,?,?,?,'','{}',1,NULL,?,?)
      ON CONFLICT(artwork_id) DO UPDATE SET
        status='processing', source_mode=excluded.source_mode, provider=excluded.provider,
        vision_model=excluded.vision_model, embedding_model=excluded.embedding_model,
        embedding_dimensions=excluded.embedding_dimensions, prompt_version=excluded.prompt_version,
        canonical_text=CASE WHEN artwork_enrichment.content_fingerprint=excluded.content_fingerprint
          THEN artwork_enrichment.canonical_text ELSE '' END,
        visual_facets=CASE WHEN artwork_enrichment.content_fingerprint=excluded.content_fingerprint
          THEN artwork_enrichment.visual_facets ELSE '{}' END,
        content_fingerprint=excluded.content_fingerprint,
        attempts=artwork_enrichment.attempts+1,
        last_error=NULL, queued_at=excluded.queued_at, updated_at=excluded.updated_at`,
    [
      artworkId,
      sourceMode,
      config.provider,
      config.visionModel,
      config.embeddingModel,
      config.embeddingDimensions,
      config.promptVersion,
      fingerprint,
      now,
      now,
    ],
  ).run();
}

function errorSummary(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown enrichment error";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

export async function enrichArtwork(artworkId: string, dependencies: EnrichmentDependencies) {
  const artwork = await findArtwork(dependencies.database, artworkId);
  if (!artwork) return { outcome: "missing" as const };
  const sourceMode = artwork.isPublicDomain ? "image" : "metadata";
  const { config } = dependencies.provider;
  const fingerprint = await inputFingerprint(artwork, sourceMode, config);
  const existing = await prepared(
    dependencies.database,
    `SELECT status, content_fingerprint AS fingerprint, canonical_text AS canonicalText,
      visual_facets AS visualFacets, processed_at AS processedAt
     FROM artwork_enrichment WHERE artwork_id=?`,
    [artworkId],
  ).first<{
    status: string;
    fingerprint: string;
    canonicalText: string;
    visualFacets: string;
    processedAt: number | null;
  }>();
  if (existing?.fingerprint === fingerprint && existing.processedAt) {
    const vectors = await dependencies.vectorIndex.getByIds([artworkId]);
    const vector = vectors[0];
    if (
      vector?.values.length === config.embeddingDimensions &&
      (vector.metadata as { embeddingGeneration?: string } | undefined)?.embeddingGeneration ===
        config.vectorGeneration
    ) {
      await prepared(
        dependencies.database,
        "UPDATE artwork_enrichment SET status='ready', last_error=NULL, updated_at=? WHERE artwork_id=?",
        [dependencies.now?.() ?? Date.now(), artworkId],
      ).run();
      return { outcome: "unchanged" as const, fingerprint, sourceMode };
    }
  }

  const now = dependencies.now?.() ?? Date.now();
  await markProcessing(dependencies.database, artworkId, sourceMode, fingerprint, config, now);
  try {
    let facets: VisualFacets | null = null;
    let canonicalText = "";
    if (existing?.fingerprint === fingerprint && existing.canonicalText) {
      canonicalText = existing.canonicalText;
      if (sourceMode === "image")
        facets = visualFacetsSchema.parse(JSON.parse(existing.visualFacets));
    } else {
      facets = sourceMode === "image" ? await analyzeThumbnail(artwork, dependencies) : null;
      canonicalText = canonicalArtworkText(artwork, facets);
      await prepared(
        dependencies.database,
        `UPDATE artwork_enrichment SET content_fingerprint=?, canonical_text=?, visual_facets=?,
          updated_at=? WHERE artwork_id=?`,
        [
          fingerprint,
          canonicalText,
          facets ? JSON.stringify(facets) : "{}",
          dependencies.now?.() ?? Date.now(),
          artworkId,
        ],
      ).run();
    }
    const vector = await dependencies.provider.embedText(canonicalText);
    const metadata: VectorizeVectorMetadata = {
      galleryId: artwork.galleryId,
      isPublicDomain: Boolean(artwork.isPublicDomain),
      categorySlugs: parseSlugList(artwork.categorySlugs),
      styleSlugs: parseSlugList(artwork.styleSlugs),
      embeddingGeneration: config.vectorGeneration,
    };
    if (artwork.artistId) metadata.artistId = artwork.artistId;
    const mutation = await dependencies.vectorIndex.upsert([
      {
        id: artwork.id,
        values: vector,
        metadata,
      },
    ]);
    const completedAt = dependencies.now?.() ?? Date.now();
    await prepared(
      dependencies.database,
      `UPDATE artwork_enrichment SET status='ready', source_mode=?, provider=?, vision_model=?,
        embedding_model=?, embedding_dimensions=?, prompt_version=?, content_fingerprint=?,
        canonical_text=?, visual_facets=?, last_error=NULL, vector_mutation_id=?, processed_at=?, updated_at=?
       WHERE artwork_id=?`,
      [
        sourceMode,
        config.provider,
        config.visionModel,
        config.embeddingModel,
        config.embeddingDimensions,
        config.promptVersion,
        fingerprint,
        canonicalText,
        facets ? JSON.stringify(facets) : "{}",
        "mutationId" in mutation && typeof mutation.mutationId === "string"
          ? mutation.mutationId
          : null,
        completedAt,
        completedAt,
        artworkId,
      ],
    ).run();
    dependencies.analytics?.writeDataPoint({
      blobs: [
        "enrichment_ready",
        sourceMode,
        config.provider,
        config.visionModel,
        config.embeddingModel,
        config.vectorGeneration,
      ],
      doubles: [completedAt - now],
      indexes: [artworkId],
    });
    return {
      outcome: "ready" as const,
      fingerprint,
      sourceMode,
      provider: config.provider,
      vectorGeneration: config.vectorGeneration,
    };
  } catch (error) {
    const failedAt = dependencies.now?.() ?? Date.now();
    await prepared(
      dependencies.database,
      "UPDATE artwork_enrichment SET status='failed', last_error=?, updated_at=? WHERE artwork_id=?",
      [errorSummary(error), failedAt, artworkId],
    ).run();
    dependencies.analytics?.writeDataPoint({
      blobs: [
        "enrichment_failed",
        sourceMode,
        config.provider,
        config.visionModel,
        config.embeddingModel,
        config.vectorGeneration,
      ],
      doubles: [failedAt - now],
      indexes: [artworkId],
    });
    throw error;
  }
}

export async function handleEnrichmentQueue(
  batch: MessageBatch<EnrichmentJob>,
  dependencies: EnrichmentDependencies,
) {
  for (const message of batch.messages) {
    try {
      await enrichArtwork(message.body.artworkId, dependencies);
      message.ack();
    } catch (error) {
      console.error("Artwork enrichment failed", {
        artworkId: message.body.artworkId,
        error: errorSummary(error),
      });
      const attempts = Number.isInteger(message.attempts) ? message.attempts : 1;
      const delaySeconds = Math.min(30 * 2 ** Math.min(Math.max(attempts - 1, 0), 4), 300);
      message.retry({ delaySeconds });
    }
  }
}

export async function handleEnrichmentBackfillRequest(
  request: Request,
  dependencies: {
    config: EnrichmentModelConfig;
    database: EnrichmentDatabase;
    queue: EnrichmentQueue;
    secret: string;
    now?: () => number;
  },
) {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== "/internal/enrichment/backfill"
  )
    return new Response(null, { status: 404 });
  const authorization = await authorizeInternalJob(request, dependencies.secret);
  if (authorization !== "authorized")
    return Response.json(
      { error: authorization === "unauthorized" ? "unauthorized" : "enrichment_unavailable" },
      { status: authorization === "unauthorized" ? 401 : 503 },
    );
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 100);
  const cursor = url.searchParams.get("cursor") ?? "";
  const rows = await prepared(
    dependencies.database,
    `SELECT a.id FROM artwork a WHERE a.id > ? ORDER BY a.id LIMIT ?`,
    [cursor, limit],
  ).all<{ id: string }>();
  const now = dependencies.now?.() ?? Date.now();
  const messages = rows.results.map(({ id }) => ({
    body: { artworkId: id, reason: "backfill" as const, requestedAt: now },
  }));
  if (messages.length) {
    await prepared(
      dependencies.database,
      `INSERT INTO artwork_enrichment
        (artwork_id,status,source_mode,provider,vision_model,embedding_model,embedding_dimensions,
       prompt_version,content_fingerprint,canonical_text,visual_facets,attempts,last_error,queued_at,updated_at)
       SELECT a.id,'pending',CASE WHEN a.is_public_domain=1 THEN 'image' ELSE 'metadata' END,
         ?,?,?,?,?,'','','{}',0,NULL,?,?
       FROM artwork a WHERE a.id > ? ORDER BY a.id LIMIT ?
       ON CONFLICT(artwork_id) DO UPDATE SET status='pending', source_mode=excluded.source_mode,
         provider=excluded.provider, vision_model=excluded.vision_model,
         embedding_model=excluded.embedding_model,
         embedding_dimensions=excluded.embedding_dimensions,
         prompt_version=excluded.prompt_version, last_error=NULL,
         queued_at=excluded.queued_at, updated_at=excluded.updated_at`,
      [
        dependencies.config.provider,
        dependencies.config.visionModel,
        dependencies.config.embeddingModel,
        dependencies.config.embeddingDimensions,
        dependencies.config.promptVersion,
        now,
        now,
        cursor,
        limit,
      ],
    ).run();
    await dependencies.queue.sendBatch(messages);
  }
  return Response.json({
    queued: messages.length,
    nextCursor: messages.length === limit ? rows.results.at(-1)?.id : null,
  });
}

export async function handleEnrichmentStatusRequest(
  request: Request,
  dependencies: {
    config: EnrichmentModelConfig;
    database: EnrichmentDatabase;
    secret: string;
    vectorIndex: Pick<VectorizeIndex, "getByIds">;
  },
) {
  if (request.method !== "GET" || new URL(request.url).pathname !== "/internal/enrichment/status")
    return new Response(null, { status: 404 });
  const authorization = await authorizeInternalJob(request, dependencies.secret);
  if (authorization !== "authorized")
    return Response.json(
      { error: authorization === "unauthorized" ? "unauthorized" : "enrichment_unavailable" },
      { status: authorization === "unauthorized" ? 401 : 503 },
    );
  const counts = await prepared(
    dependencies.database,
    `WITH current_enrichment AS (
       SELECT * FROM artwork_enrichment
       WHERE provider=? AND vision_model=? AND embedding_model=?
         AND embedding_dimensions=? AND prompt_version=?
     )
     SELECT COUNT(a.id) AS total,
      SUM(CASE WHEN ae.status='ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN ae.status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN ae.status IN ('pending','processing') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN ae.artwork_id IS NULL THEN 1 ELSE 0 END) AS missing
     FROM artwork a LEFT JOIN current_enrichment ae ON ae.artwork_id=a.id`,
    [
      dependencies.config.provider,
      dependencies.config.visionModel,
      dependencies.config.embeddingModel,
      dependencies.config.embeddingDimensions,
      dependencies.config.promptVersion,
    ],
  ).first<{ total: number; ready: number; failed: number; pending: number; missing: number }>();
  let verified = 0;
  let readyCursor = "";
  while (true) {
    const page = await prepared(
      dependencies.database,
      `SELECT artwork_id AS id FROM artwork_enrichment
       WHERE status='ready' AND provider=? AND vision_model=? AND embedding_model=?
         AND embedding_dimensions=? AND prompt_version=? AND artwork_id > ?
       ORDER BY artwork_id LIMIT 1000`,
      [
        dependencies.config.provider,
        dependencies.config.visionModel,
        dependencies.config.embeddingModel,
        dependencies.config.embeddingDimensions,
        dependencies.config.promptVersion,
        readyCursor,
      ],
    ).all<{ id: string }>();
    for (let offset = 0; offset < page.results.length; offset += 20) {
      const vectors = await dependencies.vectorIndex.getByIds(
        page.results.slice(offset, offset + 20).map(({ id }) => id),
      );
      verified += vectors.filter(
        ({ values, metadata }) =>
          values.length === dependencies.config.embeddingDimensions &&
          (metadata as { embeddingGeneration?: string } | undefined)?.embeddingGeneration ===
            dependencies.config.vectorGeneration,
      ).length;
    }
    if (page.results.length < 1000) break;
    readyCursor = page.results.at(-1)!.id;
  }
  return Response.json({
    total: Number(counts?.total ?? 0),
    ready: Number(counts?.ready ?? 0),
    failed: Number(counts?.failed ?? 0),
    pending: Number(counts?.pending ?? 0),
    missing: Number(counts?.missing ?? 0),
    verified,
    provider: dependencies.config.provider,
    vectorGeneration: dependencies.config.vectorGeneration,
  });
}

export async function handleEnrichmentIndexReadinessRequest(
  request: Request,
  dependencies: {
    config: EnrichmentModelConfig;
    secret: string;
    vectorIndex: Pick<VectorizeIndex, "query">;
  },
) {
  if (
    request.method !== "GET" ||
    new URL(request.url).pathname !== "/internal/enrichment/index-ready"
  )
    return new Response(null, { status: 404 });
  const authorization = await authorizeInternalJob(request, dependencies.secret);
  if (authorization !== "authorized")
    return Response.json(
      { error: authorization === "unauthorized" ? "unauthorized" : "enrichment_unavailable" },
      { status: authorization === "unauthorized" ? 401 : 503 },
    );
  try {
    const probe = Array.from({ length: dependencies.config.embeddingDimensions }, (_, index) =>
      index === 0 ? 1 : 0,
    );
    await dependencies.vectorIndex.query(probe, {
      topK: 1,
      filter: {
        artistId: "__readiness_probe__",
        embeddingGeneration: dependencies.config.vectorGeneration,
        galleryId: "__readiness_probe__",
        isPublicDomain: false,
      },
      returnMetadata: "none",
    });
    return Response.json({
      ready: true,
      provider: dependencies.config.provider,
      vectorGeneration: dependencies.config.vectorGeneration,
    });
  } catch {
    return Response.json(
      {
        ready: false,
        provider: dependencies.config.provider,
        vectorGeneration: dependencies.config.vectorGeneration,
      },
      { status: 503 },
    );
  }
}

export async function enqueueArtworkEnrichment(
  queue: Pick<Queue<EnrichmentJob>, "send"> | undefined,
  artworkId: string,
  reason: "import" | "update",
  now = Date.now(),
  state?: {
    config: EnrichmentModelConfig;
    database: EnrichmentDatabase;
    sourceMode: "image" | "metadata";
  },
) {
  if (!queue) return false;
  if (state) {
    try {
      await prepared(
        state.database,
        `INSERT INTO artwork_enrichment
          (artwork_id,status,source_mode,provider,vision_model,embedding_model,embedding_dimensions,
           prompt_version,content_fingerprint,canonical_text,visual_facets,attempts,last_error,queued_at,updated_at)
         VALUES (?,'pending',?,?,?,?,?,?,'','','{}',0,NULL,?,?)
         ON CONFLICT(artwork_id) DO UPDATE SET status='pending', source_mode=excluded.source_mode,
           provider=excluded.provider, vision_model=excluded.vision_model,
           embedding_model=excluded.embedding_model,
           embedding_dimensions=excluded.embedding_dimensions,
           prompt_version=excluded.prompt_version, last_error=NULL,
           queued_at=excluded.queued_at, updated_at=excluded.updated_at`,
        [
          artworkId,
          state.sourceMode,
          state.config.provider,
          state.config.visionModel,
          state.config.embeddingModel,
          state.config.embeddingDimensions,
          state.config.promptVersion,
          now,
          now,
        ],
      ).run();
    } catch (error) {
      // The catalog has already committed. Backfill can reconstruct missing state.
      console.error("Artwork enrichment pending state failed", {
        artworkId,
        error: errorSummary(error),
      });
    }
  }
  try {
    await queue.send({ artworkId, reason, requestedAt: now });
    return true;
  } catch (error) {
    // Catalog persistence is authoritative. Queue recovery can use the backfill endpoint.
    console.error("Artwork enrichment enqueue failed", { artworkId, error: errorSummary(error) });
    return false;
  }
}
