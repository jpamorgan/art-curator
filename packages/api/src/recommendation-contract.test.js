import { describe, expect, test } from "bun:test";

import {
  followToggleInputSchema,
  recommendationInputSchema,
  recommendationReasonCodeSchema,
} from "./recommendation-contract";

describe("recommendation contracts", () => {
  test("supports global, profile, and seed recommendation requests", () => {
    expect(recommendationInputSchema.parse({})).toMatchObject({
      personalized: false,
      discovery: "balanced",
      limit: 24,
    });
    expect(
      recommendationInputSchema.parse({
        seedArtworkId: "met-great-wave",
        personalized: true,
        discovery: "adventurous",
      }),
    ).toMatchObject({ seedArtworkId: "met-great-wave", personalized: true });
  });

  test("keeps the public explanation vocabulary fixed", () => {
    expect(recommendationReasonCodeSchema.options).toEqual([
      "followed_artist",
      "followed_gallery",
      "followed_style",
      "similar_to_favorite",
      "style_affinity",
      "new_work",
      "discovery",
    ]);
  });

  test("rejects ambiguous follow targets", () => {
    expect(followToggleInputSchema.safeParse({ kind: "artist", id: "artist-one" }).success).toBe(
      true,
    );
    expect(
      followToggleInputSchema.safeParse({ kind: "category", id: "category-one" }).success,
    ).toBe(false);
  });
});
