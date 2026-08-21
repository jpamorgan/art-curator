import type { QueryClient } from "@tanstack/react-query";

import { clearFavoriteFlags, clearPrivateArtQueryState } from "@/lib/private-session";
import { orpc } from "@/utils/orpc";

export function clearPrivateArtCache(queryClient: QueryClient, keepUserId: string | null) {
  clearPrivateArtQueryState(queryClient, orpc.favorites.key(), orpc.artworks.key(), keepUserId);
  queryClient.removeQueries({ queryKey: orpc.following.key() });
  queryClient.removeQueries({ queryKey: orpc.recommendations.key() });
  queryClient.setQueriesData({ queryKey: orpc.artists.key() }, clearFavoriteFlags);
  queryClient.setQueriesData({ queryKey: orpc.galleries.key() }, clearFavoriteFlags);
  queryClient.setQueriesData({ queryKey: orpc.styles.key() }, clearFavoriteFlags);
}
