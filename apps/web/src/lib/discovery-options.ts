import type { DiscoveryLevel, RecommendationPage } from "@/lib/discovery";
import { scopePrivateQueryKey } from "@/lib/private-session";
import { orpc } from "@/utils/orpc";

export interface RecommendationListParameters {
  seedArtworkId?: string;
  personalized: boolean;
  discovery: DiscoveryLevel;
  category?: string;
  gallery?: string;
  style?: string;
  limit?: number;
  userId?: string | null;
}

export function getRecommendationListInput(parameters: RecommendationListParameters) {
  const { userId: _userId, ...input } = parameters;
  return (cursor: string | undefined) => ({ ...input, cursor });
}

export function recommendationListOptions(parameters: RecommendationListParameters) {
  const input = getRecommendationListInput(parameters);
  const baseOptions = {
    input,
    initialPageParam: undefined,
    getNextPageParam: (lastPage: RecommendationPage) => lastPage.nextCursor ?? undefined,
  };
  if (!parameters.personalized) {
    return orpc.recommendations.list.infiniteOptions(baseOptions);
  }
  return orpc.recommendations.list.infiniteOptions({
    ...baseOptions,
    queryKey: scopePrivateQueryKey(
      orpc.recommendations.list.infiniteKey(baseOptions),
      parameters.userId ?? null,
    ),
  });
}

export function followingFeedOptions(userId: string) {
  const baseOptions = {
    input: (cursor: string | undefined) => ({ cursor, limit: 24 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage: { nextCursor: string | null }) => lastPage.nextCursor ?? undefined,
  };
  return orpc.following.feed.infiniteOptions({
    ...baseOptions,
    queryKey: scopePrivateQueryKey(orpc.following.feed.infiniteKey(baseOptions), userId),
  });
}
