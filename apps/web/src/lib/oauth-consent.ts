export const OAUTH_SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: "Confirm your Art account identity.",
  profile: "Read your display name and profile image.",
  email: "Read your email address and verification status.",
  offline_access: "Refresh access without asking you to sign in again.",
  "art:read": "Browse the public art catalog through the agent API.",
};

export function isValidOAuthConsentRequest(input: {
  clientId?: string;
  redirectUri?: string;
  scopes: readonly string[];
  clientResolved: boolean;
}) {
  return Boolean(
    input.clientId &&
    input.redirectUri &&
    input.clientResolved &&
    input.scopes.length > 0 &&
    input.scopes.every((scope) => scope in OAUTH_SCOPE_DESCRIPTIONS),
  );
}
