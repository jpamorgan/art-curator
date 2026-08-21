import { isPrivateArtPath } from "@/lib/private-session";

type SessionBroadcastMessage = {
  event?: string;
  data?: { trigger?: string };
};

type CrossTabSignoutActions = {
  pathname: string;
  clearPrivateArt: () => void;
  redirectToLogin: () => void;
  refetchSession: () => Promise<unknown>;
};

export function isSignoutBroadcast(message: SessionBroadcastMessage) {
  return message.event === "session" && message.data?.trigger === "signout";
}

export async function handleCrossTabSignout({
  pathname,
  clearPrivateArt,
  redirectToLogin,
  refetchSession,
}: CrossTabSignoutActions) {
  clearPrivateArt();
  if (isPrivateArtPath(pathname)) redirectToLogin();

  try {
    await refetchSession();
  } catch {
    // The broadcast itself is authoritative enough to revoke private client state.
  }
}
