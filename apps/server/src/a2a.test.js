import { describe, expect, test } from "bun:test";
import { Role, TaskState } from "@a2a-js/sdk";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";

import {
  ART_A2A_AGENT_CARD,
  ART_A2A_ENDPOINT,
  ART_A2A_MAX_INPUT_CHARS,
  ART_A2A_PROTOCOL_BINDING,
  ART_A2A_PROTOCOL_VERSION,
  createArtA2ARuntime,
  formatArtA2AResults,
  parseArtA2AInput,
} from "./a2a";

function userMessage(text, overrides = {}) {
  return {
    messageId: crypto.randomUUID(),
    contextId: "",
    taskId: "",
    role: Role.ROLE_USER,
    parts: [
      {
        content: { $case: "text", value: text },
        filename: "",
        mediaType: "text/plain",
        metadata: undefined,
      },
    ],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
    ...overrides,
  };
}

function sendRequest(message, configuration = undefined) {
  return {
    tenant: "",
    message,
    configuration,
    metadata: undefined,
  };
}

async function clientFor(runtime, observeRequest = () => {}) {
  const transport = new JsonRpcTransportFactory({
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      observeRequest(request);
      return runtime.handleRequest(request);
    },
  });
  return new ClientFactory({ transports: [transport] }).createFromAgentCard(runtime.agentCard);
}

const artwork = {
  title: "A Bigger Splash",
  artist: "David Hockney",
  date: "1967",
  gallery: "Tate",
  url: "https://art.jpamorgan.com/art/a-bigger-splash",
};

describe("A2A agent card", () => {
  test("honestly advertises the implemented anonymous A2A v1.0 JSON-RPC interface", () => {
    expect(ART_A2A_AGENT_CARD).toMatchObject({
      name: "Art by John Philip Morgan Catalog Agent",
      supportedInterfaces: [
        {
          url: ART_A2A_ENDPOINT,
          protocolBinding: ART_A2A_PROTOCOL_BINDING,
          protocolVersion: ART_A2A_PROTOCOL_VERSION,
          tenant: "",
        },
      ],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        extendedAgentCard: false,
        extensions: [],
      },
      securitySchemes: {},
      securityRequirements: [],
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain", "application/json"],
    });
    expect(ART_A2A_PROTOCOL_BINDING).toBe("JSONRPC");
    expect(ART_A2A_PROTOCOL_VERSION).toBe("1.0");
    expect(ART_A2A_AGENT_CARD.skills).toEqual([
      expect.objectContaining({
        id: "browse-art-catalog",
        inputModes: ["text/plain"],
        outputModes: ["text/plain", "application/json"],
        securityRequirements: [],
      }),
    ]);
    expect(JSON.stringify(ART_A2A_AGENT_CARD)).not.toMatch(
      /authorization|bearer|oauth|registration_endpoint|token_endpoint/i,
    );
  });

  test("keeps the public well-known card byte-for-byte aligned with the runtime card", async () => {
    const staticCard = await Bun.file(
      new URL("../../web/public/.well-known/agent-card.json", import.meta.url),
    ).json();

    expect(staticCard).toEqual(ART_A2A_AGENT_CARD);
  });
});

describe("Art catalog A2A executor", () => {
  test("uses the official SDK client and returns useful text plus structured catalog results", async () => {
    const calls = [];
    const seenHeaders = [];
    const runtime = createArtA2ARuntime({
      async browseArt(input, signal) {
        calls.push(input);
        expect(signal).toBeInstanceOf(AbortSignal);
        return [artwork];
      },
    });
    const client = await clientFor(runtime, (request) => {
      seenHeaders.push({
        version: request.headers.get("A2A-Version"),
        contentType: request.headers.get("Content-Type"),
      });
    });

    const result = await client.sendMessage(
      sendRequest(userMessage("Find 3 artist:david-hockney works sorted by title"), {
        acceptedOutputModes: ["text/plain", "application/json"],
        taskPushNotificationConfig: undefined,
        returnImmediately: false,
      }),
    );

    expect(seenHeaders).toEqual([{ version: "1.0", contentType: "application/json" }]);
    expect(calls).toEqual([
      {
        query: "Find 3 artist:david-hockney works sorted by title",
        limit: 3,
        sort: "title",
        artist: "david-hockney",
      },
    ]);
    expect(result.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(result.status.message.parts[0].content.value).toContain("Found 1 curated artwork");
    expect(result.artifacts).toHaveLength(1);
    const [text, data] = result.artifacts[0].parts;
    expect(text).toMatchObject({
      content: { $case: "text" },
      mediaType: "text/plain",
    });
    const textValue = text.content?.$case === "text" ? text.content.value : "";
    expect(textValue.includes("A Bigger Splash — David Hockney")).toBe(true);
    expect(textValue.includes("1967 · Tate")).toBe(true);
    expect(textValue.includes(artwork.url)).toBe(true);
    expect(data).toMatchObject({
      content: { $case: "data", value: { artworks: [artwork] } },
      filename: "catalog-results.json",
      mediaType: "application/json",
    });

    const fetched = await client.getTask({ tenant: "", id: result.id });
    expect(fetched.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(fetched.artifacts[0].artifactId).toBe("catalog-results");
  });

  test("supports an input-required task followed by a successful text turn", async () => {
    let callCount = 0;
    const runtime = createArtA2ARuntime({
      async browseArt() {
        callCount += 1;
        return [artwork];
      },
    });
    const client = await clientFor(runtime);
    const first = await client.sendMessage(sendRequest(userMessage("")));

    expect(first.status.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);
    expect(first.status.message.parts[0].content.value).toContain("describe the art");
    expect(callCount).toBe(0);

    const completed = await client.sendMessage(
      sendRequest(
        userMessage("Show me recent art", {
          taskId: first.id,
          contextId: first.contextId,
        }),
      ),
    );
    expect(completed.id).toBe(first.id);
    expect(completed.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(completed.artifacts).toHaveLength(1);
    expect(callCount).toBe(1);
  });

  test("rejects oversized text before calling the catalog", async () => {
    let called = false;
    const runtime = createArtA2ARuntime({
      async browseArt() {
        called = true;
        return [];
      },
    });
    const client = await clientFor(runtime);
    const result = await client.sendMessage(
      sendRequest(userMessage("x".repeat(ART_A2A_MAX_INPUT_CHARS + 1))),
    );

    expect(result.status.state).toBe(TaskState.TASK_STATE_REJECTED);
    expect(result.status.message.parts[0].content.value).toContain("1000 characters or fewer");
    expect(called).toBe(false);
  });

  test("cancels an in-flight task through the official SDK client", async () => {
    let signal;
    let aborted = false;
    const runtime = createArtA2ARuntime({
      browseArt(_input, requestSignal) {
        signal = requestSignal;
        return new Promise((resolve, reject) => {
          requestSignal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new DOMException("Canceled", "AbortError"));
            },
            { once: true },
          );
        });
      },
    });
    const client = await clientFor(runtime);
    const submitted = await client.sendMessage(
      sendRequest(userMessage("Show me art"), {
        acceptedOutputModes: ["text/plain"],
        taskPushNotificationConfig: undefined,
        returnImmediately: true,
      }),
    );

    expect(submitted.status.state).toBe(TaskState.TASK_STATE_SUBMITTED);
    const canceled = await client.cancelTask({ tenant: "", id: submitted.id, metadata: undefined });
    expect(signal.aborted).toBe(true);
    expect(aborted).toBe(true);
    expect(canceled.status.state).toBe(TaskState.TASK_STATE_CANCELED);
    expect(canceled.status.message.parts[0].content.value).toBe("Catalog browsing was canceled.");

    const fetched = await client.getTask({ tenant: "", id: submitted.id });
    expect(fetched.status.state).toBe(TaskState.TASK_STATE_CANCELED);
  });

  test("returns a failed task without exposing dependency errors", async () => {
    const errors = [];
    const runtime = createArtA2ARuntime({
      async browseArt() {
        throw new Error("private database detail");
      },
      onError(error) {
        errors.push(error);
      },
    });
    const client = await clientFor(runtime);
    const result = await client.sendMessage(sendRequest(userMessage("Show me art")));

    expect(result.status.state).toBe(TaskState.TASK_STATE_FAILED);
    expect(result.status.message.parts[0].content.value).toBe(
      "The public art catalog could not be queried. Please try again.",
    );
    expect(JSON.stringify(result)).not.toContain("private database detail");
    expect(errors).toHaveLength(1);
  });

  test("streams a standards-shaped task lifecycle over SSE", async () => {
    const runtime = createArtA2ARuntime({ browseArt: async () => [artwork] });
    const client = await clientFor(runtime);
    const events = [];
    for await (const event of client.sendMessageStream(
      sendRequest(userMessage("Show me one artwork")),
    )) {
      events.push(event);
    }

    expect(events.map((event) => event.payload.$case)).toEqual([
      "task",
      "statusUpdate",
      "artifactUpdate",
      "statusUpdate",
    ]);
    expect(events.at(-1).payload.value.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
  });

  test("returns only the output media types negotiated by the caller", async () => {
    const runtime = createArtA2ARuntime({ browseArt: async () => [artwork] });
    const client = await clientFor(runtime);
    const textOnly = await client.sendMessage(
      sendRequest(userMessage("Show me one artwork"), {
        acceptedOutputModes: ["text/plain"],
        taskPushNotificationConfig: undefined,
        returnImmediately: false,
      }),
    );
    expect(textOnly.artifacts[0].parts.map((part) => part.mediaType)).toEqual(["text/plain"]);

    const dataOnly = await client.sendMessage(
      sendRequest(userMessage("Show me one artwork"), {
        acceptedOutputModes: ["application/json"],
        taskPushNotificationConfig: undefined,
        returnImmediately: false,
      }),
    );
    expect(dataOnly.artifacts[0].parts.map((part) => part.mediaType)).toEqual(["application/json"]);
  });
});

describe("A2A parsing and HTTP transport", () => {
  test("bounds parsed limits, recognizes exact slug filters, and defaults to recent", () => {
    const parsed = parseArtA2AInput(
      userMessage("Show 999 category:painting style:pop-art gallery:tate artist:andy-warhol"),
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        query: "Show 999 category:painting style:pop-art gallery:tate artist:andy-warhol",
        limit: 12,
        sort: "recent",
        category: "painting",
        style: "pop-art",
        gallery: "tate",
        artist: "andy-warhol",
      },
    });
    expect(parseArtA2AInput(userMessage("Show me one artwork"))).toMatchObject({
      ok: true,
      value: { limit: 1 },
    });
    expect(
      parseArtA2AInput(
        userMessage("Show me art", {
          parts: [
            {
              content: { $case: "text", value: "Show me art" },
              filename: "",
              mediaType: "application/json",
              metadata: undefined,
            },
          ],
        }),
      ),
    ).toMatchObject({ ok: false, state: TaskState.TASK_STATE_REJECTED });
  });

  test("formats bounded human-readable results with canonical details", () => {
    const results = Array.from({ length: 12 }, (_, index) => ({
      ...artwork,
      title: `${artwork.title} ${"x".repeat(500)}`,
      url: `https://art.jpamorgan.com/art/work-${index}`,
    }));
    const formatted = formatArtA2AResults(results);
    expect(formatted.length).toBeLessThanOrEqual(6_000);
    expect(formatted).toContain("A Bigger Splash");
    expect(formatted).toContain("David Hockney");
    expect(formatted).toContain("1967 · Tate");
    expect(formatted).toContain("https://art.jpamorgan.com/art/work-0");
  });

  test("requires POST JSON, bounds request bodies, and exposes the protocol version", async () => {
    const runtime = createArtA2ARuntime({ browseArt: async () => [] });
    const get = await runtime.handleRequest(new Request(ART_A2A_ENDPOINT));
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST, OPTIONS");
    expect(get.headers.get("link")).toContain("/.well-known/agent-card.json");

    const options = await runtime.handleRequest(
      new Request(ART_A2A_ENDPOINT, { method: "OPTIONS" }),
    );
    expect(options.status).toBe(204);
    expect(options.headers.get("A2A-Version")).toBe("1.0");

    const wrongMedia = await runtime.handleRequest(
      new Request(ART_A2A_ENDPOINT, { method: "POST", body: "{}" }),
    );
    expect(wrongMedia.status).toBe(415);

    const oversized = await runtime.handleRequest(
      new Request(ART_A2A_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: "x".repeat(64 * 1_024) }),
      }),
    );
    expect(oversized.status).toBe(413);
  });

  test("returns the A2A content-type error for mixed or non-text message parts", async () => {
    const runtime = createArtA2ARuntime({ browseArt: async () => [] });
    for (const parts of [
      [{ data: { request: "art" }, mediaType: "application/json" }],
      [
        { text: "Show me art", mediaType: "text/plain" },
        { url: "https://example.com/image.jpg", mediaType: "image/jpeg" },
      ],
    ]) {
      const response = await runtime.handleRequest(
        new Request(ART_A2A_ENDPOINT, {
          method: "POST",
          headers: {
            "A2A-Version": ART_A2A_PROTOCOL_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "SendMessage",
            params: {
              message: {
                messageId: crypto.randomUUID(),
                role: "ROLE_USER",
                parts,
              },
              configuration: {},
            },
            id: 1,
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        error: { code: -32_005 },
        id: 1,
      });
    }
  });

  test("rejects a request that does not negotiate the advertised v1.0 protocol", async () => {
    const runtime = createArtA2ARuntime({ browseArt: async () => [] });
    const response = await runtime.handleRequest(
      new Request(ART_A2A_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "missing-version",
          method: "SendMessage",
          params: sendRequest(userMessage("Show me art")),
        }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.id).toBe("missing-version");
    expect(body.error.message).toContain("version");
  });

  test("production mode rejects background execution and distributed cancellation", async () => {
    const runtime = createArtA2ARuntime(
      { browseArt: async () => [] },
      { allowReturnImmediately: false, allowCancellation: false },
    );
    const call = (method, params, id) =>
      runtime.handleRequest(
        new Request(ART_A2A_ENDPOINT, {
          method: "POST",
          headers: { "A2A-Version": "1.0", "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        }),
      );
    const background = await call(
      "SendMessage",
      sendRequest(userMessage("Show me art"), {
        acceptedOutputModes: ["text/plain"],
        taskPushNotificationConfig: undefined,
        returnImmediately: true,
      }),
      "background",
    );
    const backgroundBody = await background.json();
    expect(backgroundBody.error.message).toContain("returnImmediately");
    expect(backgroundBody.error.code).toBe(-32_004);

    const cancellation = await call(
      "CancelTask",
      { tenant: "", id: crypto.randomUUID(), metadata: undefined },
      "cancel",
    );
    const cancellationBody = await cancellation.json();
    expect(cancellationBody.error.message).toContain("not supported");
    expect(cancellationBody.error.code).toBe(-32_002);
  });

  test("omits artifacts from ListTasks wire responses unless requested", async () => {
    const runtime = createArtA2ARuntime({ browseArt: async () => [artwork] });
    const client = await clientFor(runtime);
    await client.sendMessage(sendRequest(userMessage("Show me one artwork")));
    const response = await runtime.handleRequest(
      new Request(ART_A2A_ENDPOINT, {
        method: "POST",
        headers: { "A2A-Version": "1.0", "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "list",
          method: "ListTasks",
          params: {
            tenant: "",
            contextId: "",
            status: "TASK_STATE_COMPLETED",
            pageToken: "",
            includeArtifacts: false,
          },
        }),
      }),
    );
    const body = await response.json();
    expect(body.error).toBeUndefined();
    expect(body.result.tasks).toHaveLength(1);
    expect(body.result.tasks[0]).not.toHaveProperty("artifacts");
  });
});
