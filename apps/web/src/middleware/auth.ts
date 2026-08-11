import { createMiddleware } from "@tanstack/react-start";

import { authClient } from "@/lib/auth-client";
import { toPublicUserSession } from "@/lib/public-session";
import { getForwardedAuthHeaders } from "@/lib/ssr-auth-cookie";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const session = toPublicUserSession(
    await authClient.getSession({
      fetchOptions: {
        headers: getForwardedAuthHeaders(request.headers),
        throw: true,
      },
    }),
  );
  return next({
    context: { session },
  });
});
