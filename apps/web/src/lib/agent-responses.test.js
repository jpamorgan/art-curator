import { describe, expect, test } from "bun:test";

import { getAgentFacingResponse } from "./agent-responses";

const artist = {
  slug: "agnes-martin",
  name: "Agnes Martin",
  description: "Known for quiet geometric abstraction.",
  artworkCount: 2,
};

const gallery = {
  slug: "pace-gallery",
  name: "Pace Gallery",
  description: "A contemporary art gallery.",
  artworkCount: 1,
  location: "New York, NY",
  url: "https://example.com/pace",
  source: {
    name: "Pace",
    url: "https://example.com/source",
    attribution: "Catalog record",
  },
};

const style = {
  slug: "minimalism",
  name: "Minimalism",
  description: "Art characterized by reduced forms.",
  artworkCount: 3,
};

const catalog = {
  async listEntities(kind) {
    return { artists: [artist], galleries: [gallery], styles: [style] }[kind];
  },
  async getArtwork(slug) {
    if (slug !== "untitled-number-five") return null;
    return {
      slug,
      title: "Untitled #5",
      artist: "Agnes Martin",
      artistSlug: "agnes-martin",
      date: "1998",
      description: "A pale grid drawn across a square field.",
      medium: "Graphite and acrylic on canvas",
      dimensions: "72 × 72 in.",
      creditLine: "Private collection",
      gallery: "Pace Gallery",
      gallerySlug: "pace-gallery",
      categories: [{ name: "Painting", slug: "painting" }],
      styles: [{ name: "Minimalism", slug: "minimalism" }],
      source: { name: "Pace", url: "https://example.com/work", attribution: "Artwork data" },
      imageSource: { url: "https://example.com/image", attribution: "Pace Gallery" },
      imageUrl: "https://example.com/art.jpg",
      alt: "A pale square grid",
    };
  },
  async getEntity(kind, slug) {
    return (
      {
        artists: slug === artist.slug ? artist : null,
        galleries: slug === gallery.slug ? gallery : null,
        styles: slug === style.slug ? style : null,
      }[kind] ?? null
    );
  },
  async listSitemapEntries() {
    return [
      { path: "/", lastModified: "2026-08-21" },
      { path: "/art/untitled-number-five", lastModified: "2026-08-20" },
      { path: "/artists/agnes-martin", lastModified: "2026-08-19" },
    ];
  },
};

describe("agent-facing responses", () => {
  test("returns structured JSON instead of HTML for the homepage agent mode", async () => {
    const response = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/?mode=agent"),
      catalog,
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response?.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body.name).toBe("Art by John Philip Morgan");
    expect(body.endpoints.mcp.url).toBe("https://api.art.jpamorgan.com/mcp");
    expect(body.access.browsing.authentication).toBe("none");
    expect(body.discovery.authentication).toBe("https://art.jpamorgan.com/auth.md");
    expect(body.discovery.agentCard).toBe("https://art.jpamorgan.com/.well-known/agent-card.json");
    expect(body.discovery.oauthProtectedResource).toBe(
      "https://api.art.jpamorgan.com/.well-known/oauth-protected-resource",
    );
    expect(body.endpoints.a2a).toMatchObject({
      url: "https://api.art.jpamorgan.com/a2a",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
      authentication: "none",
    });
    expect(body.endpoints.protectedCatalog).toMatchObject({
      url: "https://api.art.jpamorgan.com/agent/catalog",
      authentication: "oauth2",
      scope: "art:read",
    });
    expect(body.sourceRepository).toBe("https://github.com/jpamorgan/art-curator");
  });

  test("serves live collection and detail twins as heading-led Markdown", async () => {
    const indexResponse = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/artists.md"),
      catalog,
    );
    const detailResponse = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/art/untitled-number-five.md"),
      catalog,
    );

    expect(indexResponse?.status).toBe(200);
    expect(indexResponse?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(indexResponse?.headers.get("access-control-allow-origin")).toBe("*");
    expect(await indexResponse.text()).toStartWith("# Artists\n");

    expect(detailResponse?.status).toBe(200);
    expect(detailResponse?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const detail = await detailResponse.text();
    expect(detail).toStartWith("# Untitled #5\n");
    expect(detail).toContain(
      "By [Agnes Martin](<https://art.jpamorgan.com/artists/agnes-martin.md>)",
    );
    expect(detail).toContain("Medium: Graphite and acrylic on canvas");
    expect(detail).not.toContain("<!DOCTYPE html>");
  });

  test("returns a Markdown 404 for a missing valid catalog slug", async () => {
    const response = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/styles/unknown-style.md"),
      catalog,
    );

    expect(response?.status).toBe(404);
    expect(response?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.text()).toStartWith("# Catalog entry not found\n");
  });

  test("keeps invalid and unavailable Markdown requests machine-readable", async () => {
    const invalid = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/art/Not%20A%20Slug.md"),
      catalog,
    );
    const unavailable = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/artists.md"),
      {
        ...catalog,
        async listEntities() {
          throw new Error("upstream failed");
        },
      },
    );

    expect(invalid?.status).toBe(400);
    expect(invalid?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await invalid.text()).toStartWith("# Invalid Markdown URL\n");
    expect(unavailable?.status).toBe(503);
    expect(unavailable?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await unavailable.text()).toStartWith("# Catalog temporarily unavailable\n");
  });

  test("builds a complete XML sitemap from catalog-supplied modification dates", async () => {
    const response = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/sitemap.xml"),
      catalog,
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    const body = await response.text();
    expect(body).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain("<loc>https://art.jpamorgan.com/art/untitled-number-five</loc>");
    expect(body).toContain("<lastmod>2026-08-20</lastmod>");
    expect(body.trimEnd()).toEndWith("</urlset>");
  });

  test("preserves normal browser routes and unsupported methods", async () => {
    expect(
      await getAgentFacingResponse(new Request("https://art.jpamorgan.com/artists"), catalog),
    ).toBeNull();
    expect(
      await getAgentFacingResponse(
        new Request("https://art.jpamorgan.com/", { method: "POST" }),
        catalog,
      ),
    ).toBeNull();
  });

  test("answers CORS preflight only for agent-facing dynamic routes", async () => {
    const agentPreflight = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/artists.md", { method: "OPTIONS" }),
      catalog,
    );
    const browserPreflight = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/artists", { method: "OPTIONS" }),
      catalog,
    );

    expect(agentPreflight?.status).toBe(204);
    expect(agentPreflight?.headers.get("access-control-allow-origin")).toBe("*");
    expect(agentPreflight?.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(browserPreflight).toBeNull();
  });

  test("supports bodyless HEAD requests with the same representation headers", async () => {
    const response = await getAgentFacingResponse(
      new Request("https://art.jpamorgan.com/galleries/pace-gallery.md", { method: "HEAD" }),
      catalog,
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await response.text()).toBe("");
  });
});
