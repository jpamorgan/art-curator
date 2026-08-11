import { describe, expect, test } from "bun:test";

import {
  ARTIFACT_CACHE_CONTROL,
  artworkArtifactCustomMetadata,
  artworkArtifactExpectation,
} from "@art/db/artifacts";

import { serveArtworkArtifact } from "./artifacts";

const artworkId = "moma-starry-night";
const expectation = await artworkArtifactExpectation({
  artworkId,
  variant: "full",
  upstreamUrl: "https://images.example.com/starry-night.jpg",
  sourceVersion: "museum-record-v1",
});
const bytes = new Uint8Array(1_024);
bytes.set([0xff, 0xd8, 0xff]);
const uploaded = new Date("2026-08-10T20:00:00.000Z");

function artifactUrl(version = expectation.fingerprint) {
  return `https://api.art.jpamorgan.com/artifacts/${artworkId}/full.jpg?v=${version}`;
}

function storedObject({ body = false, customMetadata, key = expectation.key } = {}) {
  return {
    key,
    version: "version-1",
    size: bytes.byteLength,
    etag: "artifact-etag",
    httpEtag: '"artifact-etag"',
    uploaded,
    checksums: {},
    customMetadata: customMetadata ?? artworkArtifactCustomMetadata(expectation),
    httpMetadata: {
      contentType: "image/jpeg",
      cacheControl: ARTIFACT_CACHE_CONTROL,
      contentDisposition: 'inline; filename="moma-starry-night-full.jpg"',
    },
    writeHttpMetadata(headers) {
      headers.set("Content-Type", "image/jpeg");
      headers.set("Cache-Control", ARTIFACT_CACHE_CONTROL);
      headers.set("Content-Disposition", this.httpMetadata.contentDisposition);
    },
    ...(body ? { body: bytes, bodyUsed: false, arrayBuffer: async () => bytes.buffer } : {}),
  };
}

function dependencies(overrides = {}) {
  const calls = { get: 0, head: 0, resolve: 0 };
  const bucket = {
    async head(requestedKey) {
      calls.head += 1;
      expect(requestedKey).toBe(expectation.key);
      return storedObject();
    },
    async get(requestedKey) {
      calls.get += 1;
      expect(requestedKey).toBe(expectation.key);
      return storedObject({ body: true });
    },
  };

  return {
    calls,
    value: {
      bucket,
      async resolveExpectation(id, variant) {
        calls.resolve += 1;
        expect(id).toBe(artworkId);
        expect(variant).toBe("full");
        return expectation;
      },
      ...overrides,
    },
  };
}

describe("artwork artifact delivery", () => {
  test("streams the exact fingerprinted object with immutable browser and CDN metadata", async () => {
    const { calls, value } = dependencies();
    const response = await serveArtworkArtifact(
      new Request(artifactUrl()),
      { artworkId, filename: "full.jpg" },
      value,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe(ARTIFACT_CACHE_CONTROL);
    expect(response.headers.get("cdn-cache-control")).toBe(ARTIFACT_CACHE_CONTROL);
    expect(response.headers.get("etag")).toBe('"artifact-etag"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(calls).toEqual({ get: 1, head: 1, resolve: 1 });
  });

  test("answers matching conditional requests without reading the object body", async () => {
    const { calls, value } = dependencies();
    const response = await serveArtworkArtifact(
      new Request(artifactUrl(), { headers: { "If-None-Match": 'W/"artifact-etag"' } }),
      { artworkId, filename: "full.jpg" },
      value,
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"artifact-etag"');
    expect(calls).toEqual({ get: 0, head: 1, resolve: 1 });
  });

  test("supports HEAD without reading the object body", async () => {
    const { calls, value } = dependencies();
    const response = await serveArtworkArtifact(
      new Request(artifactUrl(), { method: "HEAD" }),
      { artworkId, filename: "full.jpg" },
      value,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(bytes.byteLength.toString());
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(calls).toEqual({ get: 0, head: 1, resolve: 1 });
  });

  test("rejects missing, duplicate, or stale public URL fingerprints before R2 access", async () => {
    for (const url of [
      `https://api.art.jpamorgan.com/artifacts/${artworkId}/full.jpg`,
      `${artifactUrl()}&v=${expectation.fingerprint}`,
      artifactUrl("a".repeat(64)),
    ]) {
      const { calls, value } = dependencies();
      const response = await serveArtworkArtifact(
        new Request(url),
        { artworkId, filename: "full.jpg" },
        value,
      );
      expect(response.status).toBe(404);
      expect(calls).toEqual({ get: 0, head: 0, resolve: 1 });
    }
  });

  test("rejects stale or generic R2 objects even when their key and size look plausible", async () => {
    for (const customMetadata of [
      {},
      { ...artworkArtifactCustomMetadata(expectation), sourceFingerprint: "a".repeat(64) },
    ]) {
      const { calls, value } = dependencies({
        bucket: {
          async head() {
            calls.head += 1;
            return storedObject({ customMetadata });
          },
          async get() {
            calls.get += 1;
            return storedObject({ body: true, customMetadata });
          },
        },
      });
      const response = await serveArtworkArtifact(
        new Request(artifactUrl()),
        { artworkId, filename: "full.jpg" },
        value,
      );
      expect(response.status).toBe(404);
      expect(calls).toEqual({ get: 0, head: 1, resolve: 1 });
    }
  });

  test("returns a calm cached 404 when the database has no current expectation", async () => {
    const { calls, value } = dependencies({
      async resolveExpectation() {
        calls.resolve += 1;
        return null;
      },
    });
    const response = await serveArtworkArtifact(
      new Request(artifactUrl()),
      { artworkId, filename: "full.jpg" },
      value,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await response.text()).toBe("");
    expect(calls).toEqual({ get: 0, head: 0, resolve: 1 });
  });

  test("rejects unsafe IDs and unknown filenames before key resolution", async () => {
    const { calls, value } = dependencies();
    const unsafe = await serveArtworkArtifact(
      new Request("https://api.art.jpamorgan.com/artifacts/../private/full.jpg"),
      { artworkId: "../private", filename: "full.jpg" },
      value,
    );
    const unknown = await serveArtworkArtifact(
      new Request(artifactUrl()),
      { artworkId, filename: "raw.jpg" },
      value,
    );

    expect(unsafe.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(calls).toEqual({ get: 0, head: 0, resolve: 0 });
  });
});
