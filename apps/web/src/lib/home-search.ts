const SORT_OPTIONS = ["recent", "title", "artist"] as const;

type SortOrder = (typeof SORT_OPTIONS)[number];

export interface HomeSearch {
  category?: string;
  style?: string;
  sort?: SortOrder;
  feed?: "for-you";
}

export function parseHomeSearch(search: Record<string, unknown>): HomeSearch {
  const category =
    typeof search.category === "string" && search.category ? search.category : undefined;
  const style =
    !category && typeof search.style === "string" && search.style ? search.style : undefined;
  const sort = SORT_OPTIONS.includes(search.sort as SortOrder)
    ? (search.sort as SortOrder)
    : undefined;
  const feed = search.feed === "for-you" ? "for-you" : undefined;

  return { category, style, sort, feed };
}
