const AUTH_COOKIE_NAMES = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth.session_data",
  "__Secure-better-auth.session_data",
  "better-auth.dont_remember",
  "__Secure-better-auth.dont_remember",
]);

/**
 * Forward only Better Auth session cookies across the web/API SSR boundary.
 * Unrelated host cookies and request headers must never be copied to the API.
 */
export function getForwardedAuthCookie(requestHeaders: Headers) {
  const cookieHeader = requestHeaders.get("cookie");
  if (!cookieHeader) return null;

  const authCookies = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => {
      const separatorIndex = cookie.indexOf("=");
      return separatorIndex > 0 && AUTH_COOKIE_NAMES.has(cookie.slice(0, separatorIndex));
    });

  return authCookies.length > 0 ? authCookies.join("; ") : null;
}

export function getForwardedAuthHeaders(requestHeaders: Headers): Record<string, string> {
  const cookie = getForwardedAuthCookie(requestHeaders);
  return cookie ? { cookie } : {};
}
