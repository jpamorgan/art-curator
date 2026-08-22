import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { Role, TaskState } from "@a2a-js/sdk";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import { ServerCallContext } from "@a2a-js/sdk/server";

import { createArtA2ARuntime } from "./a2a";
import { A2A_TASK_TTL_MS, D1A2ATaskStore } from "./a2a-task-store";

const migration = await Bun.file(
  new URL("../../../packages/db/src/migrations/0013_whole_wild_child.sql", import.meta.url),
).text();
const databases = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function d1Fixture() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(migration.replaceAll("--> statement-breakpoint", ""));
  return {
    prepare(sql) {
      return statement(sqlite, sql, []);
    },
  };
}

function statement(sqlite, sql, bindings) {
  return {
    bind(...values) {
      return statement(sqlite, sql, values);
    },
    async run() {
      sqlite.query(sql).run(...bindings);
      return { success: true };
    },
    async first() {
      return sqlite.query(sql).get(...bindings) ?? null;
    },
    async all() {
      return { results: sqlite.query(sql).all(...bindings), success: true };
    },
  };
}

function userMessage(text) {
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
  };
}

async function clientFor(runtime) {
  const transport = new JsonRpcTransportFactory({
    fetchImpl: (input, init) => runtime.handleRequest(new Request(input, init)),
  });
  return new ClientFactory({ transports: [transport] }).createFromAgentCard(runtime.agentCard);
}

function authenticatedContext(name) {
  return new ServerCallContext({
    user: {
      isAuthenticated: true,
      userName: name,
    },
  });
}

function storedTask(id, timestamp, metadata = undefined) {
  return {
    id,
    contextId: "catalog-context",
    status: { state: TaskState.TASK_STATE_COMPLETED, message: undefined, timestamp },
    artifacts: [],
    history: [],
    metadata,
  };
}

describe("D1-backed A2A task storage", () => {
  test("persists completed tasks across Worker runtime instances", async () => {
    const database = d1Fixture();
    const first = createArtA2ARuntime(
      {
        browseArt: async () => [
          {
            title: "A Bigger Splash",
            artist: "David Hockney",
            date: "1967",
            gallery: "Tate",
            url: "https://art.jpamorgan.com/art/a-bigger-splash",
          },
        ],
      },
      { taskStore: new D1A2ATaskStore(database) },
    );
    const created = await (
      await clientFor(first)
    ).sendMessage({
      tenant: "",
      message: userMessage("Show me one artwork"),
      configuration: undefined,
      metadata: undefined,
    });
    expect(created.status.state).toBe(TaskState.TASK_STATE_COMPLETED);

    const second = createArtA2ARuntime(
      { browseArt: async () => [] },
      { taskStore: new D1A2ATaskStore(database) },
    );
    const loaded = await (await clientFor(second)).getTask({ tenant: "", id: created.id });
    expect(loaded).toEqual(created);
  });

  test("expires anonymous capability-addressed tasks and never enumerates them", async () => {
    const database = d1Fixture();
    let now = Date.now();
    const store = new D1A2ATaskStore(database, () => now);
    const runtime = createArtA2ARuntime({ browseArt: async () => [] }, { taskStore: store });
    const client = await clientFor(runtime);
    const created = await client.sendMessage({
      tenant: "",
      message: userMessage("Show me one artwork"),
      configuration: undefined,
      metadata: undefined,
    });
    expect(
      await client.listTasks({
        tenant: "",
        contextId: "",
        status: TaskState.TASK_STATE_UNSPECIFIED,
        pageToken: "",
        statusTimestampAfter: undefined,
      }),
    ).toMatchObject({ tasks: [], totalSize: 0 });

    now += A2A_TASK_TTL_MS + 1;
    await expect(client.getTask({ tenant: "", id: created.id })).rejects.toThrow("not found");
  });

  test("scopes authenticated tasks and paginates them with opaque cursors", async () => {
    const store = new D1A2ATaskStore(d1Fixture());
    const alice = authenticatedContext("alice");
    const bob = authenticatedContext("bob");
    await store.save(storedTask("task-old", "2026-08-22T10:00:00.000Z"), alice);
    await store.save(storedTask("task-new", "2026-08-22T11:00:00.000Z"), alice);
    expect(await store.load("task-new", bob)).toBeUndefined();

    const request = {
      tenant: "",
      contextId: "",
      status: TaskState.TASK_STATE_UNSPECIFIED,
      pageSize: 1,
      pageToken: "",
      historyLength: undefined,
      statusTimestampAfter: undefined,
      includeArtifacts: false,
    };
    const first = await store.list(request, alice);
    expect(first).toMatchObject({
      tasks: [{ id: "task-new", artifacts: [] }],
      pageSize: 1,
      totalSize: 2,
    });
    expect(first.nextPageToken).not.toBe("");
    const second = await store.list({ ...request, pageToken: first.nextPageToken }, alice);
    expect(second).toMatchObject({
      tasks: [{ id: "task-old", artifacts: [] }],
      nextPageToken: "",
      totalSize: 2,
    });
  });

  test("rejects oversized tasks and malformed page tokens", async () => {
    const store = new D1A2ATaskStore(d1Fixture());
    const context = authenticatedContext("alice");
    await expect(
      store.save(
        storedTask("too-large", new Date().toISOString(), { value: "x".repeat(300_000) }),
        context,
      ),
    ).rejects.toThrow("storage limit");
    await expect(
      store.list(
        {
          tenant: "",
          contextId: "",
          status: TaskState.TASK_STATE_UNSPECIFIED,
          pageToken: "not-a-cursor",
          statusTimestampAfter: undefined,
        },
        context,
      ),
    ).rejects.toThrow("pageToken");
  });
});
