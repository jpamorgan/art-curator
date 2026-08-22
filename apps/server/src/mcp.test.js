import { describe, expect, test } from "bun:test";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import { ART_WIDGET_URI, artWidgetHtml, handleMcpRequest } from "./mcp";

const endpoint = "https://api.art.jpamorgan.com/mcp";

function dependencies(overrides = {}) {
  return {
    assetOrigin: "https://api.art.jpamorgan.com",
    browseArt: async () => [],
    ...overrides,
  };
}

async function rpc(method, params, deps = dependencies()) {
  const response = await handleMcpRequest(
    new Request(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    deps,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  return response.json();
}

describe("Art MCP server", () => {
  test("initializes as a stateless public MCP server", async () => {
    const response = await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "contract-test", version: "1.0.0" },
    });

    expect(response.result.serverInfo).toEqual({
      name: "art-by-john-philip-morgan",
      version: "1.0.0",
    });
    expect(response.result.instructions).toStartWith("Use browse_art");
    expect(response.result.capabilities.tools).toBeDefined();
    expect(response.result.capabilities.resources).toBeDefined();
  });

  test("advertises one no-auth, read-only app tool with an exact output contract", async () => {
    const response = await rpc("tools/list", {});
    expect(response.result.tools).toHaveLength(1);

    const tool = response.result.tools[0];
    expect(tool.name).toBe("browse_art");
    expect(tool.description).toStartWith("Use this when");
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    });
    // @modelcontextprotocol/sdk 1.30.0 is the latest compatible release and its public
    // ToolConfig/ToolSchema cannot emit the plugin-only top-level field. The documented
    // compatibility mirror is the only stable no-auth declaration available to McpServer.
    expect(tool.securitySchemes).toBeUndefined();
    expect(tool._meta.securitySchemes).toEqual([{ type: "noauth" }]);
    expect(tool._meta.ui).toEqual({ resourceUri: ART_WIDGET_URI, visibility: ["model"] });
    expect(tool._meta["openai/outputTemplate"]).toBeUndefined();
    expect(tool.inputSchema.properties.limit.maximum).toBe(12);
    expect(tool.outputSchema.required).toEqual(["artworks"]);
    expect(tool.outputSchema.properties.artworks.items.required).toEqual([
      "slug",
      "title",
      "artist",
      "date",
      "gallery",
      "category",
      "styles",
      "url",
      "thumbnailUrl",
      "alt",
    ]);
  });

  test("serves the versioned MCP Apps resource with exact security metadata", async () => {
    const listed = await rpc("resources/list", {});
    expect(listed.result.resources).toHaveLength(1);
    expect(listed.result.resources[0]).toMatchObject({
      uri: ART_WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          csp: {
            connectDomains: [],
            resourceDomains: ["https://api.art.jpamorgan.com"],
          },
          prefersBorder: true,
        },
      },
    });
    expect(listed.result.resources[0]._meta.ui.domain).toBeUndefined();

    const read = await rpc("resources/read", { uri: ART_WIDGET_URI });
    const resource = read.result.contents[0];
    expect(resource.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(resource.text).toBe(artWidgetHtml);
    expect(resource._meta["openai/widgetDescription"]).toContain("John Philip Morgan");
  });

  test("calls the catalog boundary with validated defaults and returns matching structured content", async () => {
    const calls = [];
    const artworks = [
      {
        slug: "summer-meadow",
        title: "Summer Meadow",
        artist: "A. Artist",
        date: "2026",
        gallery: "Example Gallery",
        category: "Painting",
        styles: ["Landscape"],
        url: "https://art.jpamorgan.com/art/summer-meadow",
        thumbnailUrl: "https://api.art.jpamorgan.com/artifacts/art-1/thumbnail.jpg?v=abc",
        alt: "A green summer meadow.",
      },
    ];
    const response = await rpc(
      "tools/call",
      { name: "browse_art", arguments: { style: "landscape" } },
      dependencies({
        browseArt: async (input) => {
          calls.push(input);
          return artworks;
        },
      }),
    );

    expect(calls).toEqual([
      {
        limit: 6,
        sort: "recent",
        style: "landscape",
      },
    ]);
    expect(response.result.isError).toBeUndefined();
    expect(response.result.structuredContent).toEqual({ artworks });
    expect(response.result.content[0].text).toBe("Found 1 curated artwork.");
  });

  test("rejects invalid filters before the catalog boundary", async () => {
    let called = false;
    const response = await rpc(
      "tools/call",
      { name: "browse_art", arguments: { limit: 99, artist: "NOT A SLUG" } },
      dependencies({
        browseArt: async () => {
          called = true;
          return [];
        },
      }),
    );

    expect(called).toBe(false);
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain("Invalid arguments");
  });

  test("widget uses the MCP Apps lifecycle and never injects untrusted HTML", () => {
    const script = artWidgetHtml.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeString();
    expect(() => new Function(script)).not.toThrow();
    expect(artWidgetHtml).toContain('<meta name="color-scheme" content="light dark" />');
    expect(artWidgetHtml).toContain('request("ui/initialize"');
    expect(artWidgetHtml).toContain('message.method === "ui/notifications/tool-result"');
    expect(artWidgetHtml).toContain('notify("ui/notifications/initialized")');
    expect(artWidgetHtml).toContain('request("ui/open-link"');
    expect(artWidgetHtml).toContain(
      'if (button.textContent === "Opening…") button.textContent = label;',
    );
    expect(artWidgetHtml).toContain("Loading…");
    expect(artWidgetHtml).toContain("No matches");
    expect(artWidgetHtml).toContain("Gallery unavailable");
    expect(artWidgetHtml).not.toContain("innerHTML");
    expect(artWidgetHtml).not.toContain('request("tools/call"');
  });

  test("widget applies only validated host style tokens and has accessible dark fallbacks", () => {
    expect(artWidgetHtml).toContain("const allowedColorTokens = new Set([");
    expect(artWidgetHtml).toContain(
      'if (allowedColorTokens.has(name)) return CSS.supports("color", value)',
    );
    expect(artWidgetHtml).toContain("document.documentElement.style.setProperty(name, value)");
    expect(artWidgetHtml).toContain("else document.documentElement.style.removeProperty(name)");
    expect(artWidgetHtml).toContain("applyHostStyles(hostContext)");
    expect(artWidgetHtml).toContain(
      '[data-theme="dark"] { color: var(--color-text-primary, #f4f4f1); }',
    );
    expect(artWidgetHtml).toContain("color: var(--color-text-secondary, #b8b8b2);");
    expect(artWidgetHtml).toContain(
      "border-color: var(--color-border-tertiary, rgba(255, 255, 255, 0.18));",
    );
    expect(artWidgetHtml).toContain("outline-color: var(--color-ring-primary, #7ab8ff);");
    expect(artWidgetHtml).not.toContain("style.setProperty(name, variables[name])");
  });
});
