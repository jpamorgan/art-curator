import { describe, expect, test } from "bun:test";

describe("Worker module startup", () => {
  test("does not read the Workers AI binding until a queue event runs", async () => {
    const moduleUrl = new URL("./index.ts", import.meta.url).href;
    const script = `
      import { mock } from "bun:test";
      mock.module("cloudflare:workers", () => ({
        env: {
          ENRICHMENT_PROVIDER: "cloudflare",
          ENRICHMENT_VISION_MODEL: "vision",
          ENRICHMENT_EMBEDDING_MODEL: "embedding",
          ENRICHMENT_PROMPT_VERSION: "v1",
          CORS_ORIGIN: "http://localhost:3001",
          BETTER_AUTH_URL: "http://localhost:3000",
          BETTER_AUTH_SECRET: "test-secret"
        }
      }));
      await import(${JSON.stringify(moduleUrl)});
      console.log("worker-loaded");
    `;
    const child = Bun.spawn([process.execPath, "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("worker-loaded");
  });
});
