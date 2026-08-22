import { getSafeReturnTo } from "@/lib/safe-return-to";

type AuthActionResult = {
  data?: unknown;
  error?: { message?: string } | null;
};

function hasOAuthRedirect(data: unknown): data is { redirect: true; url: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "redirect" in data &&
    data.redirect === true &&
    "url" in data &&
    typeof data.url === "string" &&
    data.url.length > 0
  );
}

type InternalNavigate = (options: {
  to: string;
  replace: true;
  reloadDocument?: true;
}) => Promise<unknown>;

const SESSION_CONFIRMATION_DELAYS_MS = [0, 80, 160, 320, 640, 1280, 1280] as const;

export async function confirmAuthenticatedSession(
  readSession: () => Promise<boolean>,
  delays: readonly number[] = SESSION_CONFIRMATION_DELAYS_MS,
): Promise<boolean> {
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      if (await readSession()) return true;
    } catch {
      // A transient read is retried within the same bounded confirmation window.
    }
  }
  return false;
}

export async function authenticateAndNavigate({
  authenticate,
  confirmSession,
  fallbackError,
  navigate,
  returnTo,
}: {
  authenticate: () => Promise<AuthActionResult>;
  confirmSession: () => Promise<boolean>;
  fallbackError: string;
  navigate: InternalNavigate;
  returnTo: string;
}): Promise<string | null> {
  let result: AuthActionResult;
  try {
    result = await authenticate();
  } catch {
    return fallbackError;
  }
  if (result.error) return result.error.message || fallbackError;
  // Better Auth's OAuth provider has already validated this redirect and its
  // client hook owns the top-level navigation. Do not race it with an internal
  // post-login navigation.
  if (hasOAuthRedirect(result.data)) return null;

  if (!(await confirmSession())) {
    return "Signed in, but your session is taking longer than expected. Try again.";
  }

  await navigate({
    to: getSafeReturnTo(returnTo),
    replace: true,
    reloadDocument: true,
  });
  return null;
}

export async function signOutAndNavigate({
  clearPrivateArt,
  navigate,
  signOut,
}: {
  clearPrivateArt: () => void;
  navigate: InternalNavigate;
  signOut: () => Promise<AuthActionResult>;
}): Promise<string | null> {
  let result: AuthActionResult;
  try {
    result = await signOut();
  } catch {
    return "Could not log out.";
  }
  if (result.error) return result.error.message || "Could not log out.";

  clearPrivateArt();
  await navigate({ to: "/", replace: true, reloadDocument: true });
  return null;
}
