import { describe, expect, test } from "bun:test";

import {
  ARTIFACT_CACHE_CONTROL,
  ARTIFACT_CONTENT_TYPE,
  ARTWORK_ARTIFACT_SOURCES,
  artworkArtifactExpectation,
} from "@art/db/artifacts";

import { syncArtworkArtifactDescriptors, syncArtworkArtifacts } from "./sync-artwork-artifacts";

function jpegBytes() {
  const bytes = new Uint8Array(1_024);
  bytes.set([0xff, 0xd8, 0xff], 0);
  return bytes;
}

function mockBucket() {
  const objects = new Map();
  const calls = { head: 0, put: 0 };

  return {
    calls,
    objects,
    value: {
      async head(key) {
        calls.head += 1;
        return objects.get(key) ?? null;
      },
      async put(key, value, options) {
        calls.put += 1;
        const size = value.byteLength;
        objects.set(key, {
          key,
          size,
          etag: `etag-${key}`,
          uploaded: new Date(),
          httpMetadata: { ...options.httpMetadata },
          customMetadata: { ...options.customMetadata },
        });
      },
    },
  };
}

function jpegFetcher(calls) {
  return async (url, init) => {
    calls.push({ init, url: url.toString() });
    return new Response(jpegBytes(), {
      status: 200,
      headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
    });
  };
}

describe("artwork artifact sync", () => {
  test("uploads exactly 48 checked objects, then skips an unchanged rerun", async () => {
    const bucket = mockBucket();
    const fetchCalls = [];

    const first = await syncArtworkArtifacts(bucket.value, {
      concurrency: 8,
      fetcher: jpegFetcher(fetchCalls),
    });

    expect(ARTWORK_ARTIFACT_SOURCES).toHaveLength(24);
    expect(first).toEqual({ total: 48, uploaded: 48, skipped: 0 });
    expect(bucket.objects.size).toBe(48);
    expect(bucket.calls.put).toBe(48);
    expect(fetchCalls).toHaveLength(48);
    expect(
      fetchCalls.every(
        ({ init }) =>
          init.headers.Accept === ARTIFACT_CONTENT_TYPE &&
          init.headers["User-Agent"].startsWith("Art Curator artifact import/") &&
          init.signal instanceof AbortSignal,
      ),
    ).toBe(true);
    expect(
      [...bucket.objects.values()].every(
        ({ customMetadata, httpMetadata, size }) =>
          size === 1_024 &&
          httpMetadata.contentType === ARTIFACT_CONTENT_TYPE &&
          httpMetadata.cacheControl === ARTIFACT_CACHE_CONTROL &&
          httpMetadata.contentDisposition.startsWith("inline; filename=") &&
          /^[a-f0-9]{64}$/.test(customMetadata.sourceFingerprint) &&
          customMetadata.sourceVersion.length > 0,
      ),
    ).toBe(true);

    fetchCalls.length = 0;
    const second = await syncArtworkArtifacts(bucket.value, {
      fetcher: jpegFetcher(fetchCalls),
    });

    expect(second).toEqual({ total: 48, uploaded: 0, skipped: 48 });
    expect(fetchCalls).toHaveLength(0);
    expect(bucket.calls.put).toBe(48);
  });

  test("repairs an object whose durable metadata does not match", async () => {
    const bucket = mockBucket();
    await syncArtworkArtifacts(bucket.value, { fetcher: jpegFetcher([]) });
    const [firstKey, firstObject] = bucket.objects.entries().next().value;
    bucket.objects.set(firstKey, {
      ...firstObject,
      httpMetadata: { ...firstObject.httpMetadata, cacheControl: "no-store" },
    });
    const fetchCalls = [];

    const result = await syncArtworkArtifacts(bucket.value, {
      fetcher: jpegFetcher(fetchCalls),
    });

    expect(result).toEqual({ total: 48, uploaded: 1, skipped: 47 });
    expect(fetchCalls).toHaveLength(1);
    expect(bucket.objects.get(firstKey).httpMetadata.cacheControl).toBe(ARTIFACT_CACHE_CONTROL);
  });

  test("changes immutable keys when source identity changes and skips the exact rerun", async () => {
    const bucket = mockBucket();
    const fetchCalls = [];
    const firstDescriptor = {
      artworkId: "dynamic-work",
      variant: "thumbnail",
      upstreamUrl: "https://images.example.com/work.jpg?size=small",
      sourceVersion: "record-v1",
    };
    const changedDescriptor = {
      ...firstDescriptor,
      upstreamUrl: "https://images.example.com/work.jpg?size=updated",
      sourceVersion: "record-v2",
    };

    const first = await syncArtworkArtifactDescriptors(bucket.value, [firstDescriptor], {
      fetcher: jpegFetcher(fetchCalls),
    });
    const changed = await syncArtworkArtifactDescriptors(bucket.value, [changedDescriptor], {
      fetcher: jpegFetcher(fetchCalls),
    });
    const rerun = await syncArtworkArtifactDescriptors(bucket.value, [changedDescriptor], {
      fetcher: jpegFetcher(fetchCalls),
    });
    const [firstExpectation, changedExpectation] = await Promise.all([
      artworkArtifactExpectation(firstDescriptor),
      artworkArtifactExpectation(changedDescriptor),
    ]);

    expect(first).toEqual({ total: 1, uploaded: 1, skipped: 0 });
    expect(changed).toEqual({ total: 1, uploaded: 1, skipped: 0 });
    expect(rerun).toEqual({ total: 1, uploaded: 0, skipped: 1 });
    expect(firstExpectation.key).not.toBe(changedExpectation.key);
    expect(bucket.objects.has(firstExpectation.key)).toBe(true);
    expect(bucket.objects.has(changedExpectation.key)).toBe(true);
    expect(fetchCalls).toHaveLength(2);
  });

  test("does not trust a same-size generic JPEG without source fingerprint metadata", async () => {
    const bucket = mockBucket();
    const descriptor = {
      artworkId: "dynamic-work",
      variant: "full",
      upstreamUrl: "https://images.example.com/work.jpg",
      sourceVersion: "record-v1",
    };
    const expectation = await artworkArtifactExpectation(descriptor);
    bucket.objects.set(expectation.key, {
      key: expectation.key,
      size: jpegBytes().byteLength,
      etag: "generic",
      uploaded: new Date(),
      httpMetadata: {
        contentType: ARTIFACT_CONTENT_TYPE,
        cacheControl: ARTIFACT_CACHE_CONTROL,
        contentDisposition: 'inline; filename="dynamic-work-full.jpg"',
      },
      customMetadata: {},
    });
    const fetchCalls = [];

    const result = await syncArtworkArtifactDescriptors(bucket.value, [descriptor], {
      fetcher: jpegFetcher(fetchCalls),
    });

    expect(result).toEqual({ total: 1, uploaded: 1, skipped: 0 });
    expect(fetchCalls).toHaveLength(1);
    expect(bucket.objects.get(expectation.key).customMetadata.sourceFingerprint).toBe(
      expectation.fingerprint,
    );
  });

  test("fails closed on an unexpected upstream media response", async () => {
    const bucket = mockBucket();
    await expect(
      syncArtworkArtifacts(bucket.value, {
        concurrency: 1,
        fetcher: async () =>
          new Response("not an image", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      }),
    ).rejects.toThrow("returned text/html");
    expect(bucket.calls.put).toBe(0);
  });

  test("retries a transient upstream throttle before continuing", async () => {
    const bucket = mockBucket();
    let fetchCount = 0;
    const sleeps = [];
    const result = await syncArtworkArtifacts(bucket.value, {
      concurrency: 1,
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      fetcher: async () => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return new Response(null, { status: 429, headers: { "Retry-After": "1" } });
        }
        return new Response(jpegBytes(), {
          status: 200,
          headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
        });
      },
    });

    expect(result).toEqual({ total: 48, uploaded: 48, skipped: 0 });
    expect(fetchCount).toBe(49);
    expect(sleeps).toEqual([1_000]);
  });

  test("times out a stalled response body, aborts it, and retries", async () => {
    const bucket = mockBucket();
    const sleeps = [];
    let fetchCount = 0;
    let firstSignal;
    const result = await syncArtworkArtifacts(bucket.value, {
      attemptTimeoutMs: 5,
      concurrency: 1,
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      fetcher: async (_url, init) => {
        fetchCount += 1;
        if (fetchCount === 1) {
          firstSignal = init.signal;
          return new Response(
            new ReadableStream({
              start(controller) {
                init.signal.addEventListener("abort", () => controller.error(init.signal.reason), {
                  once: true,
                });
              },
            }),
            { headers: { "Content-Type": ARTIFACT_CONTENT_TYPE } },
          );
        }
        return new Response(jpegBytes(), {
          headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
        });
      },
    });

    expect(result).toEqual({ total: 48, uploaded: 48, skipped: 0 });
    expect(fetchCount).toBe(49);
    expect(firstSignal.aborted).toBe(true);
    expect(sleeps).toEqual([250]);
  });

  test("retries a thrown network error before continuing", async () => {
    const bucket = mockBucket();
    const sleeps = [];
    let fetchCount = 0;
    const result = await syncArtworkArtifacts(bucket.value, {
      concurrency: 1,
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      fetcher: async () => {
        fetchCount += 1;
        if (fetchCount === 1) throw new TypeError("socket reset");
        return new Response(jpegBytes(), {
          headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
        });
      },
    });

    expect(result).toEqual({ total: 48, uploaded: 48, skipped: 0 });
    expect(fetchCount).toBe(49);
    expect(sleeps).toEqual([250]);
  });

  test("fails after four bounded timeouts", async () => {
    const bucket = mockBucket();
    const sleeps = [];
    let fetchCount = 0;

    await expect(
      syncArtworkArtifacts(bucket.value, {
        attemptTimeoutMs: 2,
        concurrency: 1,
        sleep: async (milliseconds) => sleeps.push(milliseconds),
        fetcher: async (_url, init) => {
          fetchCount += 1;
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(init.signal.reason), {
              once: true,
            });
          });
        },
      }),
    ).rejects.toThrow("download failed after 4 attempts");

    expect(fetchCount).toBe(4);
    expect(sleeps).toEqual([250, 500, 1_000]);
    expect(bucket.calls.put).toBe(0);
  });

  test("fails after four thrown network errors", async () => {
    const bucket = mockBucket();
    const sleeps = [];
    let fetchCount = 0;

    await expect(
      syncArtworkArtifacts(bucket.value, {
        concurrency: 1,
        sleep: async (milliseconds) => sleeps.push(milliseconds),
        fetcher: async () => {
          fetchCount += 1;
          throw new TypeError("network unavailable");
        },
      }),
    ).rejects.toThrow("download failed after 4 attempts: network unavailable");

    expect(fetchCount).toBe(4);
    expect(sleeps).toEqual([250, 500, 1_000]);
    expect(bucket.calls.put).toBe(0);
  });
});
