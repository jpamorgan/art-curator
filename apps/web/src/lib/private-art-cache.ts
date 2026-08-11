import type { QueryClient } from "@tanstack/react-query";

import { clearPrivateArtQueryState } from "@/lib/private-session";
import { orpc } from "@/utils/orpc";

export function clearPrivateArtCache(queryClient: QueryClient, keepUserId: string | null) {
  clearPrivateArtQueryState(queryClient, orpc.favorites.key(), orpc.artworks.key(), keepUserId);
}
