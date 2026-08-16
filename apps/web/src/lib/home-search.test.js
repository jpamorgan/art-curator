import { describe, expect, test } from "bun:test";

import { parseHomeSearch } from "./home-search";

describe("home search", () => {
  test("preserves valid artwork filters and the optional feed marker", () => {
    expect(
      parseHomeSearch({
        category: "painting",
        style: "abstract",
        sort: "artist",
        feed: "for-you",
      }),
    ).toEqual({
      category: "painting",
      style: undefined,
      sort: "artist",
      feed: "for-you",
    });
  });

  test("keeps category precedence over style", () => {
    expect(parseHomeSearch({ category: "painting", style: "abstract" })).toEqual({
      category: "painting",
      style: undefined,
      sort: undefined,
      feed: undefined,
    });
  });

  test("preserves style when no category is selected", () => {
    expect(parseHomeSearch({ style: "abstract", sort: "title" })).toEqual({
      category: undefined,
      style: "abstract",
      sort: "title",
      feed: undefined,
    });
  });

  test("drops unsupported sort values and feed markers", () => {
    expect(parseHomeSearch({ sort: "popular", feed: "recommended" })).toEqual({
      category: undefined,
      style: undefined,
      sort: undefined,
      feed: undefined,
    });
  });
});
