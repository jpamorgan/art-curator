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

  test("composes MCP origin policy, CORS, discovery, and transport through app.fetch", async () => {
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
      const { app } = await import(${JSON.stringify(moduleUrl)});
      const request = (method, origin, headers = {}) => {
        const requestHeaders = new Headers(headers);
        if (origin !== undefined) requestHeaders.set("Origin", origin);
        const init = { method, headers: requestHeaders };
        if (method === "POST") {
          requestHeaders.set("Accept", "application/json, text/event-stream");
          requestHeaders.set("Content-Type", "application/json");
          requestHeaders.set("MCP-Protocol-Version", "2025-11-25");
          init.body = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "routing-test", version: "1.0.0" }
            }
          });
        }
        return app.fetch(new Request("http://localhost:3000/mcp", init));
      };

      const get = await request("GET", "http://localhost:3001");
      const discovery = await get.json();
      if (get.status !== 200 || get.headers.get("allow") !== "GET, HEAD, OPTIONS, POST") {
        throw new Error("GET /mcp is not wired to discovery");
      }
      if (discovery.authentication.required !== false || discovery.capabilities.tools[0].name !== "browse_art") {
        throw new Error("GET /mcp does not describe the anonymous art tool");
      }
      const getVary = (get.headers.get("vary") ?? "").split(",").map((value) => value.trim());
      if (getVary.join(",") !== "Accept,Origin" || new Set(getVary).size !== getVary.length) {
        throw new Error("GET /mcp must compose one Accept and one Origin Vary token");
      }

      const sse = await app.fetch(new Request("http://localhost:3000/mcp", {
        headers: { Accept: "text/event-stream", Origin: "http://localhost:3001" }
      }));
      if (sse.status !== 405) {
        throw new Error("GET /mcp must not replace the unsupported MCP SSE stream with discovery JSON");
      }

      const head = await request("HEAD", "http://localhost:3001");
      if (head.status !== 200 || await head.text() !== "") {
        throw new Error("HEAD /mcp must mirror discovery headers without a body");
      }

      const options = await request("OPTIONS", "http://localhost:3001", {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,mcp-protocol-version"
      });
      const corsMethods = options.headers.get("access-control-allow-methods") ?? "";
      if (options.status !== 204 || !corsMethods.includes("HEAD") || !corsMethods.includes("POST")) {
        throw new Error("OPTIONS /mcp does not advertise its HTTP methods");
      }
      if (corsMethods.includes("DELETE")) {
        throw new Error("OPTIONS /mcp must not advertise unsupported DELETE");
      }
      if (options.headers.get("access-control-allow-origin") !== "http://localhost:3001") {
        throw new Error("OPTIONS /mcp must allow the exact trusted web origin");
      }
      if (options.headers.has("allow") || options.headers.has("link")) {
        throw new Error("CORS middleware must solely own composed OPTIONS /mcp");
      }
      const optionsVary = (options.headers.get("vary") ?? "").split(",").map((value) => value.trim());
      if (new Set(optionsVary).size !== optionsVary.length) {
        throw new Error("OPTIONS /mcp contains duplicate Vary tokens");
      }

      for (const origin of [undefined, "http://localhost:3001", "http://localhost:3000"]) {
        for (const method of ["GET", "POST", "OPTIONS"]) {
          const response = await request(method, origin, {
            "Access-Control-Request-Method": "POST"
          });
          if (response.status !== (method === "OPTIONS" ? 204 : 200)) {
            throw new Error("Trusted or originless " + method + " /mcp was rejected: " + String(origin));
          }
        }
      }

      for (const origin of ["null", "https://attacker.example", "http://localhost:3001/"]) {
        for (const method of ["GET", "POST", "OPTIONS"]) {
          const response = await request(method, origin, {
            "Access-Control-Request-Method": "POST"
          });
          if (response.status !== 403 || response.headers.has("access-control-allow-origin")) {
            throw new Error("Untrusted " + method + " /mcp reached CORS or transport: " + origin);
          }
        }
      }

      const deletion = await request("DELETE", "http://localhost:3001");
      if (deletion.status !== 405 || deletion.headers.get("allow") !== "GET, HEAD, OPTIONS, POST") {
        throw new Error("DELETE /mcp must remain unsupported");
      }
      console.log("mcp-discovery-routes-ok");
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
    expect(stdout).toContain("mcp-discovery-routes-ok");
  });

  test("composes the exact production MCP origins through app.fetch", async () => {
    const moduleUrl = new URL("./index.ts", import.meta.url).href;
    const script = `
      import { mock } from "bun:test";
      mock.module("cloudflare:workers", () => ({
        env: {
          ENRICHMENT_PROVIDER: "cloudflare",
          ENRICHMENT_VISION_MODEL: "vision",
          ENRICHMENT_EMBEDDING_MODEL: "embedding",
          ENRICHMENT_PROMPT_VERSION: "v1",
          CORS_ORIGIN: "https://art.jpamorgan.com",
          BETTER_AUTH_URL: "https://api.art.jpamorgan.com",
          BETTER_AUTH_SECRET: "test-secret"
        }
      }));
      const { app } = await import(${JSON.stringify(moduleUrl)});
      const request = (method, origin) => {
        const headers = new Headers({ "Access-Control-Request-Method": "POST" });
        if (origin !== undefined) headers.set("Origin", origin);
        const init = { method, headers };
        if (method === "POST") {
          headers.set("Accept", "application/json, text/event-stream");
          headers.set("Content-Type", "application/json");
          init.body = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "production-routing-test", version: "1.0.0" }
            }
          });
        }
        return app.fetch(new Request("https://api.art.jpamorgan.com/mcp", init));
      };

      for (const origin of [undefined, "https://art.jpamorgan.com", "https://api.art.jpamorgan.com"]) {
        for (const method of ["GET", "POST", "OPTIONS"]) {
          const response = await request(method, origin);
          if (response.status !== (method === "OPTIONS" ? 204 : 200)) {
            throw new Error("Production origin policy rejected " + method + ": " + String(origin));
          }
        }
      }

      for (const origin of ["http://localhost:3001", "https://attacker.example"]) {
        for (const method of ["GET", "POST", "OPTIONS"]) {
          if ((await request(method, origin)).status !== 403) {
            throw new Error("Production origin policy allowed " + method + ": " + origin);
          }
        }
      }
      console.log("mcp-production-origins-ok");
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
    expect(stdout).toContain("mcp-production-origins-ok");
  });

  test("composes A2A and OAuth discovery routes without advertising unsupported auth", async () => {
    const moduleUrl = new URL("./index.ts", import.meta.url).href;
    const script = `
      import { mock } from "bun:test";
      mock.module("cloudflare:workers", () => ({
        env: {
          ENRICHMENT_PROVIDER: "cloudflare",
          ENRICHMENT_VISION_MODEL: "vision",
          ENRICHMENT_EMBEDDING_MODEL: "embedding",
          ENRICHMENT_PROMPT_VERSION: "v1",
          CORS_ORIGIN: "https://art.jpamorgan.com",
          BETTER_AUTH_URL: "https://api.art.jpamorgan.com",
          BETTER_AUTH_SECRET: "test-secret"
        }
      }));
      const { app } = await import(${JSON.stringify(moduleUrl)});

      const cardResponse = await app.fetch(
        new Request("https://api.art.jpamorgan.com/.well-known/agent-card.json")
      );
      const card = await cardResponse.json();
      if (
        cardResponse.status !== 200 ||
        card.supportedInterfaces[0].url !== "https://api.art.jpamorgan.com/a2a" ||
        card.supportedInterfaces[0].protocolVersion !== "1.0" ||
        card.securityRequirements.length !== 0
      ) {
        throw new Error("The live A2A route does not serve its v1.0 anonymous agent card");
      }

      const protectedResponse = await app.fetch(
        new Request("https://api.art.jpamorgan.com/.well-known/oauth-protected-resource")
      );
      const protectedMetadata = await protectedResponse.json();
      if (
        protectedMetadata.resource !== "https://api.art.jpamorgan.com/agent/catalog" ||
        protectedMetadata.authorization_servers[0] !== "https://api.art.jpamorgan.com" ||
        protectedMetadata.scopes_supported[0] !== "art:read"
      ) {
        throw new Error("RFC 9728 metadata is not cross-linked to the protected catalog");
      }
      if (
        protectedResponse.headers.get("access-control-allow-origin") !== "*" ||
        protectedResponse.headers.has("access-control-allow-credentials")
      ) {
        throw new Error("Public OAuth metadata has an invalid credentialed wildcard CORS policy");
      }

      const challenge = await app.fetch(
        new Request("https://api.art.jpamorgan.com/agent/catalog")
      );
      if (
        challenge.status !== 401 ||
        !challenge.headers.get("www-authenticate")?.includes("oauth-protected-resource")
      ) {
        throw new Error("The protected catalog does not expose RFC 9728 discovery");
      }

      const a2aGet = await app.fetch(
        new Request("https://api.art.jpamorgan.com/a2a", {
          headers: { Origin: "https://art.jpamorgan.com" }
        })
      );
      if (a2aGet.status !== 405 || a2aGet.headers.get("a2a-version") !== "1.0") {
        throw new Error("The A2A transport route is not wired to the v1 handler");
      }
      const a2aAttack = await app.fetch(
        new Request("https://api.art.jpamorgan.com/a2a", {
          method: "POST",
          headers: {
            Origin: "https://attacker.example",
            "Content-Type": "application/json"
          },
          body: "{}"
        })
      );
      if (a2aAttack.status !== 403) {
        throw new Error("The A2A transport accepted an untrusted browser origin");
      }

      const registrationAttack = await app.fetch(
        new Request("https://api.art.jpamorgan.com/agent/identity", {
          method: "POST",
          headers: {
            Origin: "https://attacker.example",
            "Content-Type": "application/json"
          },
          body: "{}"
        })
      );
      if (registrationAttack.status !== 403) {
        throw new Error("Agent client registration accepted an untrusted browser origin");
      }

      console.log("agent-protocol-routes-ok");
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
    expect(stdout).toContain("agent-protocol-routes-ok");
  });
});
