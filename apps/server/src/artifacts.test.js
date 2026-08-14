import { describe, expect, test } from "bun:test";

import {
  ARTIFACT_CACHE_CONTROL,
  ARTIFACT_MAX_THUMBNAIL_BYTES,
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
const thumbnailExpectation = await artworkArtifactExpectation({
  artworkId,
  variant: "thumbnail",
  upstreamUrl: "https://images.example.com/starry-night-thumbnail.jpg",
  sourceVersion: "museum-record-thumbnail-v1",
});
const expectations = { full: expectation, thumbnail: thumbnailExpectation };
const storedExpectations = Object.fromEntries(
  Object.entries(expectations).map(([variant, value]) => [
    variant,
    {
      artworkId,
      variant,
      key: value.key,
      fingerprint: value.fingerprint,
      sourceFingerprint: value.sourceVersion,
    },
  ]),
);
const storedExpectation = storedExpectations.full;
const bytes = new Uint8Array(1_024);
bytes.set([0xff, 0xd8, 0xff]);
const uploaded = new Date("2026-08-10T20:00:00.000Z");

function artifactUrl(version = expectation.fingerprint, variant = "full") {
  return `https://api.art.jpamorgan.com/artifacts/${artworkId}/${variant}.jpg?v=${version}`;
}

function storedObject({
  body = false,
  customMetadata,
  key,
  size = bytes.byteLength,
  variant = "full",
} = {}) {
  const current = storedExpectations[variant];
  return {
    key: key ?? current.key,
    version: "version-1",
    size,
    etag: "artifact-etag",
    httpEtag: '"artifact-etag"',
    uploaded,
    checksums: {},
    customMetadata: customMetadata ?? {
      contentFingerprint: current.fingerprint,
      sourceFingerprint: current.sourceFingerprint,
      variant,
    },
    httpMetadata: {
      contentType: "image/jpeg",
      cacheControl: ARTIFACT_CACHE_CONTROL,
      contentDisposition: `inline; filename="moma-starry-night-${variant}.jpg"`,
    },
    writeHttpMetadata(headers) {
      headers.set("Content-Type", "image/jpeg");
      headers.set("Cache-Control", ARTIFACT_CACHE_CONTROL);
      headers.set("Content-Disposition", this.httpMetadata.contentDisposition);
    },
    ...(body ? { body: bytes, bodyUsed: false, arrayBuffer: async () => bytes.buffer } : {}),
  };
}

function dependencies(overrides = {}, variant = "full", object = {}) {
  const current = storedExpectations[variant];
  const calls = { get: 0, head: 0, resolve: 0 };
  const bucket = {
    async head(requestedKey) {
      calls.head += 1;
      expect(requestedKey).toBe(current.key);
      return storedObject({ ...object, variant });
    },
    async get(requestedKey) {
      calls.get += 1;
      expect(requestedKey).toBe(current.key);
      return storedObject({ ...object, body: true, variant });
    },
  };

  return {
    calls,
    value: {
      bucket,
      async resolveExpectation(id, variant) {
        calls.resolve += 1;
        expect(id).toBe(artworkId);
        expect(variant).toBe(current.variant);
        return current;
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

  test("serves the independently fingerprinted thumbnail for GET and HEAD", async () => {
    const getDependencies = dependencies({}, "thumbnail");
    const getResponse = await serveArtworkArtifact(
      new Request(artifactUrl(thumbnailExpectation.fingerprint, "thumbnail")),
      { artworkId, filename: "thumbnail.jpg" },
      getDependencies.value,
    );
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("content-disposition")).toBe(
      'inline; filename="moma-starry-night-thumbnail.jpg"',
    );
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(bytes);
    expect(getDependencies.calls).toEqual({ get: 1, head: 1, resolve: 1 });

    const headDependencies = dependencies({}, "thumbnail");
    const headResponse = await serveArtworkArtifact(
      new Request(artifactUrl(thumbnailExpectation.fingerprint, "thumbnail"), { method: "HEAD" }),
      { artworkId, filename: "thumbnail.jpg" },
      headDependencies.value,
    );
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("content-length")).toBe(bytes.byteLength.toString());
    expect((await headResponse.arrayBuffer()).byteLength).toBe(0);
    expect(headDependencies.calls).toEqual({ get: 0, head: 1, resolve: 1 });
  });

  test("caps v3 thumbnails without narrowing legacy thumbnails or full images", async () => {
    for (const [variant, size, customMetadata] of [
      ["thumbnail", 1_500 * 1_024],
      [
        "thumbnail",
        ARTIFACT_MAX_THUMBNAIL_BYTES,
        artworkArtifactCustomMetadata(thumbnailExpectation),
      ],
      ["full", 1_500 * 1_024 + 1],
    ]) {
      const current = expectations[variant];
      const accepted = dependencies({}, variant, { customMetadata, size });
      const response = await serveArtworkArtifact(
        new Request(artifactUrl(current.fingerprint, variant), { method: "HEAD" }),
        { artworkId, filename: `${variant}.jpg` },
        accepted.value,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-length")).toBe(size.toString());
      expect(accepted.calls).toEqual({ get: 0, head: 1, resolve: 1 });
    }
  });

  test("rejects stale metadata and oversized thumbnail objects before reading the body", async () => {
    const stale = dependencies(
      {
        bucket: {
          async head() {
            stale.calls.head += 1;
            return storedObject({
              variant: "thumbnail",
              customMetadata: {
                contentFingerprint: thumbnailExpectation.fingerprint,
                sourceFingerprint: thumbnailExpectation.sourceVersion,
                variant: "full",
              },
            });
          },
          async get() {
            stale.calls.get += 1;
            return storedObject({ body: true, variant: "thumbnail" });
          },
        },
      },
      "thumbnail",
    );
    const staleResponse = await serveArtworkArtifact(
      new Request(artifactUrl(thumbnailExpectation.fingerprint, "thumbnail")),
      { artworkId, filename: "thumbnail.jpg" },
      stale.value,
    );
    expect(staleResponse.status).toBe(404);
    expect(stale.calls).toEqual({ get: 0, head: 1, resolve: 1 });

    const oversized = dependencies({}, "thumbnail", { size: 1_500 * 1_024 + 1 });
    const oversizedResponse = await serveArtworkArtifact(
      new Request(artifactUrl(thumbnailExpectation.fingerprint, "thumbnail")),
      { artworkId, filename: "thumbnail.jpg" },
      oversized.value,
    );
    expect(oversizedResponse.status).toBe(404);
    expect(oversized.calls).toEqual({ get: 0, head: 1, resolve: 1 });
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
      {
        contentFingerprint: "a".repeat(64),
        sourceFingerprint: storedExpectation.sourceFingerprint,
        variant: "full",
      },
      {
        contentFingerprint: storedExpectation.fingerprint,
        sourceFingerprint: storedExpectation.sourceFingerprint,
        variant: "thumbnail",
      },
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

  test("continues to serve legacy source-addressed seed objects", async () => {
    const { calls, value } = dependencies({
      bucket: {
        async head() {
          calls.head += 1;
          return storedObject({ customMetadata: artworkArtifactCustomMetadata(expectation) });
        },
        async get() {
          calls.get += 1;
          return storedObject({
            body: true,
            customMetadata: artworkArtifactCustomMetadata(expectation),
          });
        },
      },
    });
    const response = await serveArtworkArtifact(
      new Request(artifactUrl()),
      { artworkId, filename: "full.jpg" },
      value,
    );
    expect(response.status).toBe(200);
    expect(calls).toEqual({ get: 1, head: 1, resolve: 1 });
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
