import alchemy from "alchemy";
import { ENRICHMENT_EMBEDDING_DIMENSIONS, resolveEnrichmentModelConfig } from "@art/env/enrichment";
import {
  Ai,
  AnalyticsEngineDataset,
  D1Database,
  Queue,
  R2Bucket,
  TanStackStart,
  VectorizeIndex,
  VectorizeMetadataIndex,
  Worker,
} from "alchemy/cloudflare";
import { config } from "dotenv";

import {
  ARTWORK_BUCKET_RESOURCE_ID,
  artworkBucketName,
  artworkBucketProps,
} from "./src/artwork-bucket";
config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("art");

const webOrigin = app.local ? "http://localhost:3001" : "https://art.jpamorgan.com";
const apiOrigin = app.local ? "http://localhost:3000" : "https://api.art.jpamorgan.com";
const enrichmentConfig = resolveEnrichmentModelConfig(process.env);

const db = await D1Database("database", {
  migrationsDir: "../../packages/db/src/migrations",
});
const artworkBucket = await R2Bucket(ARTWORK_BUCKET_RESOURCE_ID, artworkBucketProps(app.stage));
const artworkVectors = await VectorizeIndex("artwork-vectors-768", {
  dimensions: ENRICHMENT_EMBEDDING_DIMENSIONS,
  metric: "cosine",
});
await Promise.all(
  (
    [
      ["galleryId", "string"],
      ["artistId", "string"],
      ["isPublicDomain", "boolean"],
      ["embeddingGeneration", "string"],
    ] as const
  ).map(([propertyName, indexType]) =>
    VectorizeMetadataIndex(`artwork-vectors-768-${propertyName}`, {
      index: artworkVectors,
      propertyName,
      indexType,
    }),
  ),
);
const enrichmentDeadLetters = await Queue("enrichment-dead-letters", {
  settings: { messageRetentionPeriod: 1_209_600 },
});
const enrichmentQueue = await Queue<{
  artworkId: string;
  reason: "import" | "update" | "backfill";
  requestedAt: number;
}>("artwork-enrichment", {
  dlq: enrichmentDeadLetters,
  settings: { messageRetentionPeriod: 345_600 },
});
const recommendationAnalytics = AnalyticsEngineDataset("recommendation-analytics", {
  dataset: `art_recommendations_${app.stage.replace(/[^a-zA-Z0-9_]/g, "_")}`,
});
const serverBindings = {
  AI: Ai(),
  DB: db,
  ARTWORKS: artworkBucket,
  ARTWORK_VECTORS: artworkVectors,
  ENRICHMENT_QUEUE: enrichmentQueue,
  RECOMMENDATION_ANALYTICS: recommendationAnalytics,
  ART_IMPORT_SECRET: alchemy.secret.env.ART_IMPORT_SECRET!,
  ENRICHMENT_PROVIDER: enrichmentConfig.provider,
  ENRICHMENT_VISION_MODEL: enrichmentConfig.visionModel,
  ENRICHMENT_EMBEDDING_MODEL: enrichmentConfig.embeddingModel,
  ENRICHMENT_PROMPT_VERSION: enrichmentConfig.promptVersion,
  CORS_ORIGIN: webOrigin,
  BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
  BETTER_AUTH_URL: apiOrigin,
};
if (enrichmentConfig.provider === "openai")
  Object.assign(serverBindings, { OPENAI_API_KEY: alchemy.secret.env.OPENAI_API_KEY! });

async function readDeploymentJson<T>(response: Response): Promise<T> {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new Error("Deployment endpoint returned a non-JSON response.");
  const maximumBytes = 64 * 1_024;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new Error("Deployment endpoint response exceeded the size limit.");
  if (!response.body) throw new Error("Deployment endpoint returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("Deployment endpoint response exceeded the size limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)) as T;
}

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  url: true,
  domains: app.local ? undefined : ["api.art.jpamorgan.com"],
  bindings: serverBindings,
  eventSources: [
    {
      queue: enrichmentQueue,
      settings: {
        batchSize: 5,
        maxConcurrency: 3,
        maxRetries: 4,
        maxWaitTimeMs: 1_000,
        retryDelay: 30,
        deadLetterQueue: enrichmentDeadLetters,
      },
    },
  ],
  dev: {
    port: 3000,
  },
});

async function syncSeedArtifacts(serverUrl: string, secret: string) {
  const maxAttempts = 8;
  const total = { uploaded: 0, skipped: 0, objects: 0 };
  for (let offset = 0; offset < 48; offset += 6) {
    let response: Response | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const url = new URL("/internal/artifact-sync", serverUrl);
        url.searchParams.set("offset", String(offset));
        response = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(15_000),
        });
        const retryable =
          response.status === 404 || response.status === 429 || response.status >= 500;
        if (response.ok || !retryable) break;
      } catch (error) {
        if (attempt === maxAttempts - 1) throw error;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempt, 5_000)));
      }
    }
    if (!response?.ok) {
      throw new Error(
        `Seed artifact sync failed at offset ${offset} with HTTP ${response?.status}.`,
      );
    }
    const result = await readDeploymentJson<{
      total: number;
      uploaded: number;
      skipped: number;
      nextOffset: number | null;
    }>(response);
    const expectedNext = offset === 42 ? null : offset + 6;
    if (result.total !== 6 || result.nextOffset !== expectedNext) {
      throw new Error(`Seed artifact sync returned an invalid result at offset ${offset}.`);
    }
    total.uploaded += result.uploaded;
    total.skipped += result.skipped;
    total.objects += result.total;
  }
  if (total.objects !== 48 || total.uploaded + total.skipped !== 48) {
    throw new Error("Seed artifact sync did not account for all 48 curated objects.");
  }
  return total;
}

async function queueEnrichmentBackfill(serverUrl: string, secret: string) {
  let cursor: string | null = "";
  let queued = 0;
  do {
    const url = new URL("/internal/enrichment/backfill", serverUrl);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    let response: Response | undefined;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (
          response.ok ||
          (response.status !== 404 && response.status !== 429 && response.status < 500)
        )
          break;
      } catch (error) {
        if (attempt === 7) throw error;
      }
      if (attempt < 7)
        await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempt, 5_000)));
    }
    if (!response?.ok) throw new Error(`Enrichment backfill failed with HTTP ${response?.status}.`);
    const result = await readDeploymentJson<{ queued: number; nextCursor: string | null }>(
      response,
    );
    if (!Number.isInteger(result.queued) || result.queued < 0 || result.queued > 100)
      throw new Error("Enrichment backfill returned an invalid result.");
    queued += result.queued;
    cursor = result.nextCursor;
  } while (cursor);
  return queued;
}

async function waitForVectorMetadataIndexes(serverUrl: string, secret: string) {
  const deadline = Date.now() + 2 * 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/internal/enrichment/index-ready", serverUrl), {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const status = await readDeploymentJson<{
          ready: boolean;
          provider: string;
          vectorGeneration: string;
        }>(response);
        if (
          status.ready === true &&
          status.provider === enrichmentConfig.provider &&
          status.vectorGeneration === enrichmentConfig.vectorGeneration
        )
          return;
      }
    } catch {
      // The new Worker or metadata index can be briefly unavailable after creation.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("The Vectorize metadata indexes did not become ready.");
}

async function waitForEnrichmentReadiness(serverUrl: string, secret: string) {
  const deadline = Date.now() + 12 * 60_000;
  let lastStatus = "unavailable";
  let nextLogAt = 0;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/internal/enrichment/status", serverUrl), {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const status = await readDeploymentJson<{
          total: number;
          ready: number;
          failed: number;
          pending: number;
          missing: number;
          verified: number;
          provider: string;
          vectorGeneration: string;
        }>(response);
        const values = [
          status.total,
          status.ready,
          status.failed,
          status.pending,
          status.missing,
          status.verified,
        ];
        if (
          values.every((value) => Number.isInteger(value) && value >= 0) &&
          status.provider === enrichmentConfig.provider &&
          status.vectorGeneration === enrichmentConfig.vectorGeneration
        ) {
          lastStatus = `${status.ready}/${status.total} ready, ${status.verified} vectors verified, ${status.pending} pending, ${status.failed} failed, ${status.missing} missing`;
          if (
            status.ready === status.total &&
            status.verified === status.total &&
            status.pending === 0 &&
            status.failed === 0 &&
            status.missing === 0
          )
            return status;
          if (Date.now() >= nextLogAt) {
            console.log(`Enrichment readiness -> ${lastStatus}`);
            nextLogAt = Date.now() + 30_000;
          }
        }
      }
    } catch {
      // A newly published worker may briefly be unavailable; the bounded deadline remains final.
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(
    `Enrichment did not become ready before the deployment deadline (${lastStatus}).`,
  );
}

if (app.phase === "up") {
  const importSecret = process.env.ART_IMPORT_SECRET;
  if (!importSecret || importSecret.length < 32) {
    throw new Error("ART_IMPORT_SECRET must be configured before artifact synchronization.");
  }
  if (!server.url) throw new Error("Server URL is unavailable for artifact synchronization.");
  const result = await syncSeedArtifacts(server.url, importSecret);
  console.log(
    `Artifacts -> ${artworkBucketName(app.stage)} (${result.uploaded} uploaded, ${result.skipped} unchanged)`,
  );
  if (!app.local) {
    await waitForVectorMetadataIndexes(server.url, importSecret);
    const queued = await queueEnrichmentBackfill(server.url, importSecret);
    console.log(
      `Enrichment -> ${artworkVectors.name} (${enrichmentConfig.provider}, ${enrichmentConfig.vectorGeneration}, ${queued} queued)`,
    );
    await waitForEnrichmentReadiness(server.url, importSecret);
  }
}

export const web = await TanStackStart("web", {
  cwd: "../../apps/web",
  domains: app.local ? undefined : ["art.jpamorgan.com"],
  bindings: {
    VITE_SERVER_URL: apiOrigin,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
