import { describe, expect, test } from "bun:test";

import { parseHomeSearch } from "./home-search";

describe("home search", () => {
  test("keeps one catalog filter and the optional feed marker", () => {
    expect(
      parseHomeSearch({
        category: "painting",
        gallery: "museum",
        style: "abstract",
        sort: "artist",
        feed: "for-you",
      }),
    ).toEqual({
      category: "painting",
      gallery: undefined,
      style: undefined,
      sort: "artist",
      feed: "for-you",
      discovery: undefined,
    });
  });

  test("preserves style when no higher-priority filter is selected", () => {
    expect(parseHomeSearch({ style: "abstract", sort: "title" })).toEqual({
      category: undefined,
      gallery: undefined,
      style: "abstract",
      sort: "title",
      feed: undefined,
      discovery: undefined,
    });
  });

  test("keeps gallery and a supported discovery level", () => {
    expect(parseHomeSearch({ gallery: "tate", discovery: "adventurous" })).toEqual({
      category: undefined,
      gallery: "tate",
      style: undefined,
      sort: undefined,
      feed: undefined,
      discovery: "adventurous",
    });
  });

  test("drops unsupported sort, feed, and discovery values", () => {
    expect(parseHomeSearch({ sort: "popular", feed: "recommended", discovery: "chaotic" })).toEqual(
      {
        category: undefined,
        gallery: undefined,
        style: undefined,
        sort: undefined,
        feed: undefined,
        discovery: undefined,
      },
    );
  });
});
