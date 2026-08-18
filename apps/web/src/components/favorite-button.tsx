import { cn } from "@art/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PendingButtonLabel } from "@/components/pending-button-label";
import { authClient } from "@/lib/auth-client";
import { isUnauthorizedError } from "@/lib/orpc-error";
import { clearPrivateArtCache } from "@/lib/private-art-cache";
import { scopePrivateQueryKey } from "@/lib/private-session";
import { getSafeReturnTo } from "@/lib/safe-return-to";
import { orpc } from "@/utils/orpc";

type FavoriteButtonProps = {
  artworkId: string;
  initialIsFavorite?: boolean;
  returnTo?: string;
  showLabel?: boolean;
  className?: string;
};

type FavoriteIdsData = { ids: string[] };

export default function FavoriteButton({
  artworkId,
  initialIsFavorite = false,
  returnTo,
  showLabel = false,
  className,
}: FavoriteButtonProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: session,
    isPending: isSessionPending,
    refetch: refetchSession,
  } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const favoriteIdsQueryKey = scopePrivateQueryKey(orpc.favorites.ids.queryKey(), userId);
  const favoriteIdsOptions = orpc.favorites.ids.queryOptions({
    queryKey: favoriteIdsQueryKey,
    enabled: !isSessionPending && userId !== null,
    retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 2,
  });
  const favoriteIdsQuery = useQuery(favoriteIdsOptions);
  const [localFavoriteState, setLocalFavoriteState] = useState<{
    artworkId: string;
    isFavorite: boolean;
    userId: string | null;
  } | null>(null);
  const localIsFavorite =
    localFavoriteState?.artworkId === artworkId && localFavoriteState.userId === userId
      ? localFavoriteState.isFavorite
      : null;
  const isFavorite =
    !isSessionPending && userId === null
      ? false
      : favoriteIdsQuery.data
        ? favoriteIdsQuery.data.ids.includes(artworkId)
        : (localIsFavorite ?? initialIsFavorite);
  const toggleFavorite = useMutation({
    ...orpc.favorites.toggle.mutationOptions(),
    onMutate: async ({ artworkId: targetArtworkId }) => {
      await queryClient.cancelQueries({ queryKey: favoriteIdsOptions.queryKey, exact: true });
      const previous = queryClient.getQueryData<FavoriteIdsData>(favoriteIdsOptions.queryKey);
      const previousLocal = localFavoriteState;

      setLocalFavoriteState({
        artworkId: targetArtworkId,
        isFavorite: !isFavorite,
        userId,
      });

      queryClient.setQueryData<FavoriteIdsData>(favoriteIdsOptions.queryKey, (current) => {
        if (!current) return current;
        const ids = current.ids.includes(targetArtworkId)
          ? current.ids.filter((id) => id !== targetArtworkId)
          : [...current.ids, targetArtworkId];
        return { ids };
      });

      return { previous, previousLocal, queryKey: favoriteIdsOptions.queryKey, userId };
    },
    onSuccess: (result, _input, mutationState) => {
      if (mutationState.userId === null || mutationState.userId !== currentUserId.current) return;

      setLocalFavoriteState({
        artworkId: result.artworkId,
        isFavorite: result.isFavorite,
        userId: mutationState.userId,
      });

      queryClient.setQueryData<FavoriteIdsData>(mutationState.queryKey, (current) => {
        if (!current) return current;
        const withoutArtwork = current.ids.filter((id) => id !== result.artworkId);
        return {
          ids: result.isFavorite ? [...withoutArtwork, result.artworkId] : withoutArtwork,
        };
      });
    },
    onError: (error, _input, mutationState) => {
      if (!mutationState || mutationState.userId !== currentUserId.current) return;

      setLocalFavoriteState(mutationState.previousLocal);

      if (mutationState.previous) {
        queryClient.setQueryData<FavoriteIdsData>(mutationState.queryKey, mutationState.previous);
      }

      if (isUnauthorizedError(error)) {
        clearPrivateArtCache(queryClient, null);
        void refetchSession().catch(() => undefined);

        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        void navigate({
          to: "/login",
          search: { redirect: getSafeReturnTo(returnTo ?? currentPath) },
        });
        return;
      }

      toast.error("Could not update favorites.");
    },
    onSettled: (_data, error, _input, mutationState) => {
      if (
        isUnauthorizedError(error) ||
        !mutationState ||
        mutationState.userId !== currentUserId.current
      ) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: orpc.favorites.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.artworks.key() });
    },
  });

  const isFavoriteTruthPending =
    isSessionPending || (userId !== null && favoriteIdsQuery.isPending);
  const isUpdating = toggleFavorite.isPending;

  const label = isUpdating
    ? "Updating favorites"
    : isFavorite
      ? "Remove from favorites"
      : "Save to favorites";
  const iconTransition =
    "absolute inset-0 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isFavorite}
      aria-busy={isUpdating}
      disabled={isFavoriteTruthPending || isUpdating}
      className={cn(
        "relative inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 bg-white/95 text-neutral-950 shadow-sm ring-1 ring-black/10 backdrop-blur-sm transition-transform duration-150 ease-out outline-none active:not-disabled:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait sm:pointer-fine:h-10 sm:pointer-fine:min-w-10",
        !showLabel && "w-12 rounded-full sm:pointer-fine:w-10",
        showLabel && "w-auto rounded-lg px-3.5 text-base font-medium sm:text-sm",
        className,
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();

        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const loginReturnTo = getSafeReturnTo(returnTo ?? currentPath);

        if (userId === null) {
          void navigate({
            to: "/login",
            search: { redirect: loginReturnTo },
          });
          return;
        }

        toggleFavorite.mutate({ artworkId });
      }}
    >
      <span className="relative size-4 shrink-0" aria-hidden="true">
        <Bookmark
          className={cn(
            "size-4 stroke-neutral-950",
            iconTransition,
            isFavorite ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
          )}
        />
        <Bookmark
          className={cn(
            "size-4 fill-neutral-950 stroke-neutral-950",
            iconTransition,
            isFavorite ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
          )}
        />
      </span>
      {showLabel ? (
        <PendingButtonLabel
          idle={isFavorite ? "Saved" : "Save"}
          pending="Updating…"
          isPending={isUpdating}
        />
      ) : null}
    </button>
  );
}
