import { describe, expect, test } from "bun:test";

import { authSecurityOptions } from "./security-options";

describe("Better Auth security options", () => {
  test("uses only exact production origins and SameSite=Lax secure cookies", () => {
    const options = authSecurityOptions({
      BETTER_AUTH_URL: "https://api.art.jpamorgan.com",
      CORS_ORIGIN: "https://art.jpamorgan.com",
    });

    expect(options.trustedOrigins).toEqual([
      "https://art.jpamorgan.com",
      "https://api.art.jpamorgan.com",
    ]);
    expect(options.trustedOrigins.some((origin) => origin.includes("localhost"))).toBe(false);
    expect(options.secureCookies).toBe(true);
    expect(options.cookieAttributes).toEqual({
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    });
    expect(options.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: ".art.jpamorgan.com",
    });
    expect(options.ipAddressHeaders).toEqual(["cf-connecting-ip"]);
    expect(options.rateLimit).toEqual({
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/get-session": false,
      },
    });
  });

  test("derives the exact local pair without weakening the cookie site policy", () => {
    const options = authSecurityOptions({
      BETTER_AUTH_URL: "http://localhost:3000/api/auth",
      CORS_ORIGIN: "http://localhost:3001/some-path",
    });

    expect(options.trustedOrigins).toEqual(["http://localhost:3001", "http://localhost:3000"]);
    expect(options.cookieAttributes.sameSite).toBe("lax");
    expect(options.cookieAttributes.secure).toBe(false);
    expect(options.crossSubDomainCookies).toBeNull();
  });
});
