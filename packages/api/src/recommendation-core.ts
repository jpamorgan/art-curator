export function stableRecommendationHash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function effectivePersonalization(requested: boolean, userId?: string) {
  return Boolean(requested && userId);
}

export function recommendationSignalUserId(requested: boolean, userId?: string) {
  return effectivePersonalization(requested, userId) ? userId : undefined;
}

export function recommendationAnchorIds(
  seedArtworkId: string | undefined,
  personalized: boolean,
  favoriteIds: string[],
) {
  return [
    ...new Set([...(seedArtworkId ? [seedArtworkId] : []), ...(personalized ? favoriteIds : [])]),
  ];
}

export function recommendationSignature(value: unknown) {
  return String(stableRecommendationHash(JSON.stringify(value)));
}

export function freshnessScore(curatedAt: Date, now: number) {
  const ageDays = Math.max(0, (now - curatedAt.getTime()) / 86_400_000);
  return Math.max(0, 1 - ageDays / 365);
}

export function recommendationVectorState(
  positive: ReadonlyMap<string, number>,
  negative: ReadonlyMap<string, number>,
) {
  const entries = [
    ...[...positive].map(([id, score]) => `p:${id}:${score.toFixed(8)}`),
    ...[...negative].map(([id, score]) => `n:${id}:${score.toFixed(8)}`),
  ].sort();
  return {
    mode: entries.length ? ("vector" as const) : ("d1" as const),
    digest: entries.length ? String(stableRecommendationHash(entries.join("|"))) : "d1",
  };
}

export function recommendationScore(input: {
  semantic: number;
  negativeSemantic: number;
  facetAffinity: number;
  affinityWeight: number;
  followBoost: number;
  freshness: number;
  freshnessWeight: number;
  stableRandom: number;
  randomWeight: number;
}) {
  return (
    (input.semantic * 12 - input.negativeSemantic * 8 + input.facetAffinity) *
      input.affinityWeight +
    input.followBoost +
    input.freshness * input.freshnessWeight +
    input.stableRandom * input.randomWeight
  );
}

export function diversifyStable<T>(
  items: T[],
  penalty: number,
  score: (item: T) => number,
  artistIds: (item: T) => Iterable<string>,
  galleryId: (item: T) => string,
) {
  const remaining = [...items];
  const result: T[] = [];
  const artistUse = new Map<string, number>();
  const galleryUse = new Map<string, number>();
  while (remaining.length) {
    let best = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      let repeat = galleryUse.get(galleryId(candidate)) ?? 0;
      for (const id of artistIds(candidate)) repeat += artistUse.get(id) ?? 0;
      const adjusted = score(candidate) - repeat * penalty;
      if (adjusted > bestScore) {
        best = index;
        bestScore = adjusted;
      }
    }
    const [picked] = remaining.splice(best, 1);
    if (!picked) break;
    result.push(picked);
    const pickedGallery = galleryId(picked);
    galleryUse.set(pickedGallery, (galleryUse.get(pickedGallery) ?? 0) + 1);
    for (const id of artistIds(picked)) artistUse.set(id, (artistUse.get(id) ?? 0) + 1);
  }
  return result;
}

export function selectRecommendationReason(input: {
  followed?: "artist" | "gallery" | "style";
  personalized: boolean;
  seed: boolean;
  sharedStyle: boolean;
  hasAffinity: boolean;
  isNew: boolean;
}) {
  if (input.followed === "artist")
    return { code: "followed_artist" as const, label: "New from an artist you follow" };
  if (input.followed === "gallery")
    return { code: "followed_gallery" as const, label: "From a gallery you follow" };
  if (input.followed === "style")
    return { code: "followed_style" as const, label: "A style you follow" };
  if ((input.personalized || input.seed) && input.hasAffinity) {
    if (input.sharedStyle)
      return {
        code: "style_affinity" as const,
        label: input.seed ? "Shares a style with this work" : "Matches styles you save",
      };
    return {
      code: "similar_to_favorite" as const,
      label: input.seed ? "Similar to this artwork" : "Similar to works you save",
    };
  }
  if (input.isNew) return { code: "new_work" as const, label: "Newly added" };
  return { code: "discovery" as const, label: "A fresh discovery" };
}
