import { describe, expect, test } from "bun:test";

import { handleMcpHttpDiscoveryRequest, mcpHttpDiscoveryDocument } from "./mcp-http-discovery";
import {
  ART_MCP_ENDPOINT,
  ART_MCP_APPS_EXTENSION_ID,
  ART_MCP_APPS_MIME_TYPE,
  ART_MCP_SERVER_NAME,
  ART_MCP_SERVER_VERSION,
  ART_MCP_TRANSPORT,
  ART_WIDGET_URI,
  BROWSE_ART_DESCRIPTION,
  BROWSE_ART_TOOL_NAME,
} from "./mcp";

const endpoint = "https://api.art.jpamorgan.com/mcp";

describe("MCP HTTP discovery", () => {
  test("GET describes the real anonymous MCP transport, app resource, and art tool", async () => {
    const response = handleMcpHttpDiscoveryRequest(new Request(endpoint));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=UTF-8");
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
    expect(response.headers.get("link")).toContain('rel="describedby"');
    expect(response.headers.get("link")).toContain('type="application/mcp-server-card+json"');
    expect(await response.json()).toEqual(mcpHttpDiscoveryDocument);
    expect(mcpHttpDiscoveryDocument).toMatchObject({
      name: ART_MCP_SERVER_NAME,
      title: "Art by John Philip Morgan",
      version: ART_MCP_SERVER_VERSION,
      endpoint: ART_MCP_ENDPOINT,
      transport: ART_MCP_TRANSPORT,
      request: { method: "POST", protocolVersionHeader: "MCP-Protocol-Version" },
      authentication: {
        required: false,
        schemes: [{ type: "noauth" }],
      },
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
        resources: [{ uri: ART_WIDGET_URI, mimeType: "text/html;profile=mcp-app" }],
      },
    });
  });

  test("retains Streamable HTTP GET semantics for clients requesting an SSE stream", async () => {
    const response = handleMcpHttpDiscoveryRequest(
      new Request(endpoint, { headers: { Accept: "text/event-stream" } }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("vary")).toContain("Accept");
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32_000,
        message:
          "This stateless MCP server does not provide an SSE receive stream. Send MCP requests with POST.",
      },
      id: null,
    });
  });

  test("does not treat a mixed SSE Accept header as a discovery request", () => {
    const response = handleMcpHttpDiscoveryRequest(
      new Request(endpoint, {
        headers: { Accept: "application/json, text/event-stream; q=0.9" },
      }),
    );

    expect(response.status).toBe(405);
  });

  test("does not invent OAuth metadata for an endpoint that accepts no credentials", () => {
    const serialized = JSON.stringify(mcpHttpDiscoveryDocument);

    expect(serialized).not.toContain("authorization_endpoint");
    expect(serialized).not.toContain("authorizationServer");
    expect(serialized).not.toContain("registration_endpoint");
    expect(serialized).not.toContain("revocation_endpoint");
    expect(serialized).not.toContain("token_endpoint");
  });

  test("HEAD returns discovery headers without a body", async () => {
    const response = handleMcpHttpDiscoveryRequest(new Request(endpoint, { method: "HEAD" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=UTF-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await response.text()).toBe("");
  });

  test("HEAD mirrors the negotiated GET status without returning an SSE error body", async () => {
    const response = handleMcpHttpDiscoveryRequest(
      new Request(endpoint, { method: "HEAD", headers: { Accept: "text/event-stream" } }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("vary")).toContain("Accept");
    expect(response.headers.get("content-type")).toBe("application/json; charset=UTF-8");
    expect(await response.text()).toBe("");
  });

  test("unsupported transport methods keep the JSON-RPC error and advertise discovery", async () => {
    const response = handleMcpHttpDiscoveryRequest(new Request(endpoint, { method: "DELETE" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32_000, message: "Method not allowed. Send MCP requests with POST." },
      id: null,
    });
  });
});
