import { createContext } from "@art/api/context";
import { appRouter } from "@art/api/routers/index";
import { createAuth } from "@art/auth";
import { authSecurityOptions } from "@art/auth/security-options";
import { createDb } from "@art/db";
import { resolveEnrichmentModelConfig } from "@art/env/enrichment";
import { env } from "@art/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { resolveArtworkArtifactExpectation, serveArtworkArtifact } from "./artifacts";
import { handleCatalogArtworkSearchRequest } from "./catalog";
import { handleArtworkWriteRequest } from "./artworks";
import {
  handleEnrichmentBackfillRequest,
  handleEnrichmentIndexReadinessRequest,
  handleEnrichmentQueue,
  handleEnrichmentStatusRequest,
  type EnrichmentJob,
} from "./enrichment";
import { createEnrichmentProvider } from "./enrichment-provider";
import { handleSeedArtifactSyncRequest } from "./seed-artifacts";
import { favoriteMutationGuard, mutationOriginGuard } from "./security";
import {
  handleCreateSubmissionRequest,
  handleListSubmissionsRequest,
  handleRemoveSubmissionRequest,
} from "./submissions";

const app = new Hono();
const enrichmentConfig = resolveEnrichmentModelConfig({
  ENRICHMENT_PROVIDER: env.ENRICHMENT_PROVIDER,
  ENRICHMENT_VISION_MODEL: env.ENRICHMENT_VISION_MODEL,
  ENRICHMENT_EMBEDDING_MODEL: env.ENRICHMENT_EMBEDDING_MODEL,
  ENRICHMENT_PROMPT_VERSION: env.ENRICHMENT_PROMPT_VERSION,
});
app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["GET", "HEAD"], "/artifacts/:artworkId/:filename", (c) => {
  const db = createDb();
  return serveArtworkArtifact(
    c.req.raw,
    {
      artworkId: c.req.param("artworkId"),
      filename: c.req.param("filename"),
    },
    {
      bucket: env.ARTWORKS,
      resolveExpectation: (artworkId, variant) =>
        resolveArtworkArtifactExpectation(db, artworkId, variant),
    },
  );
});

app.post("/internal/artworks", (c) =>
  handleArtworkWriteRequest(c.req.raw, {
    bucket: env.ARTWORKS,
    database: env.DB,
    enrichmentConfig,
    enrichmentQueue: env.ENRICHMENT_QUEUE,
    secret: env.ART_IMPORT_SECRET,
  }),
);
app.post("/internal/enrichment/backfill", (c) =>
  handleEnrichmentBackfillRequest(c.req.raw, {
    config: enrichmentConfig,
    database: env.DB,
    queue: env.ENRICHMENT_QUEUE,
    secret: env.ART_IMPORT_SECRET,
  }),
);
app.get("/internal/enrichment/status", (c) =>
  handleEnrichmentStatusRequest(c.req.raw, {
    config: enrichmentConfig,
    database: env.DB,
    secret: env.ART_IMPORT_SECRET,
    vectorIndex: env.ARTWORK_VECTORS,
  }),
);
app.get("/internal/enrichment/index-ready", (c) =>
  handleEnrichmentIndexReadinessRequest(c.req.raw, {
    config: enrichmentConfig,
    secret: env.ART_IMPORT_SECRET,
    vectorIndex: env.ARTWORK_VECTORS,
  }),
);
app.post("/internal/artifact-sync", (c) =>
  handleSeedArtifactSyncRequest(c.req.raw, {
    bucket: env.ARTWORKS,
    secret: env.ART_IMPORT_SECRET,
  }),
);

const guardSubmissionMutation = mutationOriginGuard(authSecurityOptions(env).trustedOrigins);
app.use("/submissions", guardSubmissionMutation);
app.post("/submissions", (c) =>
  handleCreateSubmissionRequest(c.req.raw, {
    database: env.DB,
  }),
);
app.get("/internal/inbox", (c) =>
  handleListSubmissionsRequest(c.req.raw, {
    database: env.DB,
    secret: env.ART_IMPORT_SECRET,
  }),
);
app.delete("/internal/inbox/:id", (c) =>
  handleRemoveSubmissionRequest(c.req.raw, c.req.param("id"), {
    database: env.DB,
    secret: env.ART_IMPORT_SECRET,
  }),
);
app.get("/internal/artworks", (c) =>
  handleCatalogArtworkSearchRequest(c.req.raw, {
    database: env.DB,
    secret: env.ART_IMPORT_SECRET,
  }),
);

const guardFavoriteMutation = favoriteMutationGuard(authSecurityOptions(env).trustedOrigins);
for (const path of [
  "/rpc/favorites/toggle",
  "/api-reference/favorites/toggle",
  "/rpc/following/toggle",
  "/api-reference/following/toggle",
  "/rpc/recommendations/setHidden",
  "/api-reference/recommendations/setHidden",
])
  app.use(path, guardFavoriteMutation);

app.on(["POST", "GET"], "/api/auth/*", (c) => createAuth().handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

export default {
  fetch: app.fetch,
  queue(batch: MessageBatch<EnrichmentJob>) {
    return handleEnrichmentQueue(batch, {
      analytics: env.RECOMMENDATION_ANALYTICS,
      bucket: env.ARTWORKS,
      database: env.DB,
      provider: createEnrichmentProvider({
        config: enrichmentConfig,
        workersAi: env.AI,
        openAiApiKey: env.OPENAI_API_KEY,
      }),
      vectorIndex: env.ARTWORK_VECTORS,
    });
  },
};
