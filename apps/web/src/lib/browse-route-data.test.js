import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";

import { loadValidatedBrowseData } from "./browse-route-data";

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
});
