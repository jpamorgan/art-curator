import { describe, expect, test } from "bun:test";
import { ENRICHMENT_EMBEDDING_DIMENSIONS, resolveEnrichmentModelConfig } from "@art/env/enrichment";

import {
  canonicalArtworkText,
  enqueueArtworkEnrichment,
  enrichArtwork,
  handleEnrichmentBackfillRequest,
  handleEnrichmentIndexReadinessRequest,
  handleEnrichmentQueue,
  handleEnrichmentStatusRequest,
} from "./enrichment";
import { createEnrichmentProvider } from "./enrichment-provider";

const SECRET = "enrichment_test_secret_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const config = resolveEnrichmentModelConfig({});

const embedding = Array.from({ length: ENRICHMENT_EMBEDDING_DIMENSIONS }, (_, index) =>
  index === 0 ? 1 : 0,
);

const facets = {
  palette: ["ultramarine", "ochre"],
  temperature: "mixed",
  brightness: "mid-tone",
  subjects: ["figure"],
  setting: ["interior"],
  mood: ["contemplative"],
  composition: ["central subject"],
  textureAndMarkMaking: ["visible brushwork"],
  abstraction: "representational",
  visualDensity: "moderate",
  motifs: ["chair"],
  visualDescription: "A seated figure is framed by broad blue and ochre marks.",
};

function provider(overrides = {}) {
  return {
    config,
    analyzeArtwork: async () => facets,
    embedText: async () => embedding,
    ...overrides,
  };
}

function artwork(overrides = {}) {
  return {
    id: "work-1",
    title: "Blue Room",
    artist: "Avery Hart",
    artistId: "avery-hart",
    dateDisplay: "2024",
    description: "A quiet study of a room.",
    medium: "Oil on canvas",
    alt: "A seated figure in a blue room.",
    galleryId: "gallery-1",
    galleryName: "Example Gallery",
    isPublicDomain: 0,
    thumbnailFingerprint: "thumb-fingerprint",
    thumbnailR2Key: "artworks/work-1/thumbnail.jpg",
    categorySlugs: '["painting"]',
    styleSlugs: '["modern","figurative"]',
    ...overrides,
  };
}

function database(row, initialState = null) {
  const state = { value: initialState, writes: [] };
  return {
    state,
    value: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async first() {
                if (sql.includes("FROM artwork a JOIN gallery")) return row;
                if (sql.includes("SELECT status, content_fingerprint")) return state.value;
                throw new Error(`Unexpected first SQL: ${sql}`);
              },
              async run() {
                state.writes.push({ sql, values });
                if (sql.includes("INSERT INTO artwork_enrichment"))
                  state.value = { status: "processing", fingerprint: "" };
                if (sql.includes("status='ready'"))
                  state.value = { status: "ready", fingerprint: values[6] };
                if (sql.includes("status='failed'")) state.value.status = "failed";
                return { success: true };
              },
            };
          },
        };
      },
    },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("artwork enrichment", () => {
  test("builds stable canonical text and sorts taxonomy", () => {
    const text = canonicalArtworkText(artwork({ styleSlugs: '["modern","figurative"]' }), facets);
    expect(text).toContain("Styles: figurative, modern");
    expect(text).toContain("Visual description: A seated figure");
    expect(text).toContain("Texture and mark-making: visible brushwork");
    expect(text.indexOf("Visual description:")).toBeLessThan(text.indexOf("\nDescription:"));
  });

  test("uses metadata only when image-analysis permission is absent", async () => {
    const db = database(artwork({ isPublicDomain: 0 }));
    const embedded = [];
    const vectors = [];
    const result = await enrichArtwork("work-1", {
      database: db.value,
      bucket: {
        get: async () => {
          throw new Error("must not read image");
        },
      },
      provider: provider({
        analyzeArtwork: async () => {
          throw new Error("must not analyze image");
        },
        embedText: async (text) => {
          embedded.push(text);
          return embedding;
        },
      }),
      vectorIndex: {
        async upsert(value) {
          vectors.push(...value);
          return { ids: ["work-1"], count: 1 };
        },
      },
      now: () => 100,
    });
    expect(result).toMatchObject({ outcome: "ready", sourceMode: "metadata" });
    expect(embedded).toHaveLength(1);
    expect(embedded[0]).toContain("Title: Blue Room");
    expect(vectors[0].metadata).toEqual({
      artistId: "avery-hart",
      galleryId: "gallery-1",
      isPublicDomain: false,
      categorySlugs: ["painting"],
      styleSlugs: ["figurative", "modern"],
      embeddingGeneration: config.vectorGeneration,
    });
    expect(db.state.value.status).toBe("ready");
    const ready = db.state.writes.find(({ sql }) => sql.includes("status='ready'"));
    expect(ready.values[8]).toBe("{}");
  });

  test("analyzes a permitted thumbnail once, then embeds structured canonical text", async () => {
    const db = database(artwork({ isPublicDomain: 1 }));
    const analyzed = [];
    const embedded = [];
    const result = await enrichArtwork("work-1", {
      database: db.value,
      bucket: {
        async get() {
          return { arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer };
        },
      },
      provider: provider({
        analyzeArtwork: async (input) => {
          analyzed.push(input);
          return facets;
        },
        embedText: async (text) => {
          embedded.push(text);
          return embedding;
        },
      }),
      vectorIndex: { upsert: async () => ({ mutationId: "mutation-1" }) },
      now: () => 200,
    });
    expect(result.sourceMode).toBe("image");
    expect(analyzed).toHaveLength(1);
    expect([...analyzed[0].imageBytes]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    expect(analyzed[0].metadata).toEqual({
      title: "Blue Room",
      artist: "Avery Hart",
      medium: "Oil on canvas",
      date: "2024",
    });
    expect(embedded[0]).toContain(facets.visualDescription);
    const ready = db.state.writes.find(({ sql }) => sql.includes("status='ready'"));
    expect(JSON.parse(ready.values[8])).toEqual(facets);
    expect(ready.values[9]).toBe("mutation-1");
  });

  test("skips the model provider and Vectorize when the completed generation is unchanged", async () => {
    const row = artwork({ isPublicDomain: 0 });
    const firstDb = database(row);
    let calls = 0;
    const dependencies = {
      database: firstDb.value,
      bucket: { get: async () => null },
      provider: provider({
        embedText: async () => {
          calls += 1;
          return embedding;
        },
      }),
      vectorIndex: { upsert: async () => ({ ids: ["work-1"], count: 1 }) },
      now: () => 300,
    };
    const first = await enrichArtwork("work-1", dependencies);
    expect(first.outcome).toBe("ready");
    const secondDb = database(row, {
      status: "ready",
      fingerprint: first.fingerprint,
      canonicalText: "already embedded",
      visualFacets: "{}",
      processedAt: 300,
    });
    const second = await enrichArtwork("work-1", {
      ...dependencies,
      database: secondDb.value,
      vectorIndex: {
        ...dependencies.vectorIndex,
        getByIds: async () => [
          {
            id: "work-1",
            values: embedding,
            metadata: { embeddingGeneration: config.vectorGeneration },
          },
        ],
      },
    });
    expect(second.outcome).toBe("unchanged");
    expect(calls).toBe(1);
    expect(secondDb.state.writes).toHaveLength(1);
    expect(secondDb.state.writes[0].sql).toContain("SET status='ready'");
  });

  test("re-embeds an unchanged catalog row when its stored vector is from another generation", async () => {
    const row = artwork({ isPublicDomain: 0 });
    const firstDb = database(row);
    const first = await enrichArtwork("work-1", {
      database: firstDb.value,
      bucket: { get: async () => null },
      provider: provider(),
      vectorIndex: { upsert: async () => ({ ids: ["work-1"], count: 1 }) },
      now: () => 325,
    });
    let embedded = 0;
    let upserted = 0;
    const secondDb = database(row, {
      status: "ready",
      fingerprint: first.fingerprint,
      canonicalText: "checkpointed canonical text",
      visualFacets: "{}",
      processedAt: 325,
    });
    const result = await enrichArtwork("work-1", {
      database: secondDb.value,
      bucket: { get: async () => null },
      provider: provider({
        embedText: async () => {
          embedded += 1;
          return embedding;
        },
      }),
      vectorIndex: {
        getByIds: async () => [
          {
            id: "work-1",
            values: embedding,
            metadata: { embeddingGeneration: "eg-stale" },
          },
        ],
        upsert: async () => {
          upserted += 1;
          return { ids: ["work-1"], count: 1 };
        },
      },
      now: () => 326,
    });
    expect(result.outcome).toBe("ready");
    expect(embedded).toBe(1);
    expect(upserted).toBe(1);
  });

  test("records failures for observability and asks the queue to retry only that message", async () => {
    const db = database(artwork({ isPublicDomain: 0 }));
    let acknowledged = false;
    let retryOptions;
    await handleEnrichmentQueue(
      {
        messages: [
          {
            body: { artworkId: "work-1", reason: "backfill", requestedAt: 10 },
            ack: () => (acknowledged = true),
            retry: (options) => (retryOptions = options),
          },
        ],
      },
      {
        database: db.value,
        bucket: { get: async () => null },
        provider: provider({
          embedText: async () => {
            throw new Error("Cloudflare embeddings failed with HTTP 429.");
          },
        }),
        vectorIndex: { upsert: async () => ({ ids: [], count: 0 }) },
        now: () => 400,
      },
    );
    expect(acknowledged).toBe(false);
    expect(retryOptions).toEqual({ delaySeconds: 30 });
    expect(db.state.value.status).toBe("failed");
    const failed = db.state.writes.find(({ sql }) => sql.includes("status='failed'"));
    expect(failed.values[0]).toBe("Cloudflare embeddings failed with HTTP 429.");
  });

  test("processes a queue batch sequentially to respect Vectorize write pressure", async () => {
    const db = database(artwork({ isPublicDomain: 0 }));
    let active = 0;
    let maximumActive = 0;
    let acknowledged = 0;
    await handleEnrichmentQueue(
      {
        messages: ["work-1", "work-2"].map((artworkId) => ({
          attempts: 1,
          body: { artworkId, reason: "backfill", requestedAt: 10 },
          ack: () => (acknowledged += 1),
          retry: () => {
            throw new Error("must not retry");
          },
        })),
      },
      {
        database: db.value,
        bucket: { get: async () => null },
        provider: provider({
          embedText: async () => {
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            return embedding;
          },
        }),
        vectorIndex: { upsert: async () => ({ ids: ["work-1"], count: 1 }) },
        now: () => 450,
      },
    );
    expect(acknowledged).toBe(2);
    expect(maximumActive).toBe(1);
  });

  test("rejects oversized OpenAI responses before buffering their body", async () => {
    const openAiConfig = resolveEnrichmentModelConfig({ ENRICHMENT_PROVIDER: "openai" });
    const openAiProvider = createEnrichmentProvider({
      config: openAiConfig,
      openAiApiKey: "test-key",
      fetcher: async () =>
        new Response("{}", { headers: { "Content-Length": String(2 * 1_024 * 1_024 + 1) } }),
    });
    expect(openAiProvider.embedText("bounded response")).rejects.toThrow(
      "response exceeded the size limit",
    );
  });

  test("adapts Cloudflare Workers AI vision and embeddings to the shared contract", async () => {
    const calls = [];
    const cloudflareProvider = createEnrichmentProvider({
      config,
      workersAi: {
        async run(model, input) {
          calls.push({ model, input });
          return model === config.visionModel
            ? { response: `Here is the result:\n\`\`\`json\n${JSON.stringify(facets)}\n\`\`\`` }
            : { data: [embedding] };
        },
      },
    });
    const resultFacets = await cloudflareProvider.analyzeArtwork({
      imageBytes: new Uint8Array([1, 2, 3]),
      metadata: { title: "Blue Room", artist: "Avery Hart", medium: "Oil", date: "2024" },
    });
    const resultEmbedding = await cloudflareProvider.embedText("canonical artwork text");
    expect(resultFacets).toEqual(facets);
    expect(resultEmbedding).toHaveLength(ENRICHMENT_EMBEDDING_DIMENSIONS);
    expect(calls.map(({ model }) => model)).toEqual([config.visionModel, config.embeddingModel]);
    expect(calls[0].input.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "artwork_visual_facets", strict: true },
    });
    expect(calls[0].input.store).toBe(false);
    expect(calls[0].input.messages[1].content[1]).toMatchObject({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AQID", detail: "low" },
    });
    expect(calls[1].input).toEqual({ text: ["canonical artwork text"], pooling: "cls" });
  });

  test("adapts OpenAI vision and embeddings to the same shared contract", async () => {
    const openAiConfig = resolveEnrichmentModelConfig({ ENRICHMENT_PROVIDER: "openai" });
    const requests = [];
    const openAiProvider = createEnrichmentProvider({
      config: openAiConfig,
      openAiApiKey: "test-key",
      fetcher: async (url, init) => {
        const body = JSON.parse(init.body);
        requests.push({ url, body, signal: init.signal });
        return url.endsWith("/responses")
          ? jsonResponse({ output_text: JSON.stringify(facets) })
          : jsonResponse({ data: [{ embedding }] });
      },
    });
    expect(
      await openAiProvider.analyzeArtwork({
        imageBytes: new Uint8Array([1, 2, 3]),
        metadata: { title: "Blue Room", artist: "Avery Hart", medium: "Oil", date: "2024" },
      }),
    ).toEqual(facets);
    expect(await openAiProvider.embedText("canonical artwork text")).toEqual(embedding);
    expect(requests.map(({ url }) => url.split("/").at(-1))).toEqual(["responses", "embeddings"]);
    expect(requests[0].body).toMatchObject({
      model: openAiConfig.visionModel,
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(requests[1].body).toMatchObject({
      model: openAiConfig.embeddingModel,
      dimensions: ENRICHMENT_EMBEDDING_DIMENSIONS,
    });
    expect(requests.every(({ signal }) => signal instanceof AbortSignal)).toBe(true);
  });

  test("does not turn a persisted catalog write into a failure when enqueueing fails", async () => {
    const queued = await enqueueArtworkEnrichment(
      {
        send: async () => {
          throw new Error("queue unavailable");
        },
      },
      "work-1",
      "import",
      500,
    );
    expect(queued).toBe(false);
  });

  test("backfills every catalog row so changed models and prompts can re-fingerprint ready work", async () => {
    let query = "";
    let sent = [];
    const response = await handleEnrichmentBackfillRequest(
      new Request("https://api.example.com/internal/enrichment/backfill?limit=2&cursor=work-0", {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      {
        config,
        secret: SECRET,
        now: () => 600,
        database: {
          prepare(sql) {
            query = sql;
            return {
              bind() {
                return {
                  async run() {
                    return { success: true };
                  },
                  async all() {
                    return { results: [{ id: "work-1" }, { id: "work-2" }] };
                  },
                };
              },
            };
          },
        },
        queue: {
          async sendBatch(messages) {
            sent = messages;
          },
        },
      },
    );
    expect(response.status).toBe(200);
    expect(query).not.toContain("status != 'ready'");
    expect(sent.map(({ body }) => body)).toEqual([
      { artworkId: "work-1", reason: "backfill", requestedAt: 600 },
      { artworkId: "work-2", reason: "backfill", requestedAt: 600 },
    ]);
    expect(await response.json()).toEqual({ queued: 2, nextCursor: "work-2" });
  });

  test("reports readiness only for vectors in the active provider generation", async () => {
    const ids = Array.from({ length: 21 }, (_, index) => `work-${index + 1}`);
    const lookupSizes = [];
    const response = await handleEnrichmentStatusRequest(
      new Request("https://api.example.com/internal/enrichment/status", {
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      {
        config,
        secret: SECRET,
        database: {
          prepare(sql) {
            return {
              bind() {
                return {
                  async first() {
                    expect(sql).toContain("provider=?");
                    return { total: 21, ready: 21, failed: 0, pending: 0, missing: 0 };
                  },
                  async all() {
                    return { results: ids.map((id) => ({ id })) };
                  },
                };
              },
            };
          },
        },
        vectorIndex: {
          getByIds: async (requestedIds) => {
            lookupSizes.push(requestedIds.length);
            if (requestedIds.length > 20) throw new Error("Vectorize accepts at most 20 IDs");
            return requestedIds.map((id) => ({
              id,
              values: embedding,
              metadata: {
                embeddingGeneration: id === "work-21" ? "eg-stale" : config.vectorGeneration,
              },
            }));
          },
        },
      },
    );
    expect(response.status).toBe(200);
    expect(lookupSizes).toEqual([20, 1]);
    expect(await response.json()).toEqual({
      total: 21,
      ready: 21,
      failed: 0,
      pending: 0,
      missing: 0,
      verified: 20,
      provider: "cloudflare",
      vectorGeneration: config.vectorGeneration,
    });
  });

  test("probes the active generation filter before deployment queues any vectors", async () => {
    let query;
    const response = await handleEnrichmentIndexReadinessRequest(
      new Request("https://api.example.com/internal/enrichment/index-ready", {
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      {
        config,
        secret: SECRET,
        vectorIndex: {
          async query(vector, options) {
            query = { vector, options };
            return { matches: [] };
          },
        },
      },
    );
    expect(response.status).toBe(200);
    expect(query.vector).toHaveLength(ENRICHMENT_EMBEDDING_DIMENSIONS);
    expect(query.vector.slice(0, 2)).toEqual([1, 0]);
    expect(query.options).toEqual({
      topK: 1,
      filter: {
        artistId: "__readiness_probe__",
        embeddingGeneration: config.vectorGeneration,
        galleryId: "__readiness_probe__",
        isPublicDomain: false,
      },
      returnMetadata: "none",
    });
    expect(await response.json()).toEqual({
      ready: true,
      provider: "cloudflare",
      vectorGeneration: config.vectorGeneration,
    });
  });

  test("keeps deployment blocked while the generation metadata index is unavailable", async () => {
    const response = await handleEnrichmentIndexReadinessRequest(
      new Request("https://api.example.com/internal/enrichment/index-ready", {
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      {
        config,
        secret: SECRET,
        vectorIndex: {
          async query() {
            throw new Error("metadata index is still processing");
          },
        },
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ready: false });
  });
});
