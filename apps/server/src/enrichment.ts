import { z } from "zod";

import { authorizeInternalJob } from "./internal-job-auth";

export const ENRICHMENT_EMBEDDING_DIMENSIONS = 512;
export const DEFAULT_VISION_MODEL = "gpt-5.4-mini-2026-03-17";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_PROMPT_VERSION = "artwork-facets-v1";

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
  embeddingModel?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  openAiApiKey: string;
  promptVersion?: string;
  requestTimeoutMs?: number;
  vectorIndex: EnrichmentVectorIndex;
  visionModel?: string;
};

const facetsSchema = z
  .object({
    palette: z.array(z.string().trim().min(1).max(80)).max(8),
    temperature: z.enum(["warm", "cool", "neutral", "mixed"]),
    brightness: z.enum(["dark", "mid-tone", "bright", "mixed"]),
    subjects: z.array(z.string().trim().min(1).max(100)).max(12),
    setting: z.array(z.string().trim().min(1).max(100)).max(8),
    mood: z.array(z.string().trim().min(1).max(100)).max(8),
    composition: z.array(z.string().trim().min(1).max(100)).max(8),
    textureAndMarkMaking: z.array(z.string().trim().min(1).max(100)).max(8),
    abstraction: z.enum(["representational", "semi-abstract", "abstract", "non-objective"]),
    visualDensity: z.enum(["sparse", "moderate", "dense"]),
    motifs: z.array(z.string().trim().min(1).max(100)).max(12),
    visualDescription: z.string().trim().min(1).max(800),
  })
  .strict();

export type VisualFacets = z.infer<typeof facetsSchema>;

const visualFacetJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "palette",
    "temperature",
    "brightness",
    "subjects",
    "setting",
    "mood",
    "composition",
    "textureAndMarkMaking",
    "abstraction",
    "visualDensity",
    "motifs",
    "visualDescription",
  ],
  properties: {
    palette: { type: "array", items: { type: "string" }, maxItems: 8 },
    temperature: { type: "string", enum: ["warm", "cool", "neutral", "mixed"] },
    brightness: { type: "string", enum: ["dark", "mid-tone", "bright", "mixed"] },
    subjects: { type: "array", items: { type: "string" }, maxItems: 12 },
    setting: { type: "array", items: { type: "string" }, maxItems: 8 },
    mood: { type: "array", items: { type: "string" }, maxItems: 8 },
    composition: { type: "array", items: { type: "string" }, maxItems: 8 },
    textureAndMarkMaking: { type: "array", items: { type: "string" }, maxItems: 8 },
    abstraction: {
      type: "string",
      enum: ["representational", "semi-abstract", "abstract", "non-objective"],
    },
    visualDensity: { type: "string", enum: ["sparse", "moderate", "dense"] },
    motifs: { type: "array", items: { type: "string" }, maxItems: 12 },
    visualDescription: { type: "string", maxLength: 800 },
  },
} as const;

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
    ["Description", artwork.description],
    ["Alt text", artwork.alt],
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
  return fields
    .map(([label, value]) => `${label}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n");
}

async function inputFingerprint(
  artwork: ArtworkForEnrichment,
  sourceMode: "image" | "metadata",
  visionModel: string,
  embeddingModel: string,
  promptVersion: string,
) {
  return sha256(
    stableJson({
      alt: artwork.alt,
      artist: artwork.artist,
      categories: parseSlugList(artwork.categorySlugs),
      dateDisplay: artwork.dateDisplay,
      description: artwork.description,
      embeddingDimensions: ENRICHMENT_EMBEDDING_DIMENSIONS,
      embeddingModel,
      galleryId: artwork.galleryId,
      medium: artwork.medium,
      promptVersion,
      sourceMode,
      styles: parseSlugList(artwork.styleSlugs),
      thumbnailFingerprint: sourceMode === "image" ? artwork.thumbnailFingerprint : null,
      title: artwork.title,
      visionModel: sourceMode === "image" ? visionModel : null,
    }),
  );
}

function extractResponseText(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  for (const output of response.output ?? [])
    for (const content of output.content ?? [])
      if (content.type === "output_text" && content.text) return content.text;
  throw new Error("OpenAI response did not contain structured output.");
}

async function openAiRequest(path: string, body: unknown, dependencies: EnrichmentDependencies) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.requestTimeoutMs ?? 60_000);
  try {
    const response = await (dependencies.fetcher ?? fetch)(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dependencies.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI ${path} failed with HTTP ${response.status}.`);
    const maximumBytes = 2 * 1_024 * 1_024;
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
      throw new Error(`OpenAI ${path} response exceeded the size limit.`);
    if (!response.body) throw new Error(`OpenAI ${path} returned an empty response.`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error(`OpenAI ${path} response exceeded the size limit.`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } finally {
    clearTimeout(timeout);
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

async function analyzeThumbnail(
  artwork: ArtworkForEnrichment,
  dependencies: EnrichmentDependencies,
  visionModel: string,
) {
  const object = await dependencies.bucket.get(artwork.thumbnailR2Key);
  if (!object) throw new Error("Artwork thumbnail is missing from R2.");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength > 2 * 1_024 * 1_024)
    throw new Error("Artwork thumbnail exceeded the size limit.");
  const payload = await openAiRequest(
    "responses",
    {
      model: visionModel,
      store: false,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyze only visible qualities useful for finding aesthetically similar artwork. Do not guess identity or provenance. Trusted catalog metadata: ${stableJson({ title: artwork.title, artist: artwork.artist, medium: artwork.medium, date: artwork.dateDisplay })}`,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${bytesToBase64(bytes)}`,
              detail: "low",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "artwork_visual_facets",
          strict: true,
          schema: visualFacetJsonSchema,
        },
      },
    },
    dependencies,
  );
  return facetsSchema.parse(JSON.parse(extractResponseText(payload)));
}

async function embedText(
  canonicalText: string,
  dependencies: EnrichmentDependencies,
  embeddingModel: string,
) {
  const payload = (await openAiRequest(
    "embeddings",
    {
      model: embeddingModel,
      input: canonicalText,
      dimensions: ENRICHMENT_EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    },
    dependencies,
  )) as { data?: Array<{ embedding?: number[] }> };
  const embedding = payload.data?.[0]?.embedding;
  if (
    !embedding ||
    embedding.length !== ENRICHMENT_EMBEDDING_DIMENSIONS ||
    embedding.some((value) => !Number.isFinite(value))
  )
    throw new Error("OpenAI returned an invalid embedding.");
  return embedding;
}

async function markProcessing(
  database: EnrichmentDatabase,
  artworkId: string,
  sourceMode: "image" | "metadata",
  fingerprint: string,
  visionModel: string,
  embeddingModel: string,
  promptVersion: string,
  now: number,
) {
  await prepared(
    database,
    `INSERT INTO artwork_enrichment
      (artwork_id,status,source_mode,provider,vision_model,embedding_model,embedding_dimensions,
       prompt_version,content_fingerprint,canonical_text,visual_facets,attempts,last_error,queued_at,updated_at)
      VALUES (?,'processing',?,'openai',?,?,512,?,?,'','{}',1,NULL,?,?)
      ON CONFLICT(artwork_id) DO UPDATE SET
        status='processing', source_mode=excluded.source_mode, provider='openai',
        vision_model=excluded.vision_model, embedding_model=excluded.embedding_model,
        embedding_dimensions=512, prompt_version=excluded.prompt_version,
        canonical_text=CASE WHEN artwork_enrichment.content_fingerprint=excluded.content_fingerprint
          THEN artwork_enrichment.canonical_text ELSE '' END,
        visual_facets=CASE WHEN artwork_enrichment.content_fingerprint=excluded.content_fingerprint
          THEN artwork_enrichment.visual_facets ELSE '{}' END,
        content_fingerprint=excluded.content_fingerprint,
        attempts=artwork_enrichment.attempts+1,
        last_error=NULL, queued_at=excluded.queued_at, updated_at=excluded.updated_at`,
    [artworkId, sourceMode, visionModel, embeddingModel, promptVersion, fingerprint, now, now],
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
  const visionModel = dependencies.visionModel ?? DEFAULT_VISION_MODEL;
  const embeddingModel = dependencies.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  const promptVersion = dependencies.promptVersion ?? DEFAULT_PROMPT_VERSION;
  const fingerprint = await inputFingerprint(
    artwork,
    sourceMode,
    visionModel,
    embeddingModel,
    promptVersion,
  );
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
    if (vectors[0]?.values.length === ENRICHMENT_EMBEDDING_DIMENSIONS) {
      await prepared(
        dependencies.database,
        "UPDATE artwork_enrichment SET status='ready', last_error=NULL, updated_at=? WHERE artwork_id=?",
        [dependencies.now?.() ?? Date.now(), artworkId],
      ).run();
      return { outcome: "unchanged" as const, fingerprint, sourceMode };
    }
  }

  const now = dependencies.now?.() ?? Date.now();
  await markProcessing(
    dependencies.database,
    artworkId,
    sourceMode,
    fingerprint,
    visionModel,
    embeddingModel,
    promptVersion,
    now,
  );
  try {
    let facets: VisualFacets | null = null;
    let canonicalText = "";
    if (existing?.fingerprint === fingerprint && existing.canonicalText) {
      canonicalText = existing.canonicalText;
      if (sourceMode === "image") facets = facetsSchema.parse(JSON.parse(existing.visualFacets));
    } else {
      facets =
        sourceMode === "image" ? await analyzeThumbnail(artwork, dependencies, visionModel) : null;
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
    const vector = await embedText(canonicalText, dependencies, embeddingModel);
    const metadata: VectorizeVectorMetadata = {
      galleryId: artwork.galleryId,
      isPublicDomain: Boolean(artwork.isPublicDomain),
      categorySlugs: parseSlugList(artwork.categorySlugs),
      styleSlugs: parseSlugList(artwork.styleSlugs),
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
      `UPDATE artwork_enrichment SET status='ready', source_mode=?, provider='openai', vision_model=?,
        embedding_model=?, embedding_dimensions=512, prompt_version=?, content_fingerprint=?,
        canonical_text=?, visual_facets=?, last_error=NULL, vector_mutation_id=?, processed_at=?, updated_at=?
       WHERE artwork_id=?`,
      [
        sourceMode,
        visionModel,
        embeddingModel,
        promptVersion,
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
      blobs: ["enrichment_ready", sourceMode, visionModel, embeddingModel],
      doubles: [completedAt - now],
      indexes: [artworkId],
    });
    return { outcome: "ready" as const, fingerprint, sourceMode };
  } catch (error) {
    const failedAt = dependencies.now?.() ?? Date.now();
    await prepared(
      dependencies.database,
      "UPDATE artwork_enrichment SET status='failed', last_error=?, updated_at=? WHERE artwork_id=?",
      [errorSummary(error), failedAt, artworkId],
    ).run();
    dependencies.analytics?.writeDataPoint({
      blobs: ["enrichment_failed", sourceMode, visionModel, embeddingModel],
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
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        await enrichArtwork(message.body.artworkId, dependencies);
        message.ack();
      } catch (error) {
        console.error("Artwork enrichment failed", {
          artworkId: message.body.artworkId,
          error: errorSummary(error),
        });
        message.retry({ delaySeconds: 30 });
      }
    }),
  );
}

export async function handleEnrichmentBackfillRequest(
  request: Request,
  dependencies: {
    database: EnrichmentDatabase;
    embeddingModel?: string;
    promptVersion?: string;
    queue: EnrichmentQueue;
    secret: string;
    now?: () => number;
    visionModel?: string;
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
         'openai',?,?,512,?,'','','{}',0,NULL,?,?
       FROM artwork a WHERE a.id > ? ORDER BY a.id LIMIT ?
       ON CONFLICT(artwork_id) DO UPDATE SET status='pending', source_mode=excluded.source_mode,
         provider='openai', vision_model=excluded.vision_model,
         embedding_model=excluded.embedding_model, embedding_dimensions=512,
         prompt_version=excluded.prompt_version, last_error=NULL,
         queued_at=excluded.queued_at, updated_at=excluded.updated_at`,
      [
        dependencies.visionModel ?? DEFAULT_VISION_MODEL,
        dependencies.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
        dependencies.promptVersion ?? DEFAULT_PROMPT_VERSION,
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
    `SELECT COUNT(a.id) AS total,
      SUM(CASE WHEN ae.status='ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN ae.status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN ae.status IN ('pending','processing') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN ae.artwork_id IS NULL THEN 1 ELSE 0 END) AS missing
     FROM artwork a LEFT JOIN artwork_enrichment ae ON ae.artwork_id=a.id`,
  ).first<{ total: number; ready: number; failed: number; pending: number; missing: number }>();
  let verified = 0;
  let readyCursor = "";
  while (true) {
    const page = await prepared(
      dependencies.database,
      `SELECT artwork_id AS id FROM artwork_enrichment
       WHERE status='ready' AND artwork_id > ? ORDER BY artwork_id LIMIT 1000`,
      [readyCursor],
    ).all<{ id: string }>();
    for (let offset = 0; offset < page.results.length; offset += 100) {
      const vectors = await dependencies.vectorIndex.getByIds(
        page.results.slice(offset, offset + 100).map(({ id }) => id),
      );
      verified += vectors.filter(
        ({ values }) => values.length === ENRICHMENT_EMBEDDING_DIMENSIONS,
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
  });
}

export async function enqueueArtworkEnrichment(
  queue: Pick<Queue<EnrichmentJob>, "send"> | undefined,
  artworkId: string,
  reason: "import" | "update",
  now = Date.now(),
  state?: {
    database: EnrichmentDatabase;
    sourceMode: "image" | "metadata";
    visionModel?: string;
    embeddingModel?: string;
    promptVersion?: string;
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
         VALUES (?,'pending',?,'openai',?,?,512,?,'','','{}',0,NULL,?,?)
         ON CONFLICT(artwork_id) DO UPDATE SET status='pending', source_mode=excluded.source_mode,
           provider='openai', vision_model=excluded.vision_model,
           embedding_model=excluded.embedding_model, embedding_dimensions=512,
           prompt_version=excluded.prompt_version, last_error=NULL,
           queued_at=excluded.queued_at, updated_at=excluded.updated_at`,
        [
          artworkId,
          state.sourceMode,
          state.visionModel ?? DEFAULT_VISION_MODEL,
          state.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
          state.promptVersion ?? DEFAULT_PROMPT_VERSION,
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
