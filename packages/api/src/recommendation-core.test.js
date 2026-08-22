import { describe, expect, test } from "bun:test";

import {
  collectInChunks,
  RECOMMENDATION_D1_ID_CHUNK_SIZE,
  RECOMMENDATION_VECTOR_ID_CHUNK_SIZE,
  effectivePersonalization,
  diversifyStable,
  freshnessScore,
  recommendationAnchorIds,
  recommendationSignature,
  recommendationScore,
  recommendationSignalUserId,
  recommendationVectorState,
  selectRecommendationReason,
} from "./recommendation-core";

describe("recommendation ranking state", () => {
  test("keeps D1 and Vectorize ID lookups below their production parameter ceilings", async () => {
    const ids = Array.from({ length: 205 }, (_, index) => `work-${index}`);
    const d1Chunks = [];
    const vectorChunks = [];
    expect(
      await collectInChunks(ids, RECOMMENDATION_D1_ID_CHUNK_SIZE, async (chunk) => {
        d1Chunks.push(chunk.length);
        return chunk;
      }),
    ).toEqual(ids);
    await collectInChunks(ids.slice(0, 41), RECOMMENDATION_VECTOR_ID_CHUNK_SIZE, async (chunk) => {
      vectorChunks.push(chunk.length);
      return chunk;
    });
    expect(d1Chunks).toEqual([80, 80, 45]);
    expect(vectorChunks).toEqual([20, 20, 1]);
  });

  test("covers seed and personalization combinations without leaking signed-out taste", () => {
    expect(recommendationAnchorIds(undefined, false, ["favorite"])).toEqual([]);
    expect(recommendationAnchorIds("seed", false, ["favorite"])).toEqual(["seed"]);
    expect(recommendationAnchorIds(undefined, true, ["favorite"])).toEqual(["favorite"]);
    expect(recommendationAnchorIds("seed", true, ["favorite", "seed"])).toEqual([
      "seed",
      "favorite",
    ]);
    expect(effectivePersonalization(true)).toBe(false);
    expect(effectivePersonalization(true, "user-1")).toBe(true);
    expect(recommendationSignalUserId(false)).toBeUndefined();
    expect(recommendationSignalUserId(false, "user-1")).toBeUndefined();
    expect(recommendationSignalUserId(true, "user-1")).toBe("user-1");
  });

  test("keeps signed-in and signed-out non-personalized ranking state identical", () => {
    const signatureFor = (userId) => {
      const signalUserId = recommendationSignalUserId(false, userId);
      return recommendationSignature({
        personalized: effectivePersonalization(false, signalUserId),
        revision: signalUserId ? 12 : 0,
        follows: signalUserId ? ["artist-private"] : undefined,
        hiddenIds: signalUserId ? ["work-private"] : [],
      });
    };
    expect(signatureFor("signed-in-user")).toBe(signatureFor(undefined));
  });

  test("invalidates pagination when follows or catalog state changes", () => {
    const base = { day: "2026-08-21", revision: 2, follows: ["artist-a"], catalog: [24, 1] };
    expect(recommendationSignature(base)).toBe(recommendationSignature({ ...base }));
    expect(recommendationSignature(base)).not.toBe(
      recommendationSignature({ ...base, follows: ["artist-b"] }),
    );
    expect(recommendationSignature(base)).not.toBe(
      recommendationSignature({ ...base, catalog: [25, 2] }),
    );
  });

  test("gives recent work a bounded freshness advantage", () => {
    const now = Date.UTC(2026, 7, 21);
    expect(freshnessScore(new Date(now), now)).toBe(1);
    expect(freshnessScore(new Date(now - 182.5 * 86_400_000), now)).toBeCloseTo(0.5);
    expect(freshnessScore(new Date(now - 500 * 86_400_000), now)).toBe(0);
  });

  test("makes follow boosts positive and hidden semantic similarity negative", () => {
    const base = {
      semantic: 0.8,
      negativeSemantic: 0,
      facetAffinity: 2,
      affinityWeight: 1,
      followBoost: 0,
      freshness: 0.5,
      freshnessWeight: 1,
      stableRandom: 0.25,
      randomWeight: 1,
    };
    const baseline = recommendationScore(base);
    expect(recommendationScore({ ...base, followBoost: 3 })).toBe(baseline + 3);
    expect(recommendationScore({ ...base, negativeSemantic: 0.9 })).toBeLessThan(baseline);
  });

  test("freezes pagination to the actual Vectorize result state", () => {
    expect(recommendationVectorState(new Map(), new Map())).toEqual({ mode: "d1", digest: "d1" });
    const first = recommendationVectorState(new Map([["work-1", 0.91]]), new Map());
    expect(first.mode).toBe("vector");
    expect(recommendationVectorState(new Map([["work-1", 0.91]]), new Map())).toEqual(first);
    expect(recommendationVectorState(new Map([["work-1", 0.81]]), new Map())).not.toEqual(first);
  });

  test("diversifies repeated artists deterministically", () => {
    const works = [
      { id: "a1", score: 10, artist: "a", gallery: "g1" },
      { id: "a2", score: 9.9, artist: "a", gallery: "g2" },
      { id: "b1", score: 9.5, artist: "b", gallery: "g3" },
    ];
    const rank = () =>
      diversifyStable(
        works,
        1,
        (work) => work.score,
        (work) => [work.artist],
        (work) => work.gallery,
      ).map((work) => work.id);
    expect(rank()).toEqual(["a1", "b1", "a2"]);
    expect(rank()).toEqual(rank());
  });

  test("only explains similarity when evidence exists and prioritizes explicit follows", () => {
    const base = {
      personalized: true,
      seed: false,
      sharedStyle: false,
      hasAffinity: false,
      isNew: false,
    };
    expect(selectRecommendationReason(base).code).toBe("discovery");
    expect(selectRecommendationReason({ ...base, hasAffinity: true }).code).toBe(
      "similar_to_favorite",
    );
    expect(selectRecommendationReason({ ...base, hasAffinity: true, sharedStyle: true }).code).toBe(
      "style_affinity",
    );
    expect(selectRecommendationReason({ ...base, followed: "artist" }).code).toBe(
      "followed_artist",
    );
  });
});
