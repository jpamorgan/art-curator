import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import {
  clearFavoriteFlags,
  clearPrivateArtQueryState,
  isFavoritesPath,
  isPrivateArtPath,
  queryKeyBelongsToUser,
  scopePrivateQueryKey,
  shouldClearPrivateArtData,
} from "./private-session";

describe("private art session boundaries", () => {
  test("scopes private query keys by identity without changing their prefix", () => {
    const baseKey = [["favorites", "ids"], { type: "query" }];
    const userAKey = scopePrivateQueryKey(baseKey, "user-a");
    const userBKey = scopePrivateQueryKey(baseKey, "user-b");

    expect(userAKey.slice(0, -1)).toEqual(baseKey);
    expect(userBKey.slice(0, -1)).toEqual(baseKey);
    expect(userAKey).not.toEqual(userBKey);
    expect(queryKeyBelongsToUser(userAKey, "user-a")).toBe(true);
    expect(queryKeyBelongsToUser(userAKey, "user-b")).toBe(false);
  });

  test("keeps scoped ids and list queries discoverable through the favorites prefix", () => {
    const queryClient = new QueryClient();
    const favoritesPrefix = [["favorites"], {}];
    const idsKey = scopePrivateQueryKey([["favorites", "ids"], { type: "query" }], "user-a");
    const listKey = scopePrivateQueryKey(
      [["favorites", "list"], { type: "infinite", input: { limit: 30 } }],
      "user-a",
    );

    queryClient.setQueryData(idsKey, { ids: ["one"] });
    queryClient.setQueryData(listKey, { pages: [], pageParams: [] });

    expect(queryClient.getQueriesData({ queryKey: favoritesPrefix })).toHaveLength(2);
  });

  test.each([
    [undefined, null, true],
    [undefined, "user-a", false],
    [null, null, false],
    [null, "user-a", true],
    ["user-a", null, true],
    ["user-a", "user-a", false],
    ["user-a", "user-b", true],
  ])("detects session transition %p to %p", (previous, next, expected) => {
    expect(shouldClearPrivateArtData(previous, next)).toBe(expected);
  });

  test("clears nested artwork favorite flags without mutating the cached value", () => {
    const cached = {
      pages: [
        {
          items: [{ id: "one", isFavorite: true }],
          nextCursor: null,
        },
      ],
      unrelated: { ready: true },
    };

    const cleared = clearFavoriteFlags(cached);

    expect(cleared.pages[0].items[0].isFavorite).toBe(false);
    expect(cached.pages[0].items[0].isFavorite).toBe(true);
    expect(cleared.unrelated.ready).toBe(true);
  });

  test("identity transitions clear only other users' private state and reset public flags", () => {
    const queryClient = new QueryClient();
    const favoritesPrefix = [["favorites"]];
    const artworksPrefix = [["artworks"]];
    const userAKey = scopePrivateQueryKey([["favorites", "ids"]], "user-a");
    const userBKey = scopePrivateQueryKey([["favorites", "ids"]], "user-b");
    const artworkKey = [["artworks", "list"], { input: { limit: 12 } }];
    queryClient.setQueryData(userAKey, { ids: ["one"] });
    queryClient.setQueryData(userBKey, { ids: ["two"] });
    queryClient.setQueryData(artworkKey, {
      pages: [{ items: [{ id: "one", isFavorite: true }] }],
    });

    clearPrivateArtQueryState(queryClient, favoritesPrefix, artworksPrefix, "user-b");

    expect(queryClient.getQueryData(userAKey)).toBeUndefined();
    expect(queryClient.getQueryData(userBKey)).toEqual({ ids: ["two"] });
    expect(queryClient.getQueryData(artworkKey)).toEqual({
      pages: [{ items: [{ id: "one", isFavorite: false }] }],
    });
  });

  test("does not cancel, remove, or invalidate an in-flight public destination query", async () => {
    const queryClient = new QueryClient();
    const artworkKey = [["artworks", "list"], { input: { limit: 12 } }];
    let resolveArtwork;
    const artworkResult = { pages: [{ items: [{ id: "one", isFavorite: false }] }] };
    const pendingArtwork = queryClient.fetchQuery({
      queryKey: artworkKey,
      queryFn: () =>
        new Promise((resolve) => {
          resolveArtwork = resolve;
        }),
    });

    clearPrivateArtQueryState(queryClient, [["favorites"]], [["artworks"]], null);

    expect(queryClient.getQueryState(artworkKey)?.fetchStatus).toBe("fetching");
    expect(queryClient.getQueryState(artworkKey)?.isInvalidated).toBe(false);
    resolveArtwork(artworkResult);
    await expect(pendingArtwork).resolves.toEqual(artworkResult);
    expect(queryClient.getQueryData(artworkKey)).toEqual(artworkResult);
  });

  test("matches only the favorites route", () => {
    expect(isFavoritesPath("/favorites")).toBe(true);
    expect(isFavoritesPath("/favorites/")).toBe(true);
    expect(isFavoritesPath("/favorites/shared")).toBe(false);
  });

  test("recognizes every protected art feed", () => {
    expect(isPrivateArtPath("/favorites")).toBe(true);
    expect(isPrivateArtPath("/following/")).toBe(true);
    expect(isPrivateArtPath("/")).toBe(false);
  });
});
