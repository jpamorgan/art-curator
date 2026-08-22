import {
  EXTENSION_ID,
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

export const ART_WIDGET_URI = "ui://art-curator/browse-art/v1.html";
export const ART_MCP_ENDPOINT = "https://api.art.jpamorgan.com/mcp";
export const ART_MCP_TRANSPORT = "streamable-http";
export const ART_MCP_SERVER_NAME = "com.jpamorgan.art/catalog";
export const ART_MCP_SERVER_VERSION = "1.0.0";
export const ART_MCP_APPS_EXTENSION_ID = EXTENSION_ID;
export const ART_MCP_APPS_MIME_TYPE = RESOURCE_MIME_TYPE;
export const BROWSE_ART_TOOL_NAME = "browse_art";
export const BROWSE_ART_DESCRIPTION =
  "Use this when someone wants to discover, browse, compare, or discuss curated physical artworks in the public Art by John Philip Morgan catalog.";
export const ART_MCP_INSTRUCTIONS =
  "Use browse_art for public art discovery. It requires no authentication and never changes catalog or user data.";

const WIDGET_DESCRIPTION =
  "A compact Art by John Philip Morgan gallery with artist, date, gallery, style, and canonical artwork links.";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug.");

const browseArtInputSchema = {
  limit: z.number().int().min(1).max(12).default(6).describe("Number of artworks to return."),
  sort: z
    .enum(["recent", "title", "artist"])
    .default("recent")
    .describe("Order the catalog by newest curation, artwork title, or artist name."),
  category: slugSchema.optional().describe("Optional category slug, such as painting."),
  style: slugSchema.optional().describe("Optional style slug, such as surrealism."),
  gallery: slugSchema.optional().describe("Optional gallery slug."),
  artist: slugSchema.optional().describe("Optional artist slug."),
};

const artworkResultSchema = z.object({
  slug: z.string(),
  title: z.string(),
  artist: z.string(),
  date: z.string(),
  gallery: z.string(),
  category: z.string(),
  styles: z.array(z.string()),
  url: z.url(),
  thumbnailUrl: z.url(),
  alt: z.string(),
});

const browseArtOutputSchema = {
  artworks: z.array(artworkResultSchema),
};

export type BrowseArtInput = {
  limit: number;
  sort: "recent" | "title" | "artist";
  category?: string;
  style?: string;
  gallery?: string;
  artist?: string;
};

export type BrowseArtResult = z.infer<typeof artworkResultSchema>;

export type McpDependencies = {
  assetOrigin: string;
  browseArt(input: BrowseArtInput): Promise<BrowseArtResult[]>;
};

const TEXT_FALLBACK_LIMIT = 6_000;

function singleLine(value: string, limit: number, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

export function formatBrowseArtText(artworks: readonly BrowseArtResult[]): string {
  if (artworks.length === 0) return "No curated artworks matched those filters.";

  const heading = `Found ${artworks.length} curated artwork${artworks.length === 1 ? "" : "s"}.`;
  const sections = [heading];
  let length = heading.length;
  let listed = 0;

  for (const [index, artwork] of artworks.slice(0, 12).entries()) {
    const title = singleLine(artwork.title, 120, "Untitled");
    const artist = singleLine(artwork.artist, 100, "Unknown artist");
    const date = singleLine(artwork.date, 40, "Date unknown");
    const gallery = singleLine(artwork.gallery, 120, "Gallery unknown");
    const url = singleLine(artwork.url, 240, "Canonical URL unavailable");
    const section = `${index + 1}. ${title} — ${artist}\n   ${date} · ${gallery}\n   ${url}`;

    if (length + section.length + 2 > TEXT_FALLBACK_LIMIT) break;
    sections.push(section);
    length += section.length + 2;
    listed += 1;
  }

  if (listed < artworks.length) {
    sections.push(
      `Additional results omitted from the text fallback (${artworks.length - listed}).`,
    );
  }

  return sections.join("\n\n");
}

function normalizeAssetOrigin(value: string): string {
  const url = new URL(value);
  const isLocal =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error("MCP widget assets require an HTTPS or local development origin.");
  }
  return url.origin;
}

export const artWidgetHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Art by John Philip Morgan gallery</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: var(--font-sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        background: transparent;
        color: var(--color-text-primary, #161616);
      }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 12px; background: transparent; }
      button { font: inherit; }
      .shell {
        overflow: hidden;
        border: 1px solid var(--color-border-tertiary, rgba(22, 22, 22, 0.13));
        border-radius: var(--border-radius-lg, 16px);
        background: var(--color-background-primary, #fff);
        box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.06));
      }
      header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 16px 12px;
        border-bottom: 1px solid var(--color-border-tertiary, rgba(22, 22, 22, 0.1));
      }
      h1 { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.015em; }
      .eyebrow {
        margin: 0 0 4px;
        color: var(--color-text-secondary, #686868);
        font-size: 11px;
        font-weight: 650;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .count { color: var(--color-text-secondary, #686868); font-size: 12px; white-space: nowrap; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
        gap: 1px;
        background: var(--color-border-tertiary, rgba(22, 22, 22, 0.1));
      }
      article { min-width: 0; background: var(--color-background-primary, #fff); }
      .image-wrap { aspect-ratio: 4 / 3; overflow: hidden; background: var(--color-background-secondary, #f0efec); }
      img { width: 100%; height: 100%; display: block; object-fit: cover; }
      .copy { padding: 13px 14px 15px; }
      h2 { margin: 0; font-size: 14px; font-weight: 650; line-height: 1.3; }
      .artist { margin: 4px 0 0; font-size: 13px; line-height: 1.4; }
      .details {
        margin: 8px 0 0;
        color: var(--color-text-secondary, #686868);
        font-size: 11px;
        line-height: 1.45;
      }
      .tags { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0 0; }
      .tag {
        border-radius: 999px;
        padding: 3px 7px;
        background: var(--color-background-secondary, #f0efec);
        color: var(--color-text-secondary, #555);
        font-size: 10px;
        line-height: 1.2;
      }
      .open {
        margin-top: 12px;
        border: 0;
        border-radius: var(--border-radius-md, 8px);
        padding: 7px 9px;
        background: var(--color-background-secondary, #efefed);
        color: var(--color-text-primary, #161616);
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
      }
      .open:hover { background: var(--color-background-tertiary, #e5e4e1); }
      .open:focus-visible { outline: 2px solid var(--color-ring-primary, #3078d7); outline-offset: 2px; }
      .open[disabled] { cursor: wait; opacity: 0.6; }
      .state { padding: 28px 18px; text-align: center; }
      .state strong { display: block; font-size: 14px; }
      .state span { display: block; margin-top: 5px; color: var(--color-text-secondary, #686868); font-size: 12px; }
      .skeleton { min-height: 238px; background: var(--color-background-primary, #fff); }
      .skeleton::before {
        content: "";
        display: block;
        aspect-ratio: 4 / 3;
        background: linear-gradient(100deg, #ecebe8 20%, #f6f5f2 40%, #ecebe8 60%);
        background-size: 200% 100%;
        animation: shimmer 1.3s infinite linear;
      }
      .skeleton::after {
        content: "";
        display: block;
        width: 55%;
        height: 12px;
        margin: 16px 14px;
        border-radius: 999px;
        background: var(--color-background-secondary, #ecebe8);
      }
      [data-theme="dark"] { color-scheme: dark; }
      [data-theme="dark"] { color: var(--color-text-primary, #f4f4f1); }
      [data-theme="dark"] .shell,
      [data-theme="dark"] article,
      [data-theme="dark"] .skeleton { background: var(--color-background-primary, #181818); }
      [data-theme="dark"] .shell { border-color: var(--color-border-tertiary, rgba(255, 255, 255, 0.18)); }
      [data-theme="dark"] header { border-bottom-color: var(--color-border-tertiary, rgba(255, 255, 255, 0.16)); }
      [data-theme="dark"] .grid { background: var(--color-border-tertiary, rgba(255, 255, 255, 0.16)); }
      [data-theme="dark"] .eyebrow,
      [data-theme="dark"] .count,
      [data-theme="dark"] .details,
      [data-theme="dark"] .state span { color: var(--color-text-secondary, #b8b8b2); }
      [data-theme="dark"] .image-wrap,
      [data-theme="dark"] .tag,
      [data-theme="dark"] .open { background: var(--color-background-secondary, #292929); }
      [data-theme="dark"] .tag { color: var(--color-text-secondary, #d2d2cc); }
      [data-theme="dark"] .open { color: var(--color-text-primary, #f4f4f1); }
      [data-theme="dark"] .open:hover { background: var(--color-background-tertiary, #363636); }
      [data-theme="dark"] .open:focus-visible { outline-color: var(--color-ring-primary, #7ab8ff); }
      [data-theme="dark"] .skeleton::after { background: var(--color-background-secondary, #30302f); }
      [data-theme="dark"] .skeleton::before {
        background: linear-gradient(100deg, #242424 20%, #383837 40%, #242424 60%);
        background-size: 200% 100%;
      }
      @keyframes shimmer { to { background-position-x: -200%; } }
      @media (prefers-reduced-motion: reduce) { .skeleton::before { animation: none; } }
    </style>
  </head>
  <body>
    <main class="shell" aria-live="polite">
      <header>
        <div><p class="eyebrow">Art by John Philip Morgan</p><h1>Curated discoveries</h1></div>
        <span class="count" id="count">Loading…</span>
      </header>
      <section class="grid" id="gallery" aria-label="Curated artworks">
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      </section>
      <section class="state" id="state" hidden><strong id="state-title"></strong><span id="state-copy"></span></section>
    </main>
    <script>
      (() => {
        "use strict";
        const gallery = document.getElementById("gallery");
        const state = document.getElementById("state");
        const stateTitle = document.getElementById("state-title");
        const stateCopy = document.getElementById("state-copy");
        const count = document.getElementById("count");
        const pending = new Map();
        const requestIdPrefix = "art-view-" + (
          globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
        ) + "-";
        const allowedColorTokens = new Set([
          "--color-background-primary",
          "--color-background-secondary",
          "--color-background-tertiary",
          "--color-text-primary",
          "--color-text-secondary",
          "--color-border-tertiary",
          "--color-ring-primary",
        ]);
        const allowedLengthTokens = new Set(["--border-radius-md", "--border-radius-lg"]);
        let nextId = 1;
        let initialized = false;

        const text = (value, fallback = "") => typeof value === "string" ? value.slice(0, 500) : fallback;
        const trustedUrl = (value, kind) => {
          if (typeof value !== "string") return null;
          try {
            const url = new URL(value);
            const local = (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "http:";
            const expected = kind === "image" ? "api.art.jpamorgan.com" : "art.jpamorgan.com";
            return (url.protocol === "https:" && url.hostname === expected) || local ? url.href : null;
          } catch { return null; }
        };
        const send = (message) => window.parent.postMessage(message, "*");
        const notify = (method, params = {}) => send({ jsonrpc: "2.0", method, params });
        const request = (method, params) => new Promise((resolve, reject) => {
          const id = requestIdPrefix + String(nextId++);
          const timeout = window.setTimeout(() => {
            pending.delete(id);
            reject(new Error("The host did not respond."));
          }, 8000);
          pending.set(id, { resolve, reject, timeout });
          send({ jsonrpc: "2.0", id, method, params });
        });

        const reportSize = () => {
          if (!initialized) return;
          requestAnimationFrame(() => notify("ui/notifications/size-changed", {
            height: Math.ceil(document.documentElement.getBoundingClientRect().height),
          }));
        };
        const showState = (title, copy) => {
          gallery.hidden = true;
          state.hidden = false;
          count.textContent = "";
          stateTitle.textContent = title;
          stateCopy.textContent = copy;
          reportSize();
        };
        const safeCssValue = (name, value) => {
          if (typeof value !== "string" || value.length < 1 || value.length > 120) return false;
          if ([";", "{", "}", String.fromCharCode(92), String.fromCharCode(34), "'"].some((token) => value.includes(token))) return false;
          if (value.toLowerCase().includes("url")) return false;
          if (allowedColorTokens.has(name)) return CSS.supports("color", value);
          if (allowedLengthTokens.has(name)) return /^(?:0|\\d+(?:\\.\\d+)?(?:px|rem|em|%))$/.test(value);
          return false;
        };
        const applyHostStyles = (hostContext) => {
          const variables = hostContext && hostContext.styles && hostContext.styles.variables;
          if (!variables || typeof variables !== "object") return;
          for (const name of [...allowedColorTokens, ...allowedLengthTokens]) {
            if (!Object.hasOwn(variables, name)) continue;
            const value = variables[name];
            if (safeCssValue(name, value)) document.documentElement.style.setProperty(name, value);
            else document.documentElement.style.removeProperty(name);
          }
        };
        const applyHostContext = (hostContext) => {
          applyHostStyles(hostContext);
          if (hostContext && (hostContext.theme === "light" || hostContext.theme === "dark")) {
            document.documentElement.dataset.theme = hostContext.theme;
          }
        };
        const openArtwork = async (button, url) => {
          button.disabled = true;
          const label = button.textContent;
          button.textContent = "Opening…";
          try {
            await request("ui/open-link", { url });
          } catch {
            button.textContent = "Could not open";
            window.setTimeout(() => { button.textContent = label; }, 1600);
          } finally {
            if (button.textContent === "Opening…") button.textContent = label;
            button.disabled = false;
          }
        };
        const render = (result) => {
          if (result && result.isError) {
            showState("Gallery unavailable", "The catalog could not be loaded. Try again in a moment.");
            return;
          }
          const artworks = result && result.structuredContent && result.structuredContent.artworks;
          if (!Array.isArray(artworks)) {
            showState("Unexpected response", "The gallery received data it could not safely display.");
            return;
          }
          if (artworks.length === 0) {
            showState("No matches", "Try a broader category, style, gallery, or artist.");
            return;
          }

          const fragment = document.createDocumentFragment();
          for (const artwork of artworks.slice(0, 12)) {
            if (!artwork || typeof artwork !== "object") continue;
            const article = document.createElement("article");
            const imageUrl = trustedUrl(artwork.thumbnailUrl, "image");
            if (imageUrl) {
              const wrap = document.createElement("div");
              wrap.className = "image-wrap";
              const image = document.createElement("img");
              image.src = imageUrl;
              image.alt = text(artwork.alt, "Curated artwork");
              image.loading = "lazy";
              image.addEventListener("error", () => { wrap.hidden = true; }, { once: true });
              wrap.append(image);
              article.append(wrap);
            }
            const copy = document.createElement("div");
            copy.className = "copy";
            const title = document.createElement("h2");
            title.textContent = text(artwork.title, "Untitled");
            const artist = document.createElement("p");
            artist.className = "artist";
            artist.textContent = text(artwork.artist, "Unknown artist");
            const details = document.createElement("p");
            details.className = "details";
            details.textContent = [text(artwork.date), text(artwork.gallery)].filter(Boolean).join(" · ");
            copy.append(title, artist, details);

            const tags = [text(artwork.category), ...(Array.isArray(artwork.styles) ? artwork.styles.map((item) => text(item)) : [])]
              .filter(Boolean).slice(0, 3);
            if (tags.length) {
              const tagList = document.createElement("div");
              tagList.className = "tags";
              for (const value of tags) {
                const tag = document.createElement("span");
                tag.className = "tag";
                tag.textContent = value;
                tagList.append(tag);
              }
              copy.append(tagList);
            }
            const url = trustedUrl(artwork.url, "page");
            if (url) {
              const button = document.createElement("button");
              button.className = "open";
              button.type = "button";
              button.textContent = "View artwork ↗";
              button.addEventListener("click", () => openArtwork(button, url));
              copy.append(button);
            }
            article.append(copy);
            fragment.append(article);
          }
          if (!fragment.childNodes.length) {
            showState("No displayable art", "The result did not contain safe artwork cards.");
            return;
          }
          gallery.replaceChildren(fragment);
          gallery.hidden = false;
          state.hidden = true;
          count.textContent = artworks.length === 1 ? "1 work" : String(artworks.length) + " works";
          reportSize();
        };

        const teardown = () => {
          initialized = false;
          for (const entry of pending.values()) {
            window.clearTimeout(entry.timeout);
            entry.reject(new Error("The host closed this view."));
          }
          pending.clear();
          window.removeEventListener("message", handleMessage);
        };
        const handleMessage = (event) => {
          if (event.source !== window.parent) return;
          const message = event.data;
          if (!message || message.jsonrpc !== "2.0") return;
          if (message.method === "ui/resource-teardown") {
            if (message.id !== undefined) {
              send({ jsonrpc: "2.0", id: message.id, result: {} });
            }
            teardown();
            return;
          }
          if (message.method === "ping") {
            if (message.id !== undefined) {
              send({ jsonrpc: "2.0", id: message.id, result: {} });
            }
            return;
          }
          const isResponse = message.method === undefined && message.id !== undefined
            && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"));
          if (isResponse && pending.has(message.id)) {
            const entry = pending.get(message.id);
            pending.delete(message.id);
            window.clearTimeout(entry.timeout);
            if (message.error) entry.reject(message.error);
            else entry.resolve(message.result);
            return;
          }
          if (message.method === "ui/notifications/tool-result") render(message.params);
          if (message.method === "ui/notifications/tool-cancelled") {
            showState("Request cancelled", text(message.params && message.params.reason, "The host cancelled this request."));
          }
          if (message.method === "ui/notifications/host-context-changed") applyHostContext(message.params);
        };
        window.addEventListener("message", handleMessage, { passive: true });

        request("ui/initialize", {
          appInfo: { name: "Art by John Philip Morgan Gallery", version: "1.0.0" },
          appCapabilities: { availableDisplayModes: ["inline"] },
          protocolVersion: "2026-01-26",
        }).then((result) => {
          applyHostContext(result && result.hostContext);
          notify("ui/notifications/initialized");
          initialized = true;
          reportSize();
        }).catch(() => showState("Unable to connect", "This host did not initialize the MCP Apps bridge."));
      })();
    </script>
  </body>
</html>`;

export function createArtMcpServer(dependencies: McpDependencies): McpServer {
  const assetOrigin = normalizeAssetOrigin(dependencies.assetOrigin);
  const resourceMeta = {
    ui: {
      csp: {
        connectDomains: [] as string[],
        resourceDomains: [assetOrigin],
      },
      prefersBorder: true,
    },
    "openai/widgetDescription": WIDGET_DESCRIPTION,
  };
  const server = new McpServer(
    { name: ART_MCP_SERVER_NAME, version: ART_MCP_SERVER_VERSION },
    {
      instructions: ART_MCP_INSTRUCTIONS,
    },
  );
  server.server.registerCapabilities({
    extensions: {
      [ART_MCP_APPS_EXTENSION_ID]: {
        mimeTypes: [ART_MCP_APPS_MIME_TYPE],
      },
    },
  });

  registerAppResource(
    server,
    "Art by John Philip Morgan gallery",
    ART_WIDGET_URI,
    {
      title: "Art by John Philip Morgan gallery",
      description: WIDGET_DESCRIPTION,
      _meta: resourceMeta,
    },
    async () => ({
      contents: [
        {
          uri: ART_WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: artWidgetHtml,
          _meta: resourceMeta,
        },
      ],
    }),
  );

  registerAppTool(
    server,
    BROWSE_ART_TOOL_NAME,
    {
      title: "Browse curated art",
      description: BROWSE_ART_DESCRIPTION,
      inputSchema: browseArtInputSchema,
      outputSchema: browseArtOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        // MCP SDK 1.30.0 has no public top-level securitySchemes field in ToolConfig or
        // ToolSchema. Keep the official OpenAI compatibility mirror until the SDK adds it.
        securitySchemes: [{ type: "noauth" }],
        ui: { resourceUri: ART_WIDGET_URI, visibility: ["model"] },
        "openai/toolInvocation/invoking": "Browsing the collection…",
        "openai/toolInvocation/invoked": "Collection ready",
      },
    },
    async (input) => {
      try {
        const artworks = await dependencies.browseArt(input as BrowseArtInput);
        return {
          structuredContent: { artworks },
          content: [
            {
              type: "text",
              text: formatBrowseArtText(artworks),
            },
          ],
        };
      } catch (error) {
        console.error("MCP art browsing failed", error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "The public art catalog is temporarily unavailable.",
            },
          ],
        };
      }
    },
  );

  return server;
}

export async function handleMcpRequest(
  request: Request,
  dependencies: McpDependencies,
): Promise<Response> {
  const server = createArtMcpServer(dependencies);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
