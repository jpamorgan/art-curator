import { createAuth } from "@art/auth";
import { createDb } from "@art/db";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const db = createDb();
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
          getByIds(ids: string[]): Promise<{ id: string; values: number[] }[]>;
        };
      }
    ).ARTWORK_VECTORS,
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
