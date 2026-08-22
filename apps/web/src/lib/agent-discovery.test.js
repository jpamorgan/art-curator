import { describe, expect, test } from "bun:test";

const webRoot = new URL("../../", import.meta.url);

async function readPublicFile(path) {
  return Bun.file(new URL(`public/${path}`, webRoot)).text();
}

describe("public agent discovery artifacts", () => {
  test("publishes intentional AI crawler policy and a sitemap pointer", async () => {
    const robots = await readPublicFile("robots.txt");

    for (const crawler of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot"]) {
      expect(robots).toContain(`User-agent: ${crawler}\nAllow: /`);
    }
    for (const crawler of ["CCBot", "ByteSpider"]) {
      expect(robots).toContain(`User-agent: ${crawler}\nDisallow: /`);
    }
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain("Sitemap: https://art.jpamorgan.com/sitemap.xml");
  });

  test("keeps the sitemap on the live catalog-backed server path", async () => {
    const staticSitemap = Bun.file(new URL("public/sitemap.xml", webRoot));
    const serverEntry = await Bun.file(new URL("src/server.ts", webRoot)).text();
    const responder = await Bun.file(new URL("src/lib/agent-responses.ts", webRoot)).text();

    expect(await staticSitemap.exists()).toBe(false);
    expect(serverEntry).toContain("handleAgentRepresentation(request)");
    expect(responder).toContain('url.pathname === "/sitemap.xml"');
    expect(responder).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  test("publishes a schema-shaped ARD catalog backed by a resolvable server card", async () => {
    const [catalogText, cardText, headers] = await Promise.all([
      readPublicFile(".well-known/ai-catalog.json"),
      readPublicFile(".well-known/mcp/server-card.json"),
      readPublicFile("_headers"),
    ]);
    const catalog = JSON.parse(catalogText);
    const card = JSON.parse(cardText);
    const entry = catalog.entries[0];

    expect(catalog.specVersion).toBe("1.0");
    expect(catalog.host.identifier).toBe("art.jpamorgan.com");
    expect(entry.identifier).toMatch(/^urn:air:art\.jpamorgan\.com:/u);
    expect(entry.type).toBe("application/mcp-server-card+json");
    expect(entry.url).toBe("https://art.jpamorgan.com/.well-known/mcp/server-card.json");
    expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
    expect(card.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    );
    expect(card.name).toBe("com.jpamorgan.art/catalog");
    expect(card.description.length).toBeLessThanOrEqual(100);
    expect(card.remotes).toEqual([
      {
        type: "streamable-http",
        url: "https://api.art.jpamorgan.com/mcp",
      },
    ]);
    expect(card.tools).toBeUndefined();
    expect(headers).toContain(
      "/.well-known/mcp/server-card.json\n  Content-Type: application/mcp-server-card+json; charset=utf-8",
    );
    expect(headers).toContain("/.well-known/agent-skills/browse-art/SKILL.md");
    expect(headers).not.toContain("/.well-known/agent-skills/*");
    expect(headers).not.toContain("/*.md");
    expect(headers).toContain("Access-Control-Expose-Headers: Content-Type, ETag");
  });

  test("indexes a schema-versioned skill with a verified artifact digest", async () => {
    const index = JSON.parse(await readPublicFile(".well-known/agent-skills/index.json"));
    const skill = index.skills.find((item) => item.name === "browse-art");
    const skillText = await readPublicFile(".well-known/agent-skills/browse-art/SKILL.md");
    const digest = new Bun.CryptoHasher("sha256").update(skillText).digest("hex");

    expect(index.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    expect(skill.type).toBe("skill-md");
    expect(skill.description.length).toBeGreaterThan(40);
    expect(skill.url).toBe("/.well-known/agent-skills/browse-art/SKILL.md");
    expect(skill.digest).toBe(`sha256:${digest}`);
    expect(skillText).toContain("name: browse-art");
    expect(skillText).toContain("https://api.art.jpamorgan.com/mcp");
  });

  test("serves heading-led Markdown twins and a truthful auth policy", async () => {
    const markdownFiles = ["index.md", "auth.md"];
    const documents = await Promise.all(markdownFiles.map(readPublicFile));

    for (const document of documents) {
      expect(document).toMatch(/^# [^\n]+\n/u);
      expect(document).not.toContain("<!doctype html>");
    }

    for (const dynamicPath of ["artists.md", "galleries.md", "styles.md"]) {
      expect(await Bun.file(new URL(`public/${dynamicPath}`, webRoot)).exists()).toBe(false);
    }

    const auth = documents.at(-1);
    for (const heading of [
      "## Discover",
      "## Pick a method",
      "## Register",
      "## Claim",
      "## Use the credential",
      "## Errors",
      "## Revocation",
    ]) {
      expect(auth).toContain(heading);
    }
    for (const keyword of [
      "agent_auth",
      "register_uri",
      "identity_assertion",
      "id-jag",
      "WWW-Authenticate",
    ]) {
      expect(auth).toContain(keyword);
    }
    expect(auth).toContain("No agent registration is required or supported.");
  });

  test("keeps llms.txt links on resolvable discovery surfaces", async () => {
    const instructions = await readPublicFile("llms.txt");
    const markdownLinks = [...instructions.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/gu)].map(
      (match) => match[1],
    );

    expect(instructions).toContain("https://github.com/jpamorgan/art-curator");
    expect(instructions).toContain("AGENTS.md");
    expect(instructions).toContain("](https://api.art.jpamorgan.com/mcp)");
    expect(markdownLinks.length).toBeGreaterThan(5);
    expect(new Set(markdownLinks).size).toBe(markdownLinks.length);
  });
});
