import { createAuth } from "@art/auth";
import { createDb } from "@art/db";
import { resolveEnrichmentModelConfig } from "@art/env/enrichment";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const db = createDb();
  const runtimeEnv = context.env as {
    ARTWORK_VECTORS?: unknown;
    RECOMMENDATION_ANALYTICS?: unknown;
    ENRICHMENT_PROVIDER?: string;
    ENRICHMENT_VISION_MODEL?: string;
    ENRICHMENT_EMBEDDING_MODEL?: string;
    ENRICHMENT_PROMPT_VERSION?: string;
  };
  const enrichment = resolveEnrichmentModelConfig({
    ENRICHMENT_PROVIDER: runtimeEnv.ENRICHMENT_PROVIDER,
    ENRICHMENT_VISION_MODEL: runtimeEnv.ENRICHMENT_VISION_MODEL,
    ENRICHMENT_EMBEDDING_MODEL: runtimeEnv.ENRICHMENT_EMBEDDING_MODEL,
    ENRICHMENT_PROMPT_VERSION: runtimeEnv.ENRICHMENT_PROMPT_VERSION,
  });
  const session = await createAuth(db).api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    db,
    session,
    recommendationIndex: (
      context.env as {
        ARTWORK_VECTORS?: {
          query(
            vector: number[],
            options: {
              topK: number;
              filter?: Record<string, unknown>;
              returnMetadata?: "all" | "indexed" | "none";
            },
          ): Promise<{
            matches: {
              id: string;
              score: number;
              metadata?: Record<string, unknown>;
            }[];
          }>;
          getByIds(
            ids: string[],
          ): Promise<{ id: string; values: number[]; metadata?: Record<string, unknown> }[]>;
        };
      }
    ).ARTWORK_VECTORS,
    recommendationVectorGeneration: enrichment.vectorGeneration,
    recommendationAnalytics: (
      context.env as {
        RECOMMENDATION_ANALYTICS?: {
          writeDataPoint(event: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
        };
      }
    ).RECOMMENDATION_ANALYTICS,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
