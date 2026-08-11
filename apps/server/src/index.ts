import { createContext } from "@art/api/context";
import { appRouter } from "@art/api/routers/index";
import { createAuth } from "@art/auth";
import { authSecurityOptions } from "@art/auth/security-options";
import { createDb } from "@art/db";
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
import { handleArtworkImportRequest } from "./import-artworks";
import { handleSeedArtifactSyncRequest } from "./seed-artifacts";
import { favoriteMutationGuard } from "./security";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
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

app.post("/internal/art-import", (c) =>
  handleArtworkImportRequest(c.req.raw, {
    bucket: env.ARTWORKS,
    database: env.DB,
    secret: env.ART_IMPORT_SECRET,
  }),
);
app.post("/internal/artifact-sync", (c) =>
  handleSeedArtifactSyncRequest(c.req.raw, {
    bucket: env.ARTWORKS,
    secret: env.ART_IMPORT_SECRET,
  }),
);

const guardFavoriteMutation = favoriteMutationGuard(authSecurityOptions(env).trustedOrigins);
app.use("/rpc/favorites/toggle", guardFavoriteMutation);
app.use("/api-reference/favorites/toggle", guardFavoriteMutation);

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

export default app;
