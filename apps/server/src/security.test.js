import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { favoriteMutationGuard } from "./security";

const trustedOrigins = ["https://art.jpamorgan.com", "https://api.art.jpamorgan.com"];

function testApp() {
  const app = new Hono();
  const guard = favoriteMutationGuard(trustedOrigins);
  for (const path of ["/rpc/favorites/toggle", "/api-reference/favorites/toggle"]) {
    app.use(path, guard);
    app.post(path, (context) => context.text("handler reached"));
  }
  app.post("/rpc/artworks/list", (context) => context.text("public handler reached"));
  return app;
}

function multipartBody() {
  const form = new FormData();
  form.set("artworkId", "moma-starry-night");
  return form;
}

describe("favorite mutation origin guard", () => {
  test("rejects cross-site mutations on both transport aliases", async () => {
    for (const path of ["/rpc/favorites/toggle", "/api-reference/favorites/toggle"]) {
      const response = await testApp().request(path, {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "Sec-Fetch-Site": "cross-site",
        },
        body: multipartBody(),
      });

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
    }
  });

  test("allows the exact trusted web origin on both transport aliases", async () => {
    for (const path of ["/rpc/favorites/toggle", "/api-reference/favorites/toggle"]) {
      const response = await testApp().request(path, {
        method: "POST",
        headers: {
          Origin: "https://art.jpamorgan.com",
          "Sec-Fetch-Site": "same-site",
        },
        body: multipartBody(),
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("handler reached");
    }
  });

  test("rejects a lookalike origin even when Fetch Metadata is absent", async () => {
    const response = await testApp().request("/rpc/favorites/toggle", {
      method: "POST",
      headers: { Origin: "https://art.jpamorgan.com.attacker.example" },
      body: multipartBody(),
    });

    expect(response.status).toBe(403);
  });

  test("rejects missing Origin on both aliases while keeping unrelated RPC available", async () => {
    for (const path of ["/rpc/favorites/toggle", "/api-reference/favorites/toggle"]) {
      const response = await testApp().request(path, {
        method: "POST",
        body: multipartBody(),
      });
      expect(response.status).toBe(403);
    }

    const publicResponse = await testApp().request("/rpc/artworks/list", {
      method: "POST",
      body: multipartBody(),
    });
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.text()).toBe("public handler reached");
  });
});
