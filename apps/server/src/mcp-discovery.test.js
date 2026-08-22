import { beforeAll, describe, expect, test } from "bun:test";

import {
  ART_MCP_APPS_EXTENSION_ID,
  ART_MCP_APPS_MIME_TYPE,
  ART_MCP_ENDPOINT,
  ART_MCP_SERVER_NAME,
  ART_MCP_SERVER_VERSION,
} from "./mcp";

const publicRoot = new URL("../../web/public/", import.meta.url);

async function readPublicFile(path) {
  return Bun.file(new URL(path, publicRoot)).text();
}

let serverCard;
let instructions;

beforeAll(async () => {
  const [serverCardText, llmsText] = await Promise.all([
    readPublicFile(".well-known/mcp/server-card.json"),
    readPublicFile("llms.txt"),
  ]);
  serverCard = JSON.parse(serverCardText);
  instructions = llmsText;
});

describe("crawler-visible MCP discovery", () => {
  test("publishes a server card aligned with the live MCP contract", () => {
    expect(serverCard).toMatchObject({
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: ART_MCP_SERVER_NAME,
      title: "Art by John Philip Morgan",
      version: ART_MCP_SERVER_VERSION,
      websiteUrl: "https://art.jpamorgan.com/",
      remotes: [
        {
          type: "streamable-http",
          url: ART_MCP_ENDPOINT,
        },
      ],
      capabilities: {
        tools: true,
        resources: true,
        extensions: {
          [ART_MCP_APPS_EXTENSION_ID]: {
            mimeTypes: [ART_MCP_APPS_MIME_TYPE],
          },
        },
      },
    });
    expect(serverCard.description.length).toBeLessThanOrEqual(100);
    expect(serverCard.tools).toBeUndefined();
  });

  test("links the server card and endpoint from llms.txt", () => {
    expect(instructions).toContain(`[Streamable HTTP MCP endpoint](${ART_MCP_ENDPOINT})`);
    expect(instructions).toContain(
      "[MCP server card](https://art.jpamorgan.com/.well-known/mcp/server-card.json)",
    );
  });
});
