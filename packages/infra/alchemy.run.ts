import alchemy from "alchemy";
import { D1Database, R2Bucket, TanStackStart, Worker } from "alchemy/cloudflare";
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

const db = await D1Database("database", {
  migrationsDir: "../../packages/db/src/migrations",
});
const artworkBucket = await R2Bucket(ARTWORK_BUCKET_RESOURCE_ID, artworkBucketProps(app.stage));

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  url: true,
  domains: app.local ? undefined : ["api.art.jpamorgan.com"],
  bindings: {
    DB: db,
    ARTWORKS: artworkBucket,
    ART_IMPORT_SECRET: alchemy.secret.env.ART_IMPORT_SECRET!,
    CORS_ORIGIN: webOrigin,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: apiOrigin,
  },
  dev: {
    port: 3000,
  },
});

async function syncSeedArtifacts(serverUrl: string, secret: string) {
  const total = { uploaded: 0, skipped: 0, objects: 0 };
  for (let offset = 0; offset < 48; offset += 6) {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const url = new URL("/internal/artifact-sync", serverUrl);
        url.searchParams.set("offset", String(offset));
        response = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}` },
        });
        if (response.ok || (response.status < 500 && response.status !== 429)) break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    if (!response?.ok) {
      throw new Error(
        `Seed artifact sync failed at offset ${offset} with HTTP ${response?.status}.`,
      );
    }
    const result = (await response.json()) as {
      total: number;
      uploaded: number;
      skipped: number;
      nextOffset: number | null;
    };
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
