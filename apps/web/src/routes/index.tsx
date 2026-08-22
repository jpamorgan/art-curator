import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ArtGallery } from "@/components/art-gallery";
import { ColdStartPicker } from "@/components/cold-start-picker";
import { FeedToolbar } from "@/components/feed-toolbar";
import { GalleryPageSkeleton } from "@/components/gallery-skeleton";
import { RecommendationGallery } from "@/components/recommendation-gallery";
import { RouteUnavailable } from "@/components/route-unavailable";
import { authClient } from "@/lib/auth-client";
import { getDefaultDiscovery, getRecommendationHeading } from "@/lib/discovery";
import { recommendationListOptions } from "@/lib/discovery-options";
import { parseHomeSearch } from "@/lib/home-search";
import { scopePrivateQueryKey } from "@/lib/private-session";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  validateSearch: parseHomeSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => {
    const feed = deps.feed === "for-you" ? "for-you" : "explore";
    if (feed === "for-you" && !context.session) return null;

    if (deps.sort) {
      return context.queryClient.ensureInfiniteQueryData(
        context.orpc.artworks.list.infiniteOptions({
          input: (cursor: string | undefined) => ({
            cursor,
            limit: 12,
            category: deps.category,
            gallery: deps.gallery,
            style: deps.style,
            sort: deps.sort,
          }),
          initialPageParam: undefined,
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        }),
      );
    }

    return context.queryClient.ensureInfiniteQueryData(
      recommendationListOptions({
        personalized: feed === "for-you",
        discovery: deps.discovery ?? getDefaultDiscovery(feed),
        category: deps.category,
        gallery: deps.gallery,
        style: deps.style,
        limit: 24,
        userId: context.session?.user.id ?? null,
      }),
    );
  },
  head: () => ({
    meta: [
      { title: "Art by John Philip Morgan — Personal Art Discovery" },
      {
        name: "description",
        content:
          "Explore John Philip Morgan's personal catalog of physical art, artists, galleries, and styles.",
      },
      { name: "author", content: "John Philip Morgan" },
      { name: "application-name", content: "Art by John Philip Morgan" },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Art by John Philip Morgan" },
      { property: "og:title", content: "Art by John Philip Morgan" },
      {
        property: "og:description",
        content: "A personal catalog for discovering physical art, artists, galleries, and styles.",
      },
      { property: "og:url", content: "https://art.jpamorgan.com/" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://art.jpamorgan.com/" }],
  }),
  pendingComponent: GalleryPageSkeleton,
  errorComponent: () => (
    <RouteUnavailable title="Art unavailable" message="The gallery could not be loaded." />
  ),
  component: HomeComponent,
});

function HomeComponent() {
  const search = Route.useSearch();
  const routeSession = Route.useRouteContext().session;
  const { data: clientSession, isPending: isSessionPending } = authClient.useSession();
  const session = isSessionPending ? routeSession : clientSession;
  const userId = session?.user.id ?? null;
  const feed = search.feed === "for-you" ? "for-you" : "explore";
  const isPersonalized = feed === "for-you";
  const hasExplicitSort = search.sort !== undefined;
  const queryClient = useQueryClient();

  const recommendations = useInfiniteQuery({
    ...recommendationListOptions({
      personalized: isPersonalized,
      discovery: search.discovery ?? getDefaultDiscovery(feed),
      category: search.category,
      gallery: search.gallery,
      style: search.style,
      limit: 24,
      userId,
    }),
    enabled: !hasExplicitSort && (!isPersonalized || Boolean(session)),
  });
  const catalog = useInfiniteQuery({
    ...orpc.artworks.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        cursor,
        limit: 12,
        category: search.category,
        gallery: search.gallery,
        style: search.style,
        sort: search.sort ?? "recent",
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
    enabled: hasExplicitSort,
  });
  const favoriteIds = useQuery({
    ...orpc.favorites.ids.queryOptions({
      queryKey: scopePrivateQueryKey(orpc.favorites.ids.queryKey(), userId),
    }),
    enabled: isPersonalized && userId !== null,
  });
  const profile = useQuery({
    ...orpc.recommendations.profile.queryOptions({
      queryKey: scopePrivateQueryKey(orpc.recommendations.profile.queryKey(), userId),
    }),
    enabled: isPersonalized && userId !== null,
  });
  const setHidden = useMutation({
    ...orpc.recommendations.setHidden.mutationOptions(),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.recommendations.key() });
    },
  });

  const recommendationItems = recommendations.data?.pages.flatMap((page) => page.items) ?? [];
  const catalogItems = catalog.data?.pages.flatMap((page) => page.items) ?? [];
  const minimumFavoriteCount = profile.data?.minimumFavoriteCount ?? 5;
  const selectedFavoriteIds = favoriteIds.data?.ids ?? [];
  const needsOnboarding =
    isPersonalized &&
    userId !== null &&
    !favoriteIds.isPending &&
    selectedFavoriteIds.length < minimumFavoriteCount;

  if (isPersonalized && !isSessionPending && !session) {
    return <ForYouSignIn />;
  }

  if (needsOnboarding) {
    return (
      <ColdStartPicker
        artworks={recommendationItems.map((item) => item.artwork)}
        favoriteIds={selectedFavoriteIds}
        minimumFavoriteCount={minimumFavoriteCount}
        isLoading={recommendations.isPending}
        isError={recommendations.isError}
        onRetry={() => void recommendations.refetch()}
      />
    );
  }

  const heading = getRecommendationHeading(feed, hasExplicitSort);

  return (
    <section aria-labelledby="feed-heading" className="min-h-[calc(100dvh-3.5rem)]">
      <div className="flex min-w-0 flex-col gap-1 px-3 pt-5 pb-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1
            id="feed-heading"
            className="max-w-[28ch] text-balance text-2xl font-medium tracking-tight"
          >
            {heading}
          </h1>
          <p className="max-w-[62ch] text-pretty text-base text-neutral-600 sm:text-sm">
            {hasExplicitSort
              ? "Recommendation order is off while an explicit sort is selected."
              : isPersonalized
                ? "Shaped by your favorites, with room for discovery."
                : "A non-personalized, adventurous mix from across the catalog."}
          </p>
        </div>
      </div>
      <FeedToolbar feed={feed} search={search} />
      {hasExplicitSort ? (
        <ArtGallery
          items={catalogItems}
          isLoading={catalog.isPending}
          isError={catalog.isError}
          isRetrying={catalog.isFetching}
          errorMessage={catalog.error?.message}
          onRetry={() => void catalog.refetch()}
          hasNextPage={catalog.hasNextPage}
          fetchNextPage={catalog.fetchNextPage}
          isFetchingNextPage={catalog.isFetchingNextPage}
          isFetchNextPageError={catalog.isFetchNextPageError}
        />
      ) : (
        <RecommendationGallery
          recommendations={recommendationItems}
          canHide={Boolean(session)}
          isLoading={recommendations.isPending || (isPersonalized && favoriteIds.isPending)}
          isError={recommendations.isError}
          isRetrying={recommendations.isFetching}
          errorMessage={recommendations.error?.message}
          onRetry={() => void recommendations.refetch()}
          hasNextPage={recommendations.hasNextPage}
          fetchNextPage={recommendations.fetchNextPage}
          isFetchingNextPage={recommendations.isFetchingNextPage}
          isFetchNextPageError={recommendations.isFetchNextPageError}
          onHide={(artworkId) => setHidden.mutateAsync({ artworkId, hidden: true })}
          onUndoHide={(artworkId) => setHidden.mutateAsync({ artworkId, hidden: false })}
          emptyMessage="No recommendations match these filters."
        />
      )}
    </section>
  );
}

function ForYouSignIn() {
  return (
    <section className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="max-w-[20ch] text-balance text-3xl font-medium tracking-tight">
          Make this gallery yours
        </h1>
        <p className="text-pretty text-base text-neutral-600 sm:text-sm">
          Log in and choose a few favorites. Your For You feed will learn from the art you save.
        </p>
        <Link
          to="/login"
          search={{ redirect: "/?feed=for-you" }}
          className="inline-flex min-h-12 items-center rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm lg:min-h-10"
        >
          Log in to personalize
        </Link>
      </div>
    </section>
  );
}
