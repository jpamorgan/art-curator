const SORT_OPTIONS = ["recent", "title", "artist"] as const;

type SortOrder = (typeof SORT_OPTIONS)[number];

export interface HomeSearch {
  category?: string;
  gallery?: string;
  style?: string;
  sort?: SortOrder;
  feed?: "for-you";
  discovery?: "familiar" | "balanced" | "adventurous";
}

export function parseHomeSearch(search: Record<string, unknown>): HomeSearch {
  const category =
    typeof search.category === "string" && search.category ? search.category : undefined;
  const style =
    !category && typeof search.style === "string" && search.style ? search.style : undefined;
  const gallery =
    !category && !style && typeof search.gallery === "string" && search.gallery
      ? search.gallery
      : undefined;
  const sort = SORT_OPTIONS.includes(search.sort as SortOrder)
    ? (search.sort as SortOrder)
    : undefined;
  const feed = search.feed === "for-you" ? "for-you" : undefined;
  const discovery = ["familiar", "balanced", "adventurous"].includes(search.discovery as string)
    ? (search.discovery as HomeSearch["discovery"])
    : undefined;

  return { category, gallery, style, sort, feed, discovery };
}
