import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { isNotFound } from "@tanstack/react-router";

import { loadArtworkRouteData } from "./artwork-route-data";

describe("artwork route data", () => {
  test("maps a missing artwork to TanStack Router's 404 boundary", async () => {
    let routeError;

    try {
      await loadArtworkRouteData(async () => {
        throw new ORPCError("NOT_FOUND");
      });
    } catch (error) {
      routeError = error;
    }

    expect(isNotFound(routeError)).toBe(true);
  });

  test("returns artwork data unchanged", async () => {
    const data = { artwork: { slug: "the-starry-night" }, related: [] };

    await expect(loadArtworkRouteData(async () => data)).resolves.toBe(data);
  });

  test("preserves operational errors for the route error boundary", async () => {
    await expect(
      loadArtworkRouteData(async () => {
        throw new Error("network unavailable");
      }),
    ).rejects.toThrow("network unavailable");
  });
});
