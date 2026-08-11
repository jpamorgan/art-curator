import { describe, expect, test } from "bun:test";

import { downloadArtworkArtifact } from "./artifact-download";
import {
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_MAX_THUMBNAIL_BYTES,
  artworkArtifactExpectation,
  artworkArtifactUrl,
} from "./artifacts";

const expectation = await artworkArtifactExpectation({
  artworkId: "bounded-artwork",
  variant: "thumbnail",
  upstreamUrl: "https://images.example.com/bounded.jpg",
  sourceVersion: "record-v1",
});

function oversizedJpegStream(onCancel) {
  let chunks = 0;
  return new ReadableStream({
    pull(controller) {
      const bytes = new Uint8Array(512 * 1_024);
      if (chunks === 0) bytes.set([0xff, 0xd8, 0xff]);
      controller.enqueue(bytes);
      chunks += 1;
      if (chunks === 9) controller.close();
    },
    cancel(reason) {
      onCancel?.(reason);
    },
  });
}

describe("bounded artwork downloads", () => {
  test("stops a streaming response with no Content-Length at the variant byte cap", async () => {
    let fetches = 0;
    let signal;
    await expect(
      downloadArtworkArtifact(expectation, {
        fetcher: async (_url, init) => {
          fetches += 1;
          signal = init.signal;
          return new Response(oversizedJpegStream(), {
            headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
          });
        },
      }),
    ).rejects.toThrow("exceeds its byte limit");

    expect(fetches).toBe(1);
    expect(signal.aborted).toBe(true);
  });

  test("does not trust a lying Content-Length while streaming", async () => {
    let fetches = 0;
    await expect(
      downloadArtworkArtifact(expectation, {
        fetcher: async () => {
          fetches += 1;
          return new Response(oversizedJpegStream(), {
            headers: {
              "Content-Length": "1024",
              "Content-Type": ARTIFACT_CONTENT_TYPE,
            },
          });
        },
      }),
    ).rejects.toThrow("exceeds its byte limit");

    expect(fetches).toBe(1);
  });

  test("rejects an oversized declared length before consuming the body", async () => {
    let pulls = 0;
    await expect(
      downloadArtworkArtifact(expectation, {
        fetcher: async () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                pulls += 1;
                controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff]));
              },
            }),
            {
              headers: {
                "Content-Length": String(ARTIFACT_MAX_THUMBNAIL_BYTES + 1),
                "Content-Type": ARTIFACT_CONTENT_TYPE,
              },
            },
          ),
      }),
    ).rejects.toThrow("exceeds its byte limit");

    expect(pulls).toBeLessThanOrEqual(1);
  });

  test("validates every redirect target against the public HTTPS policy", async () => {
    await expect(
      downloadArtworkArtifact(expectation, {
        fetcher: async () =>
          new Response(null, {
            status: 302,
            headers: { Location: "http://127.0.0.1/private.jpg" },
          }),
      }),
    ).rejects.toThrow("redirected to an unsafe URL");
  });
});

describe("artifact source fingerprints", () => {
  test("change with source identity and participate in the immutable public URL", async () => {
    const changed = await artworkArtifactExpectation({
      artworkId: expectation.artworkId,
      variant: expectation.variant,
      upstreamUrl: expectation.upstreamUrl,
      sourceVersion: "record-v2",
    });

    expect(changed.fingerprint).not.toBe(expectation.fingerprint);
    expect(changed.key).not.toBe(expectation.key);
    expect(
      artworkArtifactUrl(
        "https://api.art.jpamorgan.com",
        expectation.artworkId,
        "thumbnail",
        expectation.fingerprint,
      ),
    ).toBe(
      `https://api.art.jpamorgan.com/artifacts/${expectation.artworkId}/thumbnail.jpg?v=${expectation.fingerprint}`,
    );
  });
});
