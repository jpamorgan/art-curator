import type { AuthSession } from "@/lib/auth-client";

export type PublicUserSession = {
  user: Pick<AuthSession["user"], "id" | "name" | "email">;
};

/** Keep Better Auth's session internals out of server-function and router dehydration payloads. */
export function toPublicUserSession(session: AuthSession | null): PublicUserSession | null {
  if (!session) return null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
  };
}
