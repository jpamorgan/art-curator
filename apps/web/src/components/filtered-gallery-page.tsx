import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { ArtGallery } from "@/components/art-gallery";
import { GallerySkeleton } from "@/components/gallery-skeleton";
import { orpc } from "@/utils/orpc";

type SortOrder = "recent" | "title" | "artist";

export function getFilteredArtworkListInput(
  filter: "gallery" | "style",
  slug: string,
  sort: SortOrder,
) {
  return (cursor: string | undefined) => ({
    cursor,
    limit: 12,
    sort,
    gallery: filter === "gallery" ? slug : undefined,
    style: filter === "style" ? slug : undefined,
  });
}

interface FilteredGalleryPageProps {
  filter: "gallery" | "style";
  slug: string;
  sort?: SortOrder;
  title: string;
  subtitle?: string;
}

export function FilteredGalleryPage({
  filter,
  slug,
  sort = "recent",
  title,
  subtitle,
}: FilteredGalleryPageProps) {
  const artworksQuery = useInfiniteQuery(
    orpc.artworks.list.infiniteOptions({
      input: getFilteredArtworkListInput(filter, slug, sort),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
  );
  const items = artworksQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <div className="flex min-h-16 items-end justify-between gap-4 px-3 py-3">
        <h1 className="min-w-0 truncate text-xl font-medium text-neutral-950 text-balance">
          {title}
        </h1>
        {subtitle ? (
          <p className="shrink-0 truncate text-base text-neutral-500 sm:text-sm">{subtitle}</p>
        ) : null}
      </div>
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
        emptyMessage={`No artwork in ${title}.`}
      />
    </>
  );
}

export function FilteredGalleryPageSkeleton() {
  return (
    <div role="status" aria-label="Loading collection">
      <div className="flex min-h-16 items-end justify-between gap-4 px-3 py-3">
        <div className="h-7 w-48 max-w-2/3 animate-pulse rounded-full bg-neutral-100 motion-reduce:animate-none" />
        <div className="h-5 w-24 animate-pulse rounded-full bg-neutral-100 motion-reduce:animate-none" />
      </div>
      <div className="@container px-2 py-2 sm:px-3">
        <GallerySkeleton />
      </div>
    </div>
  );
}

interface FilteredGalleryRouteStateProps {
  kind: "gallery" | "style";
  status: "not-found" | "error";
}

export function FilteredGalleryRouteState({ kind, status }: FilteredGalleryRouteStateProps) {
  const label = kind === "gallery" ? "Gallery" : "Style";
  const browseLabel = kind === "gallery" ? "Browse galleries" : "Browse styles";
  const heading = status === "not-found" ? `${label} not found` : `${label} unavailable`;
  const message =
    status === "not-found" ? `This ${kind} does not exist.` : `This ${kind} could not be loaded.`;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-6 text-neutral-950">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-balance text-2xl font-medium tracking-tight">{heading}</h1>
        <p className="text-pretty text-base text-neutral-600 sm:text-sm">{message}</p>
        {kind === "gallery" ? (
          <Link
            to="/galleries"
            className="inline-flex min-h-10 items-center rounded-full bg-neutral-950 px-3 text-base font-medium text-white outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
          >
            {browseLabel}
          </Link>
        ) : (
          <Link
            to="/styles"
            className="inline-flex min-h-10 items-center rounded-full bg-neutral-950 px-3 text-base font-medium text-white outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
          >
            {browseLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
