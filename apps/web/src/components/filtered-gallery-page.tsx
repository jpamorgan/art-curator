import { Skeleton } from "@art/ui/components/skeleton";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { ArtGallery } from "@/components/art-gallery";
import { FollowButton } from "@/components/follow-button";
import { GallerySkeleton } from "@/components/gallery-skeleton";
import { orpc } from "@/utils/orpc";

type SortOrder = "recent" | "title" | "artist";

export function getFilteredArtworkListInput(
  filter: "artist" | "gallery" | "style",
  slug: string,
  sort: SortOrder,
) {
  return (cursor: string | undefined) => ({
    cursor,
    limit: 12,
    sort,
    gallery: filter === "gallery" ? slug : undefined,
    artist: filter === "artist" ? slug : undefined,
    style: filter === "style" ? slug : undefined,
  });
}

interface FilteredGalleryPageProps {
  filter: "artist" | "gallery" | "style";
  slug: string;
  entityId?: string;
  initialIsFollowing?: boolean;
  sort?: SortOrder;
  title: string;
  subtitle?: string;
}

export function FilteredGalleryPage({
  filter,
  slug,
  entityId,
  initialIsFollowing,
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
        <div className="min-w-0">
          <h1 className="min-w-0 truncate text-xl font-medium text-neutral-950 text-balance">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-base text-neutral-500 sm:text-sm">{subtitle}</p>
          ) : null}
        </div>
        {entityId ? (
          <FollowButton kind={filter} entityId={entityId} initialIsFollowing={initialIsFollowing} />
        ) : null}
      </div>
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
        emptyMessage={`No artwork in ${title}.`}
      />
    </>
  );
}

export function FilteredGalleryPageSkeleton({
  filter,
}: {
  filter: "artist" | "gallery" | "style";
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading collection</span>
      <div className="flex min-h-16 items-end justify-between gap-4 px-3 py-3">
        <Skeleton className="h-7 w-48 max-w-2/3 rounded-full bg-neutral-100" />
        {filter === "gallery" ? (
          <Skeleton className="h-5 w-24 rounded-full bg-neutral-100" />
        ) : null}
      </div>
      <div className="@container px-2 py-2 sm:px-3">
        <GallerySkeleton announce={false} />
      </div>
    </div>
  );
}

interface FilteredGalleryRouteStateProps {
  kind: "artist" | "gallery" | "style";
  status: "not-found" | "error";
}

export function FilteredGalleryRouteState({ kind, status }: FilteredGalleryRouteStateProps) {
  const label = kind === "artist" ? "Artist" : kind === "gallery" ? "Gallery" : "Style";
  const browseLabel =
    kind === "artist"
      ? "Browse artists"
      : kind === "gallery"
        ? "Browse galleries"
        : "Browse styles";
  const heading = status === "not-found" ? `${label} not found` : `${label} unavailable`;
  const message =
    status === "not-found" ? `This ${kind} does not exist.` : `This ${kind} could not be loaded.`;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-6 text-neutral-950">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-balance text-2xl font-medium tracking-tight">{heading}</h1>
        <p className="text-pretty text-base text-neutral-600 sm:text-sm">{message}</p>
        {kind === "artist" ? (
          <Link
            to="/artists"
            className="inline-flex min-h-10 items-center rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
          >
            {browseLabel}
          </Link>
        ) : kind === "gallery" ? (
          <Link
            to="/galleries"
            className="inline-flex min-h-10 items-center rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
          >
            {browseLabel}
          </Link>
        ) : (
          <Link
            to="/styles"
            className="inline-flex min-h-10 items-center rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
          >
            {browseLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
