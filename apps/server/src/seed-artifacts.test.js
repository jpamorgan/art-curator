import { describe, expect, test } from "bun:test";

import { ARTIFACT_CONTENT_TYPE } from "@art/db/artifacts";

import { handleSeedArtifactSyncRequest } from "./seed-artifacts";

const SECRET = "seed_sync_test_secret_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function jpegBytes() {
  const bytes = new Uint8Array(1_024);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
}

function r2() {
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
        objects.set(key, {
          key,
          size: value.byteLength,
          httpMetadata: { ...options.httpMetadata },
          customMetadata: { ...options.customMetadata },
        });
      },
    },
  };
}

function request(offset = 0, authorization = `Bearer ${SECRET}`) {
  return new Request(`https://api.art.jpamorgan.com/internal/artifact-sync?offset=${offset}`, {
    method: "POST",
    headers: { Authorization: authorization },
  });
}

describe("seed artifact synchronization endpoint", () => {
  test("rejects unauthorized jobs before touching R2", async () => {
    const bucket = r2();
    const response = await handleSeedArtifactSyncRequest(request(0, ""), {
      bucket: bucket.value,
      secret: SECRET,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(bucket.calls).toEqual({ head: 0, put: 0 });
  });

  test("uploads one bounded deployment chunk and skips its exact rerun", async () => {
    const bucket = r2();
    let fetches = 0;
    const syncOptions = {
      concurrency: 2,
      fetcher: async () => {
        fetches += 1;
        return new Response(jpegBytes(), {
          headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
        });
      },
      requestIntervalMs: 0,
    };

    const first = await handleSeedArtifactSyncRequest(request(), {
      bucket: bucket.value,
      secret: SECRET,
      syncOptions,
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      total: 6,
      uploaded: 6,
      skipped: 0,
      nextOffset: 6,
    });
    expect(bucket.objects.size).toBe(6);
    expect(
      [...bucket.objects.values()].every(
        (object) =>
          /^[a-f0-9]{64}$/.test(object.customMetadata.sourceFingerprint) &&
          object.customMetadata.sourceVersion.length > 0,
      ),
    ).toBe(true);

    const second = await handleSeedArtifactSyncRequest(request(), {
      bucket: bucket.value,
      secret: SECRET,
      syncOptions,
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      total: 6,
      uploaded: 0,
      skipped: 6,
      nextOffset: 6,
    });
    expect(fetches).toBe(6);
    expect(bucket.calls.put).toBe(6);
  });

  test("rejects malformed chunk offsets without R2 work", async () => {
    for (const offset of [-1, 1, 48]) {
      const bucket = r2();
      const response = await handleSeedArtifactSyncRequest(request(offset), {
        bucket: bucket.value,
        secret: SECRET,
      });
      expect(response.status).toBe(400);
      expect(bucket.calls).toEqual({ head: 0, put: 0 });
    }
  });
});
