import { describe, expect, test } from "bun:test";

import {
  buildHeaderFilters,
  headerFilterIdentity,
  selectedHeaderFilterIdentity,
} from "./header-filters";

describe("header taxonomy filter identity", () => {
  test("keeps category and style entries that share a slug", () => {
    const filters = buildHeaderFilters(
      [
        { slug: "modern", name: "Modern category" },
        { slug: "modern", name: "Duplicate category" },
      ],
      [{ slug: "modern", name: "Modern style" }],
    );

    expect(filters.map(headerFilterIdentity)).toEqual([
      "all:all",
      "category:modern",
      "style:modern",
    ]);
    expect(filters.map((filter) => filter.name)).toEqual([
      "All",
      "Modern category",
      "Modern style",
    ]);
  });

  test("selects a colliding category and style independently", () => {
    expect(selectedHeaderFilterIdentity({ category: "modern" })).toBe("category:modern");
    expect(selectedHeaderFilterIdentity({ style: "modern" })).toBe("style:modern");
  });

  test("uses category precedence for malformed search containing both namespaces", () => {
    expect(selectedHeaderFilterIdentity({ category: "modern", style: "modern" })).toBe(
      "category:modern",
    );
  });
});
