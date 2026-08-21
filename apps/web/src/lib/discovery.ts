import type { ArtworkCardData } from "@/components/artwork-card";

export const DISCOVERY_LEVELS = ["familiar", "balanced", "adventurous"] as const;
export type DiscoveryLevel = (typeof DISCOVERY_LEVELS)[number];

export const RECOMMENDATION_REASON_CODES = [
  "followed_artist",
  "followed_gallery",
  "followed_style",
  "similar_to_favorite",
  "style_affinity",
  "new_work",
  "discovery",
] as const;

export type RecommendationReasonCode = (typeof RECOMMENDATION_REASON_CODES)[number];

export interface RecommendationReason {
  code: RecommendationReasonCode;
  label: string;
}

export interface RecommendationItem {
  artwork: ArtworkCardData;
  reason: RecommendationReason;
  recommendationToken: string;
}

export interface RecommendationProfile {
  favoriteCount?: number;
  minimumFavoriteCount?: number;
  needsOnboarding?: boolean;
}

export interface RecommendationPage {
  items: RecommendationItem[];
  nextCursor: string | null;
  profile?: RecommendationProfile;
}

export type FollowEntityType = "artist" | "gallery" | "style";

export function getDefaultDiscovery(feed: "explore" | "for-you" | "radio") {
  return feed === "explore" ? "adventurous" : "balanced";
}

export function getRecommendationHeading(feed: "explore" | "for-you", hasExplicitSort: boolean) {
  if (hasExplicitSort) return "Browse the catalog";
  return feed === "for-you" ? "Picked for you" : "Explore something unexpected";
}

export function parseFilterValue(value: string) {
  const [kind, slug] = value.split(":", 2);
  if (!slug || !["category", "gallery", "style"].includes(kind)) {
    return { category: undefined, gallery: undefined, style: undefined };
  }
  return {
    category: kind === "category" ? slug : undefined,
    gallery: kind === "gallery" ? slug : undefined,
    style: kind === "style" ? slug : undefined,
  };
}

export function getFilterValue(search: { category?: string; gallery?: string; style?: string }) {
  if (search.category) return `category:${search.category}`;
  if (search.style) return `style:${search.style}`;
  if (search.gallery) return `gallery:${search.gallery}`;
  return "";
}
