import { describe, expect, test } from "bun:test";

import { buildSitemapEntries } from "./sitemap";

describe("catalog sitemap", () => {
  test("includes every public route family and derives collection dates from its details", () => {
    const entries = buildSitemapEntries({
      artworks: [
        { slug: "older-work", lastModified: Date.UTC(2025, 0, 2) },
        { slug: "newer-work", lastModified: Date.UTC(2026, 7, 21) },
      ],
      artists: [{ slug: "agnes-martin", lastModified: Date.UTC(2024, 3, 5) }],
      galleries: [{ slug: "pace-gallery", lastModified: Date.UTC(2023, 6, 8) }],
      styles: [{ slug: "minimalism", lastModified: null }],
    });

    expect(entries).toEqual([
      { path: "/", lastModified: "2026-08-21" },
      { path: "/artists", lastModified: "2024-04-05" },
      { path: "/galleries", lastModified: "2023-07-08" },
      { path: "/styles", lastModified: null },
      { path: "/art/older-work", lastModified: "2025-01-02" },
      { path: "/art/newer-work", lastModified: "2026-08-21" },
      { path: "/artists/agnes-martin", lastModified: "2024-04-05" },
      { path: "/galleries/pace-gallery", lastModified: "2023-07-08" },
      { path: "/styles/minimalism", lastModified: null },
    ]);
  });
});
