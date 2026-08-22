import { createContext } from "@art/api/context";
import { listArtworkCards } from "@art/api/routers/art";
import { appRouter } from "@art/api/routers/index";
import {
  createAuth,
  getOAuthAuthorizationServerMetadata,
  getOpenIdConfiguration,
  recordAgentAccessTokenRevocation,
  verifyAgentAccessToken,
  verifyOAuthAccessTokenNotRevoked,
} from "@art/auth";
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
import { ART_A2A_AGENT_CARD, createArtA2ARuntime } from "./a2a";
import { D1A2ATaskStore } from "./a2a-task-store";
import {
  handleAgentCatalogRequest,
  handleAgentIdentityRegistrationRequest,
  handleAgentOAuthRevocationRequest,
  handleAuthorizationServerMetadataRequest,
  handleOAuthIntrospectionRequest,
  handleOAuthUserInfoRequest,
  handleProtectedResourceMetadataRequest,
  hardenAuthResponse,
} from "./agent-auth";
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
import { handleMcpRequest } from "./mcp";
import { handleMcpHttpDiscoveryRequest } from "./mcp-http-discovery";
import { handleSeedArtifactSyncRequest } from "./seed-artifacts";
import { favoriteMutationGuard, mcpOriginGuard, mutationOriginGuard } from "./security";
import {
  handleCreateSubmissionRequest,
  handleListSubmissionsRequest,
  handleRemoveSubmissionRequest,
} from "./submissions";

export const app = new Hono();
const enrichmentConfig = resolveEnrichmentModelConfig({
  ENRICHMENT_PROVIDER: env.ENRICHMENT_PROVIDER,
  ENRICHMENT_VISION_MODEL: env.ENRICHMENT_VISION_MODEL,
  ENRICHMENT_EMBEDDING_MODEL: env.ENRICHMENT_EMBEDDING_MODEL,
  ENRICHMENT_PROMPT_VERSION: env.ENRICHMENT_PROMPT_VERSION,
});
const security = authSecurityOptions(env);
app.use(logger());
app.use("/mcp", mcpOriginGuard(security.trustedOrigins));
app.use("/a2a", mcpOriginGuard(security.trustedOrigins));
const corsOptions = {
  origin: security.trustedOrigins,
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "MCP-Protocol-Version",
    "Mcp-Session-Id",
    "Last-Event-ID",
    "A2A-Version",
  ],
  exposeHeaders: ["MCP-Protocol-Version", "Mcp-Session-Id", "A2A-Version"],
  credentials: true,
};
const defaultCors = cors({
  ...corsOptions,
  allowMethods: ["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
});
const mcpCors = cors({
  ...corsOptions,
  credentials: false,
  allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
});
const publicAgentCors = cors({
  ...corsOptions,
  origin: "*",
  credentials: false,
  allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
});
app.use("/*", (context, next) => {
  const path = context.req.path;
  if (path === "/mcp" || path === "/a2a") return mcpCors(context, next);
  if (path.startsWith("/.well-known/") || path.startsWith("/agent/")) {
    return publicAgentCors(context, next);
  }
  return defaultCors(context, next);
});

app.post("/mcp", (c) =>
  handleMcpRequest(c.req.raw, {
    assetOrigin: env.BETTER_AUTH_URL,
    async browseArt(input) {
      const page = await listArtworkCards(createDb(), {
        limit: input.limit,
        sort: input.sort,
        category: input.category,
        style: input.style,
        gallery: input.gallery,
        artist: input.artist,
      });
      return page.items.map((artwork) => ({
        slug: artwork.slug,
        title: artwork.title,
        artist: artwork.artist,
        date: artwork.date,
        gallery: artwork.gallery,
        category: artwork.category,
        styles: artwork.styles.map((style) => style.name),
        url: new URL(`/art/${artwork.slug}`, "https://art.jpamorgan.com").href,
        thumbnailUrl: artwork.thumbnailUrl,
        alt: artwork.alt,
      }));
    },
  }),
);
app.on(["GET", "HEAD", "DELETE"], "/mcp", (c) => handleMcpHttpDiscoveryRequest(c.req.raw));

const a2a = createArtA2ARuntime(
  {
    async browseArt(input, signal) {
      signal.throwIfAborted();
      const page = await listArtworkCards(createDb(), {
        limit: input.limit,
        sort: input.sort,
        category: input.category,
        style: input.style,
        gallery: input.gallery,
        artist: input.artist,
      });
      signal.throwIfAborted();
      return page.items.map((artwork) => ({
        title: artwork.title,
        artist: artwork.artist,
        date: artwork.date,
        gallery: artwork.gallery,
        url: new URL(`/art/${artwork.slug}`, "https://art.jpamorgan.com").href,
      }));
    },
    onError(error) {
      console.error("A2A catalog request failed", error);
    },
  },
  {
    taskStore: new D1A2ATaskStore(env.DB),
    // Cloudflare Workers cannot promise background execution after the response.
    // Blocking and streaming requests remain supported and persist every task in D1.
    allowReturnImmediately: false,
    allowCancellation: false,
  },
);

app.on(["GET", "HEAD", "POST", "OPTIONS"], "/a2a", (c) => a2a.handleRequest(c.req.raw));
app.on(
  ["GET", "HEAD"],
  "/.well-known/agent-card.json",
  (c) =>
    new Response(c.req.method === "HEAD" ? null : JSON.stringify(ART_A2A_AGENT_CARD), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "Content-Type": "application/a2a-agent-card+json; charset=utf-8",
      },
    }),
);

for (const path of [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/agent/catalog",
]) {
  app.on(["GET", "HEAD"], path, (c) => handleProtectedResourceMetadataRequest(c.req.raw, env));
}
app.on(["GET", "HEAD"], "/.well-known/oauth-authorization-server", (c) =>
  handleAuthorizationServerMetadataRequest(c.req.raw, env, getOAuthAuthorizationServerMetadata),
);
app.on(["GET", "HEAD"], "/.well-known/openid-configuration", async (c) => {
  const metadataRequest =
    c.req.method === "HEAD" ? new Request(c.req.url, { headers: c.req.raw.headers }) : c.req.raw;
  const response = await getOpenIdConfiguration(metadataRequest);
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(c.req.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
app.post("/agent/identity", (c) =>
  handleAgentIdentityRegistrationRequest(c.req.raw, {
    environment: env,
    trustedOrigins: security.trustedOrigins,
    register: (request) => createAuth().handler(request),
  }),
);
app.on(["GET", "HEAD"], "/agent/catalog", (c) =>
  handleAgentCatalogRequest(c.req.raw, {
    environment: env,
    verifyAccessToken: verifyAgentAccessToken,
    async browseArt(input) {
      const page = await listArtworkCards(createDb(), input);
      return {
        items: page.items.map((artwork) => ({
          slug: artwork.slug,
          title: artwork.title,
          artist: artwork.artist,
          date: artwork.date,
          gallery: artwork.gallery,
          category: artwork.category,
          styles: artwork.styles,
          url: new URL(`/art/${artwork.slug}`, "https://art.jpamorgan.com").href,
          thumbnailUrl: artwork.thumbnailUrl,
          alt: artwork.alt,
        })),
        nextCursor: page.nextCursor,
      };
    },
  }),
);

app.post("/api/auth/oauth2/revoke", (c) =>
  handleAgentOAuthRevocationRequest(c.req.raw, {
    revoke: (request) => createAuth().handler(request),
    recordAccessTokenRevocation: recordAgentAccessTokenRevocation,
  }),
);
app.on(["GET", "POST"], "/api/auth/oauth2/userinfo", (c) =>
  handleOAuthUserInfoRequest(c.req.raw, {
    userInfo: (request) => createAuth().handler(request),
    verifyAccessTokenNotRevoked: verifyOAuthAccessTokenNotRevoked,
  }),
);
app.post("/api/auth/oauth2/introspect", (c) =>
  handleOAuthIntrospectionRequest(c.req.raw, {
    introspect: (request) => createAuth().handler(request),
    verifyAccessTokenNotRevoked: verifyOAuthAccessTokenNotRevoked,
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

const guardSubmissionMutation = mutationOriginGuard(security.trustedOrigins);
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

const guardFavoriteMutation = favoriteMutationGuard(security.trustedOrigins);
for (const path of [
  "/rpc/favorites/toggle",
  "/api-reference/favorites/toggle",
  "/rpc/following/toggle",
  "/api-reference/following/toggle",
  "/rpc/recommendations/setHidden",
  "/api-reference/recommendations/setHidden",
])
  app.use(path, guardFavoriteMutation);

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  return hardenAuthResponse(await createAuth().handler(c.req.raw));
});

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
