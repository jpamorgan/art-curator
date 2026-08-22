import { describe, expect, test } from "bun:test";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import {
  ART_MCP_APPS_EXTENSION_ID,
  ART_MCP_APPS_MIME_TYPE,
  ART_MCP_SERVER_NAME,
  ART_MCP_SERVER_VERSION,
  ART_WIDGET_URI,
  artWidgetHtml,
  formatBrowseArtText,
  handleMcpRequest,
} from "./mcp";

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
      capabilities: {
        extensions: {
          [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] },
        },
      },
      clientInfo: { name: "contract-test", version: "1.0.0" },
    });

    expect(response.result.serverInfo).toEqual({
      name: ART_MCP_SERVER_NAME,
      version: ART_MCP_SERVER_VERSION,
    });
    expect(response.result.instructions).toStartWith("Use browse_art");
    expect(response.result.capabilities.tools).toBeDefined();
    expect(response.result.capabilities.resources).toBeDefined();
    expect(ART_MCP_APPS_EXTENSION_ID).toBe("io.modelcontextprotocol/ui");
    expect(ART_MCP_APPS_MIME_TYPE).toBe("text/html;profile=mcp-app");
    expect(response.result.capabilities.extensions).toEqual({
      [ART_MCP_APPS_EXTENSION_ID]: {
        mimeTypes: [ART_MCP_APPS_MIME_TYPE],
      },
    });
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
      name: "Art by John Philip Morgan gallery",
      title: "Art by John Philip Morgan gallery",
      description: expect.stringContaining("John Philip Morgan"),
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
    expect(resource._meta.ui).toEqual({
      csp: {
        connectDomains: [],
        resourceDomains: ["https://api.art.jpamorgan.com"],
      },
      prefersBorder: true,
    });
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
    expect(response.result.content[0].text).toBe(
      "Found 1 curated artwork.\n\n" +
        "1. Summer Meadow — A. Artist\n" +
        "   2026 · Example Gallery\n" +
        "   https://art.jpamorgan.com/art/summer-meadow",
    );
  });

  test("returns a bounded, useful text fallback for hosts without MCP Apps", () => {
    const artworks = Array.from({ length: 12 }, (_, index) => ({
      slug: `work-${index}`,
      title: `Work ${index} ${"T".repeat(500)}`,
      artist: `Artist ${index} ${"A".repeat(500)}`,
      date: `202${index % 10} ${"D".repeat(100)}`,
      gallery: `Gallery ${index} ${"G".repeat(500)}`,
      category: "Painting",
      styles: ["Landscape"],
      url: `https://art.jpamorgan.com/art/work-${index}-${"u".repeat(500)}`,
      thumbnailUrl: `https://api.art.jpamorgan.com/artifacts/work-${index}/thumbnail.jpg`,
      alt: "Artwork",
    }));

    const fallback = formatBrowseArtText(artworks);
    expect(fallback.length).toBeLessThanOrEqual(6_000);
    expect(fallback).toStartWith("Found 12 curated artworks.");
    expect(fallback).toContain("1. Work 0");
    expect(fallback).toContain("Artist 0");
    expect(fallback).toContain("2020");
    expect(fallback).toContain("Gallery 0");
    expect(fallback).toContain("https://art.jpamorgan.com/art/work-0-");
    expect(fallback).toContain("Additional results omitted from the text fallback");
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
    expect(artWidgetHtml).toContain('const requestIdPrefix = "art-view-"');
    expect(artWidgetHtml).toContain("message.method === undefined");
    expect(artWidgetHtml).toContain('message.method === "ui/resource-teardown"');
    expect(artWidgetHtml).toContain('send({ jsonrpc: "2.0", id: message.id, result: {} })');
    expect(artWidgetHtml).toContain('window.removeEventListener("message", handleMessage)');
    expect(artWidgetHtml).toContain(
      'if (button.textContent === "Opening…") button.textContent = label;',
    );
    expect(artWidgetHtml).toContain("Loading…");
    expect(artWidgetHtml).toContain("No matches");
    expect(artWidgetHtml).toContain("Gallery unavailable");
    expect(artWidgetHtml).not.toContain("innerHTML");
    expect(artWidgetHtml).not.toContain('request("tools/call"');
  });

  test("widget distinguishes colliding host requests and acknowledges resource teardown", async () => {
    const script = artWidgetHtml.match(/<script>([\s\S]*)<\/script>/)?.[1];
    const sent = [];
    let messageHandler;
    let removedHandler;
    const parent = { postMessage: (message) => sent.push(message) };
    const element = () => ({
      hidden: false,
      textContent: "",
      style: { setProperty() {}, removeProperty() {} },
    });
    const elements = new Map(
      ["gallery", "state", "state-title", "state-copy", "count"].map((id) => [id, element()]),
    );
    const documentElement = {
      dataset: {},
      style: { setProperty() {}, removeProperty() {} },
      getBoundingClientRect: () => ({ height: 100 }),
    };
    const fakeDocument = {
      documentElement,
      getElementById: (id) => elements.get(id),
    };
    const fakeWindow = {
      parent,
      setTimeout,
      clearTimeout,
      addEventListener: (type, handler) => {
        if (type === "message") messageHandler = handler;
      },
      removeEventListener: (type, handler) => {
        if (type === "message") removedHandler = handler;
      },
    };

    new Function("window", "document", "globalThis", "requestAnimationFrame", "CSS", script)(
      fakeWindow,
      fakeDocument,
      { crypto: { randomUUID: () => "request-scope" } },
      (callback) => callback(),
      { supports: () => true },
    );

    expect(messageHandler).toBeFunction();
    expect(sent[0]).toMatchObject({
      jsonrpc: "2.0",
      id: "art-view-request-scope-1",
      method: "ui/initialize",
    });

    messageHandler({
      source: parent,
      data: { jsonrpc: "2.0", id: "host-ping", method: "ping" },
    });
    expect(sent[1]).toEqual({ jsonrpc: "2.0", id: "host-ping", result: {} });

    messageHandler({
      source: parent,
      data: {
        jsonrpc: "2.0",
        id: "art-view-request-scope-1",
        method: "host/request-with-colliding-id",
      },
    });
    expect(sent).toHaveLength(2);

    messageHandler({
      source: parent,
      data: {
        jsonrpc: "2.0",
        id: "art-view-request-scope-1",
        method: "ui/resource-teardown",
        params: {},
      },
    });
    await Promise.resolve();

    expect(sent[2]).toEqual({
      jsonrpc: "2.0",
      id: "art-view-request-scope-1",
      result: {},
    });
    expect(removedHandler).toBe(messageHandler);
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
