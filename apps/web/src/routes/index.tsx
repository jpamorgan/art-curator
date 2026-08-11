import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ArtGallery } from "@/components/art-gallery";
import { RouteUnavailable } from "@/components/route-unavailable";
import { orpc } from "@/utils/orpc";

const SORT_OPTIONS = ["recent", "title", "artist"] as const;
type SortOrder = (typeof SORT_OPTIONS)[number];

interface GallerySearch {
  category?: string;
  style?: string;
  sort?: SortOrder;
}

function parseGallerySearch(search: Record<string, unknown>): GallerySearch {
  const category =
    typeof search.category === "string" && search.category ? search.category : undefined;
  const style =
    !category && typeof search.style === "string" && search.style ? search.style : undefined;
  const sort = SORT_OPTIONS.includes(search.sort as SortOrder)
    ? (search.sort as SortOrder)
    : undefined;

  return { category, style, sort };
}

export const Route = createFileRoute("/")({
  validateSearch: parseGallerySearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      context.orpc.artworks.list.infiniteOptions({
        input: (cursor: string | undefined) => ({
          cursor,
          limit: 12,
          category: deps.category,
          style: deps.style,
          sort: deps.sort ?? "recent",
        }),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }),
    ),
  head: () => ({
    meta: [
      { title: "Art — Discover work you love" },
      {
        name: "description",
        content: "Discover and save artwork, artists, galleries, and styles.",
      },
    ],
  }),
  errorComponent: () => (
    <RouteUnavailable title="Art unavailable" message="The gallery could not be loaded." />
  ),
  component: HomeComponent,
});

function HomeComponent() {
  const search = Route.useSearch();
  const artworksQuery = useInfiniteQuery(
    orpc.artworks.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        cursor,
        limit: 12,
        category: search.category,
        style: search.style,
        sort: search.sort ?? "recent",
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
  );
  const items = artworksQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <ArtGallery
      items={items}
      isLoading={artworksQuery.isPending}
      isError={artworksQuery.isError}
      errorMessage={artworksQuery.error?.message}
      onRetry={() => void artworksQuery.refetch()}
      hasNextPage={artworksQuery.hasNextPage}
      fetchNextPage={artworksQuery.fetchNextPage}
      isFetchingNextPage={artworksQuery.isFetchingNextPage}
      isFetchNextPageError={artworksQuery.isFetchNextPageError}
    />
  );
}
