/// <reference types="@cloudflare/workers-types" />

// Keep runtime binding types independent from infrastructure implementation imports. This avoids
// a package cycle while Alchemy still validates the concrete bindings at the deployment boundary.
export interface CloudflareEnv {
  DB: D1Database;
  ARTWORKS: R2Bucket;
  ART_IMPORT_SECRET: string;
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
