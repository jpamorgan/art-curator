import { describe, expect, test } from "bun:test";

import { downloadArtworkArtifact } from "./artifact-download";
import {
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_MAX_THUMBNAIL_BYTES,
  artworkArtifactExpectation,
  artworkArtifactUrl,
  canonicalArtifactSourceUrl,
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
    for (const location of [
      "http://127.0.0.1/private.jpg",
      "https://LOCALHOST./private.jpg",
      "https://foo.Local../private.jpg",
      "https://foo.INTERNAL./private.jpg",
      "https://intranet./private.jpg",
      "https://router.home.arpa./private.jpg",
      "https://localhost.localdomain./private.jpg",
      "https://router%E3%80%82home%E3%80%82arpa%E3%80%82/private.jpg",
    ]) {
      await expect(
        downloadArtworkArtifact(expectation, {
          fetcher: async () => new Response(null, { status: 302, headers: { Location: location } }),
        }),
      ).rejects.toThrow("redirected to an unsafe URL");
    }
  });

  test("canonicalizes a safe trailing-dot redirect before following it", async () => {
    const urls = [];
    const bytes = new Uint8Array(1_024);
    bytes.set([0xff, 0xd8, 0xff]);
    await downloadArtworkArtifact(expectation, {
      fetcher: async (url) => {
        urls.push(url.toString());
        return urls.length === 1
          ? new Response(null, {
              status: 302,
              headers: { Location: "https://CDN.Example.COM.../safe.jpg" },
            })
          : new Response(bytes, { headers: { "Content-Type": ARTIFACT_CONTENT_TYPE } });
      },
    });
    expect(urls).toEqual([expectation.canonicalUpstreamUrl, "https://cdn.example.com/safe.jpg"]);
  });
});

describe("artifact source fingerprints", () => {
  test("normalizes public FQDN dots and rejects local-only hostnames", () => {
    expect(canonicalArtifactSourceUrl("https://cdn.example.com/work")).toBe(
      "https://cdn.example.com/work",
    );
    expect(canonicalArtifactSourceUrl("https://Images.Example.COM.../work#detail")).toBe(
      "https://images.example.com/work",
    );
    for (const url of [
      "https://localhost./work",
      "https://sub.LOCALHOST../work",
      "https://foo.LoCaL./work",
      "https://foo.InTeRnAl.../work",
      "https://intranet./work",
      "https://com/work",
      "https://home.arpa/work",
      "https://router.home.arpa./work",
      "https://LOCALHOST.LocalDomain../work",
      "https://foo.localdomain/work",
      "https://router。home。arpa。/work",
      "https://router．home．arpa．/work",
      "https://router｡home｡arpa｡/work",
      "https://localhost%2e/work",
      "https://127.0.0.1./work",
      "https://10.0.0.1./work",
      "https://[::1]/work",
    ]) {
      expect(() => canonicalArtifactSourceUrl(url)).toThrow("public HTTPS host");
    }
  });

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
