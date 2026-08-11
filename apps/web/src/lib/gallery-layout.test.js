import { describe, expect, test } from "bun:test";

import {
  GALLERY_COLUMN_LAYOUT,
  GALLERY_GAP,
  GALLERY_GRID_CLASS_NAME,
  getGalleryColumnCount,
  getGalleryItemWidth,
} from "./gallery-layout";

describe("gallery column geometry", () => {
  test.each([
    [0, 1],
    [519, 1],
    [520, 2],
    [799, 2],
    [800, 3],
    [1_119, 3],
    [1_120, 4],
    [1_439, 4],
    [1_440, 5],
    [2_000, 5],
  ])("uses the expected column count at %ipx", (width, expected) => {
    expect(getGalleryColumnCount(width)).toBe(expected);
  });

  test("uses the same exact breakpoints in the static grid classes", () => {
    for (const step of GALLERY_COLUMN_LAYOUT) {
      expect(GALLERY_GRID_CLASS_NAME).toContain(step.className);
    }
  });

  test.each([
    [320, 304, 1],
    [600, 584, 2],
    [1_200, 1_176, 4],
    [1_500, 1_476, 5],
  ])(
    "maps the %ipx QA viewport to its expected content column count",
    (viewportWidth, contentWidth, expected) => {
      expect(viewportWidth).toBeGreaterThan(contentWidth);
      expect(getGalleryColumnCount(contentWidth)).toBe(expected);
    },
  );

  test.each([
    [520, 255],
    [800, 260],
    [1_120, 272.5],
    [1_440, 280],
  ])("subtracts the shared gap before sizing lanes at %ipx", (width, expected) => {
    expect(GALLERY_GAP).toBe(10);
    expect(getGalleryItemWidth(width)).toBe(expected);
  });
});
