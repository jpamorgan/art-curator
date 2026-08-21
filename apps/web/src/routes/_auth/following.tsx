import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ArtGallery } from "@/components/art-gallery";
import { GalleryPageSkeleton } from "@/components/gallery-skeleton";
import { RouteUnavailable } from "@/components/route-unavailable";
import { followingFeedOptions } from "@/lib/discovery-options";

export const Route = createFileRoute("/_auth/following")({
  loader: ({ context }) =>
    context.queryClient.ensureInfiniteQueryData(followingFeedOptions(context.session.user.id)),
  head: () => ({
    meta: [
      { title: "Following — Art" },
      {
        name: "description",
        content: "The latest curated works from artists, galleries, and styles you follow.",
      },
    ],
  }),
  pendingComponent: GalleryPageSkeleton,
  errorComponent: () => (
    <RouteUnavailable title="Following unavailable" message="Your feed could not be loaded." />
  ),
  component: FollowingPage,
});

function FollowingPage() {
  const userId = Route.useRouteContext().session.user.id;
  const following = useInfiniteQuery({
    ...followingFeedOptions(userId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const items = following.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="following-heading" className="min-h-[calc(100dvh-3.5rem)]">
      <div className="flex min-w-0 flex-col gap-1 px-3 pt-5 pb-3">
        <h1
          id="following-heading"
          className="max-w-[24ch] text-balance text-2xl font-medium tracking-tight"
        >
          Latest from your follows
        </h1>
        <p className="max-w-[62ch] text-pretty text-base text-neutral-600 sm:text-sm">
          Every newly curated work from artists, galleries, and styles you follow, newest first.
        </p>
      </div>
      {items.length === 0 && !following.isPending && !following.isError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="max-w-[42ch] text-pretty text-base text-neutral-600 sm:text-sm">
            Follow an artist, gallery, or style to build a chronological feed here.
          </p>
          <Link
            to="/artists"
            className="inline-flex min-h-10 items-center rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm"
          >
            Browse artists
          </Link>
        </div>
      ) : (
        <ArtGallery
          items={items}
          isLoading={following.isPending}
          isError={following.isError}
          isRetrying={following.isFetching}
          errorMessage={following.error?.message}
          onRetry={() => void following.refetch()}
          hasNextPage={following.hasNextPage}
          fetchNextPage={following.fetchNextPage}
          isFetchingNextPage={following.isFetchingNextPage}
          isFetchNextPageError={following.isFetchNextPageError}
        />
      )}
    </section>
  );
}
