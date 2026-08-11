import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { ArtGallery } from "@/components/art-gallery";
import { GalleryPageSkeleton } from "@/components/gallery-skeleton";
import { RouteUnavailable } from "@/components/route-unavailable";
import { authClient } from "@/lib/auth-client";
import { isUnauthorizedError } from "@/lib/orpc-error";
import { clearPrivateArtCache } from "@/lib/private-art-cache";
import { scopePrivateQueryKey } from "@/lib/private-session";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/favorites")({
  loader: ({ context }) => {
    const queryKey = scopePrivateQueryKey(
      context.orpc.favorites.list.infiniteKey({
        input: getFavoritesListInput,
        initialPageParam: null,
      }),
      context.session.user.id,
    );

    return context.queryClient.ensureInfiniteQueryData(
      context.orpc.favorites.list.infiniteOptions({
        input: getFavoritesListInput,
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        queryKey,
      }),
    );
  },
  head: () => ({
    meta: [{ title: "Favorites — Art" }, { name: "description", content: "Your saved art." }],
  }),
  pendingComponent: GalleryPageSkeleton,
  errorComponent: () => (
    <RouteUnavailable title="Favorites unavailable" message="Your saved art could not be loaded." />
  ),
  component: FavoritesPage,
});

function getFavoritesListInput(cursor: string | null) {
  return { cursor: cursor ?? undefined, limit: 30 };
}

function FavoritesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routeSession = Route.useRouteContext().session;
  const {
    data: session,
    isPending: isSessionPending,
    refetch: refetchSession,
  } = authClient.useSession();
  const userId = session?.user.id ?? (isSessionPending ? routeSession.user.id : null);
  const isWaitingForSession = isSessionPending && !routeSession;
  const handledUnauthorized = useRef(false);
  const favoritesListQueryKey = scopePrivateQueryKey(
    orpc.favorites.list.infiniteKey({
      input: getFavoritesListInput,
      initialPageParam: null,
    }),
    userId,
  );
  const favorites = useInfiniteQuery(
    orpc.favorites.list.infiniteOptions({
      input: getFavoritesListInput,
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      queryKey: favoritesListQueryKey,
      enabled: !isWaitingForSession && userId !== null,
      retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 2,
    }),
  );

  const isUnauthorized = isUnauthorizedError(favorites.error);
  const items =
    isUnauthorized || isWaitingForSession || userId === null
      ? []
      : (favorites.data?.pages.flatMap((page) => page.items) ?? []);
  const favoriteIds = items.map((item) => item.id);

  useEffect(() => {
    if (!isUnauthorized || handledUnauthorized.current) return;
    handledUnauthorized.current = true;

    clearPrivateArtCache(queryClient, null);
    void refetchSession().catch(() => undefined);
    void navigate({
      to: "/login",
      search: { redirect: "/favorites" },
      replace: true,
    });
  }, [isUnauthorized, navigate, queryClient, refetchSession]);

  return (
    <div className="isolate min-h-[calc(100dvh-4rem)] bg-white text-neutral-950">
      <h1 className="sr-only">Favorites</h1>
      <ArtGallery
        items={items}
        favoriteIds={favoriteIds}
        isLoading={favorites.isPending || isUnauthorized || isWaitingForSession || userId === null}
        isError={favorites.isError && !isUnauthorized}
        isRetrying={favorites.isFetching}
        errorMessage="Could not load favorites."
        onRetry={() => favorites.refetch()}
        hasNextPage={favorites.hasNextPage}
        fetchNextPage={favorites.fetchNextPage}
        isFetchingNextPage={favorites.isFetchingNextPage}
        isFetchNextPageError={favorites.isFetchNextPageError && !isUnauthorized}
        emptyMessage="Nothing saved yet"
      />
    </div>
  );
}
