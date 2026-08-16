import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ArtGallery } from "@/components/art-gallery";
import { GalleryPageSkeleton } from "@/components/gallery-skeleton";
import { RouteUnavailable } from "@/components/route-unavailable";
import { parseHomeSearch } from "@/lib/home-search";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  validateSearch: parseHomeSearch,
  loaderDeps: ({ search }) => ({
    category: search.category,
    style: search.style,
    sort: search.sort,
  }),
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
  pendingComponent: GalleryPageSkeleton,
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
      isRetrying={artworksQuery.isFetching}
      errorMessage={artworksQuery.error?.message}
      onRetry={() => void artworksQuery.refetch()}
      hasNextPage={artworksQuery.hasNextPage}
      fetchNextPage={artworksQuery.fetchNextPage}
      isFetchingNextPage={artworksQuery.isFetchingNextPage}
      isFetchNextPageError={artworksQuery.isFetchNextPageError}
    />
  );
}
