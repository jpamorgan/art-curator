import {
  PermanentArtifactDownloadError,
  TransientArtifactDownloadError,
  downloadArtworkArtifact,
} from "@art/db/artifact-download";
import {
  ARTIFACT_CACHE_CONTROL,
  ARTIFACT_CONTENT_TYPE,
  artworkArtifactContentDisposition,
  artworkArtifactCustomMetadata,
  artworkArtifactExpectation,
  canonicalArtifactSourceUrl,
  storedArtworkArtifactMatches,
  type ArtworkArtifactExpectation,
} from "@art/db/artifacts";
import { z } from "zod";

import { authorizeInternalJob } from "./internal-job-auth";

const IMPORT_ROUTE = "/internal/art-import";
const MAX_JSON_BYTES = 256 * 1_024;
const MAX_ARTWORKS = 3;
const MAX_TOTAL_ARTIFACT_BYTES = MAX_ARTWORKS * 16 * 1_024 * 1_024;
const DEFAULT_JOB_DEADLINE_MS = 55_000;

type ImportDatabase = Pick<D1Database, "batch" | "prepare">;
type ImportBucket = Pick<R2Bucket, "head" | "put">;

export type ArtworkImportDependencies = {
  bucket: ImportBucket;
  database: ImportDatabase;
  fetcher?: typeof fetch;
  now?: () => number;
  secret: string;
  sleep?: (milliseconds: number) => Promise<void>;
  jobDeadlineMs?: number;
};

class ImportRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 409 | 413 | 415 | 422 | 500 | 502 | 503 | 504,
    readonly code: string,
  ) {
    super(code);
  }
}

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current !== undefined && current !== null && !seen.has(current) && chain.length < 5) {
    chain.push(current);
    seen.add(current);
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return chain;
}

function isDatabaseConstraintFailure(error: unknown): boolean {
  return errorChain(error).some((candidate) => {
    const code =
      typeof candidate === "object" && candidate !== null && "code" in candidate
        ? String((candidate as { code?: unknown }).code ?? "")
        : "";
    if (/^(?:SQLITE_)?CONSTRAINT(?:_[A-Z_]+)?$/i.test(code)) return true;

    const message = candidate instanceof Error ? candidate.message : String(candidate);
    return (
      /\bSQLITE_CONSTRAINT(?:_[A-Z_]+)?\b/i.test(message) ||
      /\b(?:UNIQUE|FOREIGN KEY|CHECK|NOT NULL|PRIMARY KEY) constraint failed\b/i.test(message)
    );
  });
}

function isCatalogGuardFailure(error: unknown): boolean {
  return errorChain(error).some((candidate) => {
    const message = candidate instanceof Error ? candidate.message : String(candidate);
    return /catalog_import_guard(?:_valid_check)?/i.test(message);
  });
}

async function headArtifact(
  bucket: ImportBucket,
  expectation: ArtworkArtifactExpectation,
): Promise<R2Object | null> {
  try {
    return await bucket.head(expectation.key);
  } catch {
    throw new ImportRequestError(503, "artifact_storage_unavailable");
  }
}

async function putArtifact(
  bucket: ImportBucket,
  expectation: ArtworkArtifactExpectation,
  bytes: ArrayBuffer,
): Promise<void> {
  try {
    await bucket.put(expectation.key, bytes, {
      httpMetadata: {
        contentType: ARTIFACT_CONTENT_TYPE,
        cacheControl: ARTIFACT_CACHE_CONTROL,
        contentDisposition: artworkArtifactContentDisposition(expectation),
      },
      customMetadata: artworkArtifactCustomMetadata(expectation),
    });
  } catch {
    throw new ImportRequestError(503, "artifact_storage_unavailable");
  }
}

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const slugSchema = idSchema;
const shortText = z.string().trim().min(1).max(240);
const description = z.string().trim().min(1).max(4_000);
const httpsUrl = z
  .string()
  .trim()
  .max(2_048)
  .transform((value, context) => {
    try {
      return canonicalArtifactSourceUrl(value);
    } catch {
      context.addIssue({ code: "custom", message: "Use a public HTTPS URL." });
      return z.NEVER;
    }
  });
const sourceVersion = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const sourceSchema = z
  .object({
    id: idSchema,
    slug: slugSchema,
    name: shortText,
    kind: z.enum(["museum", "gallery", "curation", "social"]),
    url: httpsUrl,
    attribution: z.string().trim().min(1).max(1_000),
    termsUrl: httpsUrl,
  })
  .strict();
const gallerySchema = z
  .object({
    id: idSchema,
    slug: slugSchema,
    sourceSlug: slugSchema,
    name: shortText,
    location: z.string().trim().min(1).max(240),
    description,
    url: httpsUrl,
  })
  .strict();
const taxonomySchema = z
  .object({
    id: idSchema,
    slug: slugSchema,
    name: shortText,
    description: z.string().trim().min(1).max(1_000),
    sortOrder: z.number().int().min(-10_000).max(10_000),
  })
  .strict();
const artifactSourceSchema = z
  .object({
    url: httpsUrl,
    version: sourceVersion,
  })
  .strict();
const artworkSchema = z
  .object({
    id: idSchema,
    slug: slugSchema,
    sourceSlug: slugSchema,
    gallerySlug: slugSchema,
    sourceExternalId: z.string().trim().min(1).max(240),
    title: shortText,
    artist: shortText,
    dateDisplay: z.string().trim().min(1).max(120),
    description,
    medium: z.string().trim().min(1).max(500),
    dimensions: z.string().trim().min(1).max(500),
    creditLine: z.string().trim().min(1).max(1_000),
    sourceUrl: httpsUrl,
    imageId: z.string().trim().min(1).max(240),
    imageSourceUrl: httpsUrl,
    imageAttribution: z.string().trim().min(1).max(1_000),
    imageWidth: z.number().int().positive().max(100_000),
    imageHeight: z.number().int().positive().max(100_000),
    alt: z.string().trim().min(1).max(1_000),
    isPublicDomain: z.boolean(),
    curatedAt: z.iso.datetime({ offset: true }),
    categorySlugs: z.array(slugSchema).min(1).max(4),
    styleSlugs: z.array(slugSchema).min(1).max(8),
    artifacts: z
      .object({
        full: artifactSourceSchema,
        thumbnail: artifactSourceSchema,
      })
      .strict(),
  })
  .strict();

function duplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export const artworkImportBatchSchema = z
  .object({
    sources: z.array(sourceSchema).min(1).max(5),
    galleries: z.array(gallerySchema).min(1).max(5),
    categories: z.array(taxonomySchema).min(1).max(10),
    styles: z.array(taxonomySchema).min(1).max(20),
    artworks: z.array(artworkSchema).min(1).max(MAX_ARTWORKS),
  })
  .strict()
  .superRefine((batch, context) => {
    for (const [name, rows] of [
      ["sources", batch.sources],
      ["galleries", batch.galleries],
      ["categories", batch.categories],
      ["styles", batch.styles],
      ["artworks", batch.artworks],
    ] as const) {
      if (duplicate(rows.map((row) => row.id)) || duplicate(rows.map((row) => row.slug))) {
        context.addIssue({ code: "custom", message: `${name} contains duplicate identity.` });
      }
    }

    const sourceSlugs = new Set(batch.sources.map((row) => row.slug));
    const gallerySlugs = new Set(batch.galleries.map((row) => row.slug));
    const gallerySourceSlugs = new Map(
      batch.galleries.map((row) => [row.slug, row.sourceSlug] as const),
    );
    const categorySlugs = new Set(batch.categories.map((row) => row.slug));
    const styleSlugs = new Set(batch.styles.map((row) => row.slug));
    for (const row of batch.galleries) {
      if (!sourceSlugs.has(row.sourceSlug)) {
        context.addIssue({ code: "custom", message: "Gallery references an unknown source." });
      }
    }
    for (const row of batch.artworks) {
      if (
        !sourceSlugs.has(row.sourceSlug) ||
        !gallerySlugs.has(row.gallerySlug) ||
        gallerySourceSlugs.get(row.gallerySlug) !== row.sourceSlug ||
        duplicate(row.categorySlugs) ||
        duplicate(row.styleSlugs) ||
        row.categorySlugs.some((slug) => !categorySlugs.has(slug)) ||
        row.styleSlugs.some((slug) => !styleSlugs.has(slug))
      ) {
        context.addIssue({ code: "custom", message: "Artwork references are invalid." });
      }
    }
  });

export type ArtworkImportBatch = z.infer<typeof artworkImportBatchSchema>;

export const artworkImportRequestSchema = z
  .object({
    expectedCatalogVersion: z.number().int().positive(),
    batch: artworkImportBatchSchema,
  })
  .strict();

export type ArtworkImportRequest = z.infer<typeof artworkImportRequestSchema>;

async function authorize(request: Request, secret: string): Promise<void> {
  const result = await authorizeInternalJob(request, secret);
  if (result === "not_configured") throw new ImportRequestError(503, "import_not_configured");
  if (result === "unauthorized") throw new ImportRequestError(401, "unauthorized");
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ImportRequestError(415, "json_required");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new ImportRequestError(400, "invalid_content_length");
    }
    if (parsedLength > MAX_JSON_BYTES) {
      throw new ImportRequestError(413, "payload_too_large");
    }
  }
  if (!request.body) throw new ImportRequestError(400, "invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new ImportRequestError(413, "payload_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new ImportRequestError(400, "invalid_json");
  }
}

function prepared(database: ImportDatabase, sql: string, values: unknown[]): D1PreparedStatement {
  return database.prepare(sql).bind(...values);
}

function placeholders(count: number, width: number): string {
  const row = `(${Array.from({ length: width }, () => "?").join(",")})`;
  return Array.from({ length: count }, () => row).join(",");
}

function databaseStatements(
  database: ImportDatabase,
  batch: ArtworkImportBatch,
  expectations: Map<
    string,
    { full: ArtworkArtifactExpectation; thumbnail: ArtworkArtifactExpectation }
  >,
  now: number,
  expectedCatalogVersion: number,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    prepared(
      database,
      `INSERT INTO catalog_import_guard (id, valid)
       VALUES (1, CASE
         WHEN (SELECT version FROM catalog_state WHERE id = 1) = ? THEN 1 ELSE 0
       END)`,
      [expectedCatalogVersion],
    ),
  ];
  const sourceIds = new Map(batch.sources.map((row) => [row.slug, row.id]));
  const galleryIds = new Map(batch.galleries.map((row) => [row.slug, row.id]));
  const categoryIds = new Map(batch.categories.map((row) => [row.slug, row.id]));
  const styleIds = new Map(batch.styles.map((row) => [row.slug, row.id]));

  for (const row of batch.sources) {
    statements.push(
      prepared(
        database,
        `INSERT INTO source (id, slug, name, kind, url, attribution, terms_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, name=excluded.name,
           kind=excluded.kind, url=excluded.url, attribution=excluded.attribution,
           terms_url=excluded.terms_url`,
        [row.id, row.slug, row.name, row.kind, row.url, row.attribution, row.termsUrl],
      ),
    );
  }
  for (const row of batch.galleries) {
    statements.push(
      prepared(
        database,
        `INSERT INTO gallery (id, source_id, slug, name, location, description, url)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id, slug=excluded.slug,
           name=excluded.name, location=excluded.location, description=excluded.description,
           url=excluded.url`,
        [
          row.id,
          sourceIds.get(row.sourceSlug),
          row.slug,
          row.name,
          row.location,
          row.description,
          row.url,
        ],
      ),
    );
  }
  for (const [table, rows] of [
    ["category", batch.categories],
    ["style", batch.styles],
  ] as const) {
    for (const row of rows) {
      statements.push(
        prepared(
          database,
          `INSERT INTO ${table} (id, slug, name, description, sort_order)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, name=excluded.name,
             description=excluded.description, sort_order=excluded.sort_order`,
          [row.id, row.slug, row.name, row.description, row.sortOrder],
        ),
      );
    }
  }
  for (const row of batch.artworks) {
    const artifact = expectations.get(row.id)!;
    statements.push(
      prepared(
        database,
        `INSERT INTO artwork (
          id, source_id, gallery_id, source_external_id, slug, title, artist, date_display,
          description, medium, dimensions, credit_line, source_url, image_id, image_url,
          thumbnail_url, image_source_url, image_attribution, image_source_version,
          thumbnail_source_version, image_fingerprint, thumbnail_fingerprint, image_r2_key,
          thumbnail_r2_key, image_width, image_height, alt, is_public_domain, curated_at,
          updated_at
        ) VALUES (${Array.from({ length: 30 }, () => "?").join(",")})
        ON CONFLICT(id) DO UPDATE SET
          source_id=excluded.source_id, gallery_id=excluded.gallery_id,
          source_external_id=excluded.source_external_id, slug=excluded.slug,
          title=excluded.title, artist=excluded.artist, date_display=excluded.date_display,
          description=excluded.description, medium=excluded.medium, dimensions=excluded.dimensions,
          credit_line=excluded.credit_line, source_url=excluded.source_url, image_id=excluded.image_id,
          image_url=excluded.image_url, thumbnail_url=excluded.thumbnail_url,
          image_source_url=excluded.image_source_url, image_attribution=excluded.image_attribution,
          image_source_version=excluded.image_source_version,
          thumbnail_source_version=excluded.thumbnail_source_version,
          image_fingerprint=excluded.image_fingerprint,
          thumbnail_fingerprint=excluded.thumbnail_fingerprint,
          image_r2_key=excluded.image_r2_key, thumbnail_r2_key=excluded.thumbnail_r2_key,
          image_width=excluded.image_width, image_height=excluded.image_height, alt=excluded.alt,
          is_public_domain=excluded.is_public_domain, curated_at=excluded.curated_at,
          updated_at=excluded.updated_at`,
        [
          row.id,
          sourceIds.get(row.sourceSlug),
          galleryIds.get(row.gallerySlug),
          row.sourceExternalId,
          row.slug,
          row.title,
          row.artist,
          row.dateDisplay,
          row.description,
          row.medium,
          row.dimensions,
          row.creditLine,
          row.sourceUrl,
          row.imageId,
          artifact.full.canonicalUpstreamUrl,
          artifact.thumbnail.canonicalUpstreamUrl,
          row.imageSourceUrl,
          row.imageAttribution,
          artifact.full.sourceVersion,
          artifact.thumbnail.sourceVersion,
          artifact.full.fingerprint,
          artifact.thumbnail.fingerprint,
          artifact.full.key,
          artifact.thumbnail.key,
          row.imageWidth,
          row.imageHeight,
          row.alt,
          row.isPublicDomain ? 1 : 0,
          new Date(row.curatedAt).getTime(),
          now,
        ],
      ),
    );
  }

  const artworkIds = batch.artworks.map((row) => row.id);
  const artworkIdPlaceholders = artworkIds.map(() => "?").join(",");
  statements.push(
    prepared(
      database,
      `DELETE FROM artwork_category WHERE artwork_id IN (${artworkIdPlaceholders})`,
      artworkIds,
    ),
    prepared(
      database,
      `DELETE FROM artwork_style WHERE artwork_id IN (${artworkIdPlaceholders})`,
      artworkIds,
    ),
  );
  const categoryLinks = batch.artworks.flatMap((row) =>
    row.categorySlugs.map((slug) => [row.id, categoryIds.get(slug)]),
  );
  const styleLinks = batch.artworks.flatMap((row) =>
    row.styleSlugs.map((slug) => [row.id, styleIds.get(slug)]),
  );
  statements.push(
    prepared(
      database,
      `INSERT INTO artwork_category (artwork_id, category_id) VALUES ${placeholders(categoryLinks.length, 2)}`,
      categoryLinks.flat(),
    ),
    prepared(
      database,
      `INSERT INTO artwork_style (artwork_id, style_id) VALUES ${placeholders(styleLinks.length, 2)}`,
      styleLinks.flat(),
    ),
    prepared(database, "UPDATE catalog_state SET version = version + 1 WHERE id = 1", []),
    prepared(database, "DELETE FROM catalog_import_guard WHERE id = 1", []),
  );
  return statements;
}

async function catalogVersion(database: ImportDatabase): Promise<number> {
  try {
    const row = await database
      .prepare("SELECT version FROM catalog_state WHERE id = 1")
      .first<{ version: number }>();
    if (!row || !Number.isSafeInteger(row.version) || row.version < 1) {
      throw new ImportRequestError(503, "database_unavailable");
    }
    return row.version;
  } catch (error) {
    if (error instanceof ImportRequestError) throw error;
    throw new ImportRequestError(503, "database_unavailable");
  }
}

async function importBatch(
  batch: ArtworkImportBatch,
  expectedCatalogVersion: number,
  dependencies: ArtworkImportDependencies,
): Promise<{ artworkIds: string[]; catalogVersion: number; reused: number; uploaded: number }> {
  if ((await catalogVersion(dependencies.database)) !== expectedCatalogVersion) {
    throw new ImportRequestError(409, "catalog_conflict");
  }
  const now = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + Math.min(55_000, dependencies.jobDeadlineMs ?? DEFAULT_JOB_DEADLINE_MS);
  const expectations = new Map<
    string,
    { full: ArtworkArtifactExpectation; thumbnail: ArtworkArtifactExpectation }
  >();
  let totalBytes = 0;
  let uploaded = 0;
  let reused = 0;

  const assertDeadline = () => {
    if (now() >= deadline) throw new ImportRequestError(504, "import_deadline_exceeded");
  };
  const boundedSleep = async (milliseconds: number) => {
    assertDeadline();
    const remaining = deadline - now();
    if (remaining <= milliseconds) throw new ImportRequestError(504, "import_deadline_exceeded");
    await sleep(milliseconds);
  };

  for (const row of batch.artworks) {
    assertDeadline();
    const full = await artworkArtifactExpectation({
      artworkId: row.id,
      variant: "full",
      upstreamUrl: row.artifacts.full.url,
      sourceVersion: row.artifacts.full.version,
    });
    const thumbnail = await artworkArtifactExpectation({
      artworkId: row.id,
      variant: "thumbnail",
      upstreamUrl: row.artifacts.thumbnail.url,
      sourceVersion: row.artifacts.thumbnail.version,
    });
    expectations.set(row.id, { full, thumbnail });

    for (const expectation of [full, thumbnail]) {
      const existing = await headArtifact(dependencies.bucket, expectation);
      if (storedArtworkArtifactMatches(existing, expectation)) {
        reused += 1;
        continue;
      }
      const remaining = deadline - now();
      if (remaining <= 0) throw new ImportRequestError(504, "import_deadline_exceeded");
      const bytes = await downloadArtworkArtifact(expectation, {
        attemptTimeoutMs: Math.min(20_000, remaining),
        beforeAttempt: async () => assertDeadline(),
        fetcher: dependencies.fetcher,
        sleep: boundedSleep,
      });
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_TOTAL_ARTIFACT_BYTES) {
        throw new ImportRequestError(413, "artifact_batch_too_large");
      }
      await putArtifact(dependencies.bucket, expectation, bytes);
      const stored = await headArtifact(dependencies.bucket, expectation);
      if (!storedArtworkArtifactMatches(stored, expectation) || stored?.size !== bytes.byteLength) {
        throw new ImportRequestError(503, "artifact_verification_failed");
      }
      uploaded += 1;
    }
  }

  assertDeadline();
  try {
    await dependencies.database.batch(
      databaseStatements(dependencies.database, batch, expectations, now(), expectedCatalogVersion),
    );
  } catch (error) {
    if (isCatalogGuardFailure(error)) {
      throw new ImportRequestError(409, "catalog_conflict");
    }
    throw isDatabaseConstraintFailure(error)
      ? new ImportRequestError(409, "database_conflict")
      : new ImportRequestError(503, "database_unavailable");
  }
  return {
    artworkIds: batch.artworks.map((row) => row.id),
    catalogVersion: expectedCatalogVersion + 1,
    uploaded,
    reused,
  };
}

export async function handleArtworkImportRequest(
  request: Request,
  dependencies: ArtworkImportDependencies,
): Promise<Response> {
  try {
    if (new URL(request.url).pathname !== IMPORT_ROUTE || request.method !== "POST") {
      return new Response(null, { status: 404 });
    }
    await authorize(request, dependencies.secret);
    const parsed = artworkImportRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ImportRequestError(422, "invalid_batch");
    const result = await importBatch(
      parsed.data.batch,
      parsed.data.expectedCatalogVersion,
      dependencies,
    );
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ImportRequestError) {
      return Response.json({ error: error.code }, { status: error.status });
    }
    if (error instanceof PermanentArtifactDownloadError) {
      return Response.json({ error: "artifact_download_failed" }, { status: 422 });
    }
    if (error instanceof TransientArtifactDownloadError) {
      return Response.json({ error: "artifact_upstream_unavailable" }, { status: 502 });
    }
    console.error("Artwork import failed", error);
    return Response.json({ error: "import_failed" }, { status: 500 });
  }
}
