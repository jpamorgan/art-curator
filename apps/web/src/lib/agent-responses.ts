import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site-identity";

const API_ORIGIN = "https://api.art.jpamorgan.com";
const REPOSITORY_URL = "https://github.com/jpamorgan/art-curator";

type TaxonomyLink = {
  name: string;
  slug: string;
};

export type MarkdownArtwork = {
  slug: string;
  title: string;
  artist: string;
  artistSlug: string;
  date: string;
  description: string;
  medium: string;
  dimensions: string;
  creditLine: string;
  gallery: string;
  gallerySlug: string;
  categories: TaxonomyLink[];
  styles: TaxonomyLink[];
  source: { name: string; url: string; attribution: string };
  imageSource: { url: string; attribution: string };
  imageUrl: string;
  alt: string;
};

export type MarkdownEntity = {
  slug: string;
  name: string;
  description: string;
  artworkCount: number;
  location?: string;
  url?: string;
  source?: { name: string; url: string; attribution: string };
};

export interface MarkdownCatalog {
  listEntities(kind: EntityKind): Promise<MarkdownEntity[]>;
  getArtwork(slug: string): Promise<MarkdownArtwork | null>;
  getEntity(kind: EntityKind, slug: string): Promise<MarkdownEntity | null>;
  listSitemapEntries(): Promise<SitemapEntry[]>;
}

export type SitemapEntry = {
  path: string;
  lastModified: string | null;
};

type EntityKind = "artists" | "galleries" | "styles";
type DetailKind = "art" | EntityKind;

type MarkdownRequest =
  | { type: "index"; kind: EntityKind }
  | { type: "detail"; kind: DetailKind; slug: string };

const entityLabels: Record<EntityKind, { singular: string; plural: string; summary: string }> = {
  artists: {
    singular: "Artist",
    plural: "Artists",
    summary: "Artists represented in John Philip Morgan's curated art catalog.",
  },
  galleries: {
    singular: "Gallery",
    plural: "Galleries",
    summary: "Galleries represented in John Philip Morgan's curated art catalog.",
  },
  styles: {
    singular: "Style",
    plural: "Styles",
    summary: "Artistic styles represented in John Philip Morgan's curated art catalog.",
  },
};

export const agentView = {
  format: "agent-view",
  version: "1.0",
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  canonicalUrl: SITE_URL,
  operator: {
    name: "John Philip Morgan",
    url: "https://jpamorgan.com",
  },
  sourceRepository: REPOSITORY_URL,
  access: {
    browsing: {
      authentication: "none",
      description: "Catalog browsing, artwork details, and MCP browse_art are public.",
    },
    authenticatedAgentCatalog: {
      authentication: "oauth2-authorization-code-pkce",
      scope: "art:read",
      description:
        "The protected JSON catalog uses a dynamically registered public OAuth client and interactive user consent.",
      instructions: `${SITE_URL}auth.md`,
    },
    personalization: {
      authentication: "session",
      description:
        "Saving favorites, following catalog entities, and personalized feeds require a user session.",
      instructions: `${SITE_URL}auth.md`,
    },
  },
  capabilities: [
    {
      id: "browse_art",
      description: "Browse public artwork cards and filter by category, style, gallery, or artist.",
      access: "anonymous",
      transports: ["mcp-streamable-http", "orpc-http"],
    },
    {
      id: "browse_art_a2a",
      description: "Browse the public catalog through an A2A v1.0 task lifecycle and artifact.",
      access: "anonymous",
      transports: ["a2a-jsonrpc", "sse"],
    },
    {
      id: "read_agent_catalog",
      description: "Read structured artwork pages with an audience-bound art:read access token.",
      access: "oauth2-art:read",
      transports: ["https"],
    },
    {
      id: "read_artwork_page",
      description: "Read artwork, artist, gallery, and style detail pages as HTML or Markdown.",
      access: "anonymous",
      transports: ["https"],
    },
    {
      id: "personalize_catalog",
      description:
        "Save favorites, follow artists, galleries, and styles, and receive personalized recommendations.",
      access: "authenticated-session",
      transports: ["https", "orpc-http"],
    },
  ],
  endpoints: {
    website: SITE_URL,
    agentView: `${SITE_URL}?mode=agent`,
    markdownHomepage: `${SITE_URL}index.md`,
    mcp: {
      url: `${API_ORIGIN}/mcp`,
      transport: "streamable-http",
      method: "POST",
      authentication: "none",
    },
    a2a: {
      url: `${API_ORIGIN}/a2a`,
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
      authentication: "none",
    },
    protectedCatalog: {
      url: `${API_ORIGIN}/agent/catalog`,
      method: "GET",
      authentication: "oauth2",
      scope: "art:read",
    },
    agentRegistration: {
      url: `${API_ORIGIN}/agent/identity`,
      method: "POST",
      type: "oauth2_public_client",
    },
  },
  discovery: {
    llms: `${SITE_URL}llms.txt`,
    aiCatalog: `${SITE_URL}.well-known/ai-catalog.json`,
    agentSkills: `${SITE_URL}.well-known/agent-skills/index.json`,
    mcpServerCard: `${SITE_URL}.well-known/mcp/server-card.json`,
    agentCard: `${SITE_URL}.well-known/agent-card.json`,
    authentication: `${SITE_URL}auth.md`,
    oauthProtectedResource: `${API_ORIGIN}/.well-known/oauth-protected-resource`,
    oauthAuthorizationServer: `${API_ORIGIN}/.well-known/oauth-authorization-server`,
    sitemap: `${SITE_URL}sitemap.xml`,
  },
  canonicalPages: [
    { name: "Art", html: SITE_URL, markdown: `${SITE_URL}index.md` },
    { name: "Artists", html: `${SITE_URL}artists`, markdown: `${SITE_URL}artists.md` },
    { name: "Galleries", html: `${SITE_URL}galleries`, markdown: `${SITE_URL}galleries.md` },
    { name: "Styles", html: `${SITE_URL}styles`, markdown: `${SITE_URL}styles.md` },
  ],
} as const;

export async function getAgentFacingResponse(
  request: Request,
  catalog: MarkdownCatalog,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS" && isAgentFacingUrl(url)) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Max-Age": "86400",
        Allow: "GET, HEAD, OPTIONS",
      },
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  if (url.pathname === "/" && url.searchParams.get("mode") === "agent") {
    return jsonResponse(agentView, request.method === "HEAD");
  }

  if (url.pathname === "/sitemap.xml") {
    try {
      return sitemapResponse(await catalog.listSitemapEntries(), request.method === "HEAD");
    } catch {
      return new Response(request.method === "HEAD" ? null : "Sitemap temporarily unavailable.\n", {
        status: 503,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  const markdownRequest = matchMarkdownRequest(url.pathname);
  if (!markdownRequest) {
    return isReservedMarkdownPath(url.pathname)
      ? markdownResponse(
          "# Invalid Markdown URL\n\nUse a lowercase, hyphenated catalog slug.\n",
          url,
          request.method === "HEAD",
          400,
        )
      : null;
  }

  let markdown: string | null;
  try {
    markdown = await renderMarkdown(markdownRequest, catalog);
  } catch {
    return markdownResponse(
      "# Catalog temporarily unavailable\n\nThe public catalog could not be loaded. Retry this Markdown URL later.\n",
      url,
      request.method === "HEAD",
      503,
    );
  }
  if (!markdown) {
    return markdownResponse(
      "# Catalog entry not found\n\nNo catalog entry exists at this Markdown URL.\n",
      url,
      request.method === "HEAD",
      404,
    );
  }

  return markdownResponse(markdown, url, request.method === "HEAD");
}

function isAgentFacingUrl(url: URL): boolean {
  return (
    (url.pathname === "/" && url.searchParams.get("mode") === "agent") ||
    url.pathname === "/sitemap.xml" ||
    isReservedMarkdownPath(url.pathname)
  );
}

function isReservedMarkdownPath(pathname: string): boolean {
  return /^\/(?:art|artists|galleries|styles)(?:\/.*)?\.md$/u.test(pathname);
}

function matchMarkdownRequest(pathname: string): MarkdownRequest | null {
  const indexMatch = /^\/(artists|galleries|styles)(?:\/index)?\.md$/u.exec(pathname);
  if (indexMatch) return { type: "index", kind: indexMatch[1] as EntityKind };

  const detailMatch = /^\/(art|artists|galleries|styles)\/([^/]+)\.md$/u.exec(pathname);
  if (!detailMatch) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(detailMatch[2] ?? "");
  } catch {
    return null;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) return null;
  return { type: "detail", kind: detailMatch[1] as DetailKind, slug };
}

async function renderMarkdown(
  request: MarkdownRequest,
  catalog: MarkdownCatalog,
): Promise<string | null> {
  if (request.type === "index") {
    const entities = await catalog.listEntities(request.kind);
    return renderEntityIndex(request.kind, entities);
  }

  if (request.kind === "art") {
    const artwork = await catalog.getArtwork(request.slug);
    return artwork ? renderArtwork(artwork) : null;
  }

  const entity = await catalog.getEntity(request.kind, request.slug);
  return entity ? renderEntity(request.kind, entity) : null;
}

function renderEntityIndex(kind: EntityKind, entities: MarkdownEntity[]): string {
  const label = entityLabels[kind];
  const items = entities
    .map((entity) => {
      const summary = normalizeText(entity.description);
      const details = summary ? ` — ${markdownText(summary)}` : "";
      return `- ${markdownLink(entity.name, `${SITE_URL}${kind}/${entity.slug}.md`)} (${entity.artworkCount} artworks)${details}`;
    })
    .join("\n");

  return [
    `# ${label.plural}`,
    "",
    label.summary,
    "",
    markdownLink("Canonical HTML page", `${SITE_URL}${kind}`),
    "",
    `## ${label.plural} in the catalog`,
    "",
    items || "No entries are currently published in this collection.",
    "",
    "## Agent access",
    "",
    `Use the public ${markdownLink("MCP browse_art tool", `${API_ORIGIN}/mcp`)} for filtered artwork results, or read the ${markdownLink("agent view", `${SITE_URL}?mode=agent`)} for endpoint and authentication metadata.`,
    "",
  ].join("\n");
}

function renderEntity(kind: EntityKind, entity: MarkdownEntity): string {
  const label = entityLabels[kind];
  const lines = [`# ${markdownText(entity.name)}`, "", `${label.singular} in ${SITE_NAME}.`, ""];

  if (normalizeText(entity.description)) {
    lines.push(markdownText(entity.description), "");
  }

  lines.push("## Details", "", `- Artworks in catalog: ${entity.artworkCount}`);
  if (entity.location) lines.push(`- Location: ${markdownText(entity.location)}`);
  if (entity.url) lines.push(`- Official website: ${markdownLink(entity.name, entity.url)}`);

  lines.push(
    "",
    "## Catalog links",
    "",
    `- ${markdownLink("Canonical HTML page", `${SITE_URL}${kind}/${entity.slug}`)}`,
    `- ${markdownLink(`Browse all ${label.plural.toLowerCase()}`, `${SITE_URL}${kind}.md`)}`,
    `- ${markdownLink("Browse matching art", `${SITE_URL}${kind}/${entity.slug}`)}`,
  );

  if (entity.source) {
    lines.push(
      "",
      "## Source",
      "",
      `${markdownLink(entity.source.name, entity.source.url)}${entity.source.attribution ? ` — ${markdownText(entity.source.attribution)}` : ""}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function renderArtwork(artwork: MarkdownArtwork): string {
  const lines = [
    `# ${markdownText(artwork.title)}`,
    "",
    `By ${markdownLink(artwork.artist, `${SITE_URL}artists/${artwork.artistSlug}.md`)}${artwork.date ? `, ${markdownText(artwork.date)}` : ""}.`,
    "",
  ];

  if (normalizeText(artwork.description)) {
    lines.push(markdownText(artwork.description), "");
  }

  lines.push("## Details", "");
  if (artwork.medium) lines.push(`- Medium: ${markdownText(artwork.medium)}`);
  if (artwork.dimensions) lines.push(`- Dimensions: ${markdownText(artwork.dimensions)}`);
  if (artwork.gallery) {
    lines.push(
      `- Gallery: ${markdownLink(artwork.gallery, `${SITE_URL}galleries/${artwork.gallerySlug}.md`)}`,
    );
  }
  if (artwork.creditLine) lines.push(`- Credit: ${markdownText(artwork.creditLine)}`);
  if (artwork.categories.length > 0) {
    lines.push(
      `- Categories: ${artwork.categories.map((item) => markdownText(item.name)).join(", ")}`,
    );
  }
  if (artwork.styles.length > 0) {
    lines.push(
      `- Styles: ${artwork.styles.map((style) => markdownLink(style.name, `${SITE_URL}styles/${style.slug}.md`)).join(", ")}`,
    );
  }

  lines.push(
    "",
    "## Image",
    "",
    markdownImage(artwork.alt, artwork.imageUrl),
    "",
    "## Sources",
    "",
    `- ${markdownLink(artwork.source.name, artwork.source.url)}${artwork.source.attribution ? ` — ${markdownText(artwork.source.attribution)}` : ""}`,
    `- ${markdownLink("Image source", artwork.imageSource.url)}${artwork.imageSource.attribution ? ` — ${markdownText(artwork.imageSource.attribution)}` : ""}`,
    "",
    markdownLink("Canonical HTML page", `${SITE_URL}art/${artwork.slug}`),
    "",
  );

  return lines.join("\n");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>])/gu, "\\$1");
}

function markdownText(value: string): string {
  return escapeMarkdown(normalizeText(value));
}

function safeMarkdownUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Markdown links require HTTP or HTTPS URLs.");
  }
  return url.href.replaceAll("<", "%3C").replaceAll(">", "%3E");
}

function markdownLink(label: string, url: string): string {
  return `[${markdownText(label)}](<${safeMarkdownUrl(url)}>)`;
}

function markdownImage(alt: string, url: string): string {
  return `![${markdownText(alt)}](<${safeMarkdownUrl(url)}>)`;
}

function jsonResponse(value: unknown, head: boolean): Response {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  return new Response(head ? null : body, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Location": `${SITE_URL}?mode=agent`,
      "Content-Type": "application/json; charset=utf-8",
      Link: `<${SITE_URL}>; rel="canonical", <${SITE_URL}index.md>; rel="alternate"; type="text/markdown"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function markdownResponse(body: string, requestUrl: URL, head: boolean, status = 200): Response {
  const markdownUrl = new URL(requestUrl.pathname, SITE_URL).href;
  const canonicalPath = requestUrl.pathname.replace(/(?:\/index)?\.md$/u, "");
  const canonicalUrl = new URL(canonicalPath || "/", SITE_URL).href;
  const isError = status >= 400;

  return new Response(head ? null : body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": isError ? "no-store" : "public, max-age=60, stale-while-revalidate=300",
      "Content-Location": markdownUrl,
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${canonicalUrl}>; rel="canonical", <${markdownUrl}>; rel="alternate"; type="text/markdown"`,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": isError ? "noindex, nofollow" : "index, follow",
    },
  });
}

function sitemapResponse(entries: SitemapEntry[], head: boolean): Response {
  const urls = entries
    .map((entry) => {
      if (!/^\/(?:[a-z0-9-]+\/?)*$/u.test(entry.path)) {
        throw new Error("Sitemap paths must be normalized site-relative paths.");
      }
      if (entry.lastModified !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(entry.lastModified)) {
        throw new Error("Sitemap dates must use YYYY-MM-DD.");
      }

      const location = escapeXml(new URL(entry.path, SITE_URL).href);
      const lastModified = entry.lastModified
        ? `\n    <lastmod>${escapeXml(entry.lastModified)}</lastmod>`
        : "";
      return `  <url>\n    <loc>${location}</loc>${lastModified}\n  </url>`;
    })
    .join("\n");
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(head ? null : body, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
