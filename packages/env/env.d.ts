/// <reference types="@cloudflare/workers-types" />

// Keep runtime binding types independent from infrastructure implementation imports. This avoids
// a package cycle while Alchemy still validates the concrete bindings at the deployment boundary.
export interface CloudflareEnv {
  AI: Ai;
  DB: D1Database;
  ARTWORKS: R2Bucket;
  ARTWORK_VECTORS: VectorizeIndex;
  ENRICHMENT_QUEUE: Queue<{
    artworkId: string;
    reason: "import" | "update" | "backfill";
    requestedAt: number;
  }>;
  RECOMMENDATION_ANALYTICS: AnalyticsEngineDataset;
  ART_IMPORT_SECRET: string;
  OPENAI_API_KEY?: string;
  ENRICHMENT_PROVIDER: "cloudflare" | "openai";
  ENRICHMENT_VISION_MODEL: string;
  ENRICHMENT_EMBEDDING_MODEL: string;
  ENRICHMENT_PROMPT_VERSION: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
  VITE_SERVER_URL: string;
}

declare global {
  type Env = CloudflareEnv;
}

declare module "cloudflare:workers" {
  namespace Cloudflare {
    export interface Env extends CloudflareEnv {}
  }
}
