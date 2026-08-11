export type AuthRuntimeEnvironment = {
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
};

export function authSecurityOptions(environment: AuthRuntimeEnvironment) {
  const apiOrigin = new URL(environment.BETTER_AUTH_URL).origin;
  const webOrigin = new URL(environment.CORS_ORIGIN).origin;
  const secureCookies = new URL(apiOrigin).protocol === "https:";
  const sharesProductionParent =
    new URL(apiOrigin).hostname === "api.art.jpamorgan.com" &&
    new URL(webOrigin).hostname === "art.jpamorgan.com";

  return {
    secureCookies,
    trustedOrigins: [...new Set([webOrigin, apiOrigin])],
    rateLimit: {
      enabled: true,
      storage: "database" as const,
      window: 60,
      max: 100,
      customRules: {
        "/get-session": false as const,
      },
    },
    ipAddressHeaders: ["cf-connecting-ip"],
    cookieAttributes: {
      sameSite: "lax" as const,
      secure: secureCookies,
      httpOnly: true,
    },
    crossSubDomainCookies:
      secureCookies && sharesProductionParent
        ? ({ enabled: true, domain: ".art.jpamorgan.com" } as const)
        : null,
  };
}
