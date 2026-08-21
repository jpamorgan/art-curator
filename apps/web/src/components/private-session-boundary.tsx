import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { getGlobalBroadcastChannel } from "better-auth/client";
import { useEffect, useRef } from "react";

import { authClient } from "@/lib/auth-client";
import { handleCrossTabSignout, isSignoutBroadcast } from "@/lib/cross-tab-signout";
import { clearPrivateArtCache } from "@/lib/private-art-cache";
import {
  isPrivateArtPath,
  shouldClearPrivateArtData,
  type ResolvedUserId,
} from "@/lib/private-session";

export default function PrivateSessionBoundary() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session, isPending, refetch: refetchSession } = authClient.useSession();
  const previousUserId = useRef<ResolvedUserId | undefined>(undefined);

  useEffect(() => {
    return getGlobalBroadcastChannel().subscribe((message) => {
      if (!isSignoutBroadcast(message)) return;

      void handleCrossTabSignout({
        pathname: location.pathname,
        clearPrivateArt: () => clearPrivateArtCache(queryClient, null),
        redirectToLogin: () => {
          void navigate({
            to: "/login",
            search: { redirect: "/favorites" },
            replace: true,
          });
        },
        refetchSession,
      });
    });
  }, [location.pathname, navigate, queryClient, refetchSession]);

  useEffect(() => {
    if (isPending) return;

    const nextUserId = session?.user.id ?? null;
    if (shouldClearPrivateArtData(previousUserId.current, nextUserId)) {
      clearPrivateArtCache(queryClient, nextUserId);
    }
    previousUserId.current = nextUserId;

    if (nextUserId === null && isPrivateArtPath(location.pathname)) {
      void navigate({
        to: "/login",
        search: { redirect: location.pathname === "/following" ? "/following" : "/favorites" },
        replace: true,
      });
    }
  }, [isPending, location.pathname, navigate, queryClient, session?.user.id]);

  return null;
}
