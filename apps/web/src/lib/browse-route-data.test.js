import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";

import { loadBrowseRouteData, loadValidatedBrowseData } from "./browse-route-data";

describe("browse route metadata gating", () => {
  test("returns validated metadata before the filtered feed can render", async () => {
    const metadata = { gallery: { slug: "rijksmuseum", name: "Rijksmuseum" } };

    await expect(loadValidatedBrowseData(async () => metadata)).resolves.toEqual(metadata);
  });

  test("maps a missing entity to a not-found result", async () => {
    await expect(
      loadValidatedBrowseData(async () => {
        throw new ORPCError("NOT_FOUND");
      }),
    ).resolves.toBeNull();
  });

  test("preserves operational errors for the route error boundary", async () => {
    await expect(
      loadValidatedBrowseData(async () => {
        throw new Error("network unavailable");
      }),
    ).rejects.toThrow("network unavailable");
  });

  test("starts metadata and artwork loading together", async () => {
    let releaseMetadata;
    let artworkStarted = false;
    const metadata = new Promise((resolve) => {
      releaseMetadata = resolve;
    });

    const routeData = loadBrowseRouteData(
      () => metadata,
      async () => {
        artworkStarted = true;
      },
    );

    await Promise.resolve();
    expect(artworkStarted).toBe(true);
    releaseMetadata({ gallery: { slug: "rijksmuseum" } });
    await expect(routeData).resolves.toEqual({ gallery: { slug: "rijksmuseum" } });
  });

  test("keeps authoritative not-found metadata ahead of an artwork failure", async () => {
    await expect(
      loadBrowseRouteData(
        async () => {
          throw new ORPCError("NOT_FOUND");
        },
        async () => {
          throw new Error("artwork unavailable");
        },
      ),
    ).resolves.toBeNull();
  });

  test("preserves artwork failures after metadata succeeds", async () => {
    await expect(
      loadBrowseRouteData(
        async () => ({ gallery: { slug: "rijksmuseum" } }),
        async () => {
          throw new Error("artwork unavailable");
        },
      ),
    ).rejects.toThrow("artwork unavailable");
  });
});
