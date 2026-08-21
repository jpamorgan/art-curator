import { describe, expect, test } from "bun:test";

import {
  getDefaultDiscovery,
  getFilterValue,
  getRecommendationHeading,
  parseFilterValue,
} from "./discovery";

describe("discovery surfaces", () => {
  test("keeps Explore adventurous and personalized surfaces balanced by default", () => {
    expect(getDefaultDiscovery("explore")).toBe("adventurous");
    expect(getDefaultDiscovery("for-you")).toBe("balanced");
    expect(getDefaultDiscovery("radio")).toBe("balanced");
  });

  test("makes explicit catalog ordering clear", () => {
    expect(getRecommendationHeading("explore", true)).toBe("Browse the catalog");
    expect(getRecommendationHeading("explore", false)).toBe("Explore something unexpected");
    expect(getRecommendationHeading("for-you", false)).toBe("Picked for you");
  });

  test("round trips the mutually exclusive feed filter", () => {
    expect(parseFilterValue("style:abstract-expressionism")).toEqual({
      category: undefined,
      gallery: undefined,
      style: "abstract-expressionism",
    });
    expect(getFilterValue({ gallery: "tate-modern" })).toBe("gallery:tate-modern");
    expect(parseFilterValue("invalid")).toEqual({
      category: undefined,
      gallery: undefined,
      style: undefined,
    });
  });
});
