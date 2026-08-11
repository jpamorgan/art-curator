import { cn } from "@art/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

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
  const toggleFavorite = useMutation({
    ...orpc.favorites.toggle.mutationOptions(),
    onMutate: async ({ artworkId: targetArtworkId }) => {
      await queryClient.cancelQueries({ queryKey: favoriteIdsOptions.queryKey, exact: true });
      const previous = queryClient.getQueryData<FavoriteIdsData>(favoriteIdsOptions.queryKey);

      queryClient.setQueryData<FavoriteIdsData>(favoriteIdsOptions.queryKey, (current) => {
        if (!current) return current;
        const ids = current.ids.includes(targetArtworkId)
          ? current.ids.filter((id) => id !== targetArtworkId)
          : [...current.ids, targetArtworkId];
        return { ids };
      });

      return { previous, queryKey: favoriteIdsOptions.queryKey, userId };
    },
    onSuccess: (result, _input, mutationState) => {
      if (mutationState.userId === null || mutationState.userId !== currentUserId.current) return;

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

  const isFavorite = favoriteIdsQuery.data
    ? favoriteIdsQuery.data.ids.includes(artworkId)
    : isSessionPending
      ? initialIsFavorite
      : false;
  const isFavoriteTruthPending =
    isSessionPending || (userId !== null && !favoriteIdsQuery.isSuccess);

  const label = isFavorite ? "Remove from favorites" : "Save to favorites";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isFavorite}
      disabled={isFavoriteTruthPending || toggleFavorite.isPending}
      className={cn(
        "relative inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white/95 text-neutral-950 shadow-sm ring-1 ring-black/10 backdrop-blur-sm transition-transform duration-150 outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:opacity-60 sm:pointer-fine:h-10 sm:pointer-fine:min-w-10",
        !showLabel && "w-12 sm:pointer-fine:w-10",
        showLabel && "w-auto px-3 text-base font-medium sm:text-sm",
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
      <Bookmark
        className={cn("size-4 shrink-0 stroke-neutral-950", isFavorite && "fill-neutral-950")}
        aria-hidden="true"
      />
      {showLabel && <span>{isFavorite ? "Saved" : "Save"}</span>}
    </button>
  );
}
