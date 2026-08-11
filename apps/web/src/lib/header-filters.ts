export type HeaderFilterKind = "all" | "category" | "style";

export type HeaderFilter = {
  slug: string;
  name: string;
  kind: HeaderFilterKind;
};

type TaxonomyLink = Pick<HeaderFilter, "slug" | "name">;

export function headerFilterIdentity(filter: Pick<HeaderFilter, "kind" | "slug">) {
  return `${filter.kind}:${filter.slug}`;
}

export function selectedHeaderFilterIdentity(search: { category?: string; style?: string }) {
  if (search.category) return headerFilterIdentity({ kind: "category", slug: search.category });
  if (search.style) return headerFilterIdentity({ kind: "style", slug: search.style });
  return headerFilterIdentity({ kind: "all", slug: "all" });
}

export function buildHeaderFilters(
  categories: readonly TaxonomyLink[],
  styles: readonly TaxonomyLink[],
): HeaderFilter[] {
  const filters: HeaderFilter[] = [
    { slug: "all", name: "All", kind: "all" },
    ...categories.map((category) => ({ ...category, kind: "category" as const })),
    ...styles.map((style) => ({ ...style, kind: "style" as const })),
  ];
  const seen = new Set<string>();

  return filters.filter((filter) => {
    const identity = headerFilterIdentity(filter);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
