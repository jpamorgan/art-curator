import {
  ART_MCP_ENDPOINT,
  ART_MCP_APPS_EXTENSION_ID,
  ART_MCP_APPS_MIME_TYPE,
  ART_MCP_INSTRUCTIONS,
  ART_MCP_SERVER_NAME,
  ART_MCP_SERVER_VERSION,
  ART_MCP_TRANSPORT,
  ART_WIDGET_URI,
  BROWSE_ART_DESCRIPTION,
  BROWSE_ART_TOOL_NAME,
} from "./mcp";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS, POST";
const SERVER_CARD_URL = "https://art.jpamorgan.com/.well-known/mcp/server-card.json";
const AUTH_DOCUMENTATION_URL = "https://art.jpamorgan.com/auth.md";

export const mcpHttpDiscoveryDocument = {
  name: ART_MCP_SERVER_NAME,
  title: "Art by John Philip Morgan",
  description:
    "Public, read-only discovery of curated physical artworks through the Model Context Protocol.",
  version: ART_MCP_SERVER_VERSION,
  endpoint: ART_MCP_ENDPOINT,
  transport: ART_MCP_TRANSPORT,
  request: {
    method: "POST",
    contentType: "application/json",
    accept: ["application/json", "text/event-stream"],
    protocolVersionHeader: "MCP-Protocol-Version",
    serverInitiatedSse: false,
  },
  authentication: {
    required: false,
    schemes: [{ type: "noauth" }],
    description:
      "The MCP endpoint and browse_art tool are public. Do not send credentials or bearer tokens.",
  },
  instructions: ART_MCP_INSTRUCTIONS,
  capabilities: {
    extensions: {
      [ART_MCP_APPS_EXTENSION_ID]: {
        mimeTypes: [ART_MCP_APPS_MIME_TYPE],
      },
    },
    tools: [
      {
        name: BROWSE_ART_TOOL_NAME,
        description: BROWSE_ART_DESCRIPTION,
        readOnly: true,
      },
    ],
    resources: [
      {
        uri: ART_WIDGET_URI,
        description: "Interactive gallery UI for browse_art results.",
        mimeType: "text/html;profile=mcp-app",
      },
    ],
  },
  links: {
    serverCard: SERVER_CARD_URL,
    authentication: AUTH_DOCUMENTATION_URL,
  },
} as const;

function discoveryHeaders(): Headers {
  return new Headers({
    Allow: ALLOWED_METHODS,
    "Cache-Control": "public, max-age=300",
    Link: `<${SERVER_CARD_URL}>; rel="describedby"; type="application/mcp-server-card+json", <${AUTH_DOCUMENTATION_URL}>; rel="help"; type="text/markdown"`,
    Vary: "Accept",
  });
}

function requestsSse(request: Request): boolean {
  return (request.headers.get("Accept") ?? "")
    .split(",")
    .some((value) => value.trim().toLowerCase().startsWith("text/event-stream"));
}

export function handleMcpHttpDiscoveryRequest(request: Request): Response {
  const headers = discoveryHeaders();

  if (request.method === "GET" || request.method === "HEAD") {
    if (requestsSse(request)) {
      if (request.method === "HEAD") {
        headers.set("Content-Type", "application/json; charset=UTF-8");
        return new Response(null, { status: 405, headers });
      }
      return Response.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32_000,
            message:
              "This stateless MCP server does not provide an SSE receive stream. Send MCP requests with POST.",
          },
          id: null,
        },
        { status: 405, headers },
      );
    }
    headers.set("Content-Type", "application/json; charset=UTF-8");
    return new Response(
      request.method === "HEAD" ? null : JSON.stringify(mcpHttpDiscoveryDocument),
      { status: 200, headers },
    );
  }

  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32_000, message: "Method not allowed. Send MCP requests with POST." },
      id: null,
    },
    { status: 405, headers },
  );
}
