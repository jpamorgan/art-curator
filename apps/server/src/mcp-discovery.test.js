import { beforeAll, describe, expect, test } from "bun:test";

import {
  ART_MCP_ENDPOINT,
  ART_MCP_INSTRUCTIONS,
  ART_MCP_SERVER_VERSION,
  ART_MCP_TRANSPORT,
  BROWSE_ART_DESCRIPTION,
  BROWSE_ART_TOOL_NAME,
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
      name: "Art by John Philip Morgan",
      version: ART_MCP_SERVER_VERSION,
      kind: "product",
      serverUrl: ART_MCP_ENDPOINT,
      transport: ART_MCP_TRANSPORT,
      instructions: ART_MCP_INSTRUCTIONS,
      capabilities: { tools: true, resources: true },
    });
    expect(serverCard.url).toBeUndefined();
    expect(serverCard.icon).toBeUndefined();
    expect(serverCard.tools).toEqual([
      {
        name: BROWSE_ART_TOOL_NAME,
        description: BROWSE_ART_DESCRIPTION,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
    ]);
  });

  test("links the server card and endpoint from llms.txt", () => {
    expect(instructions).toContain(`[Streamable HTTP MCP endpoint](${ART_MCP_ENDPOINT})`);
    expect(instructions).toContain(
      "[MCP server card](https://art.jpamorgan.com/.well-known/mcp/server-card.json)",
    );
  });
});
