import { createDb } from "@art/db";
import * as schema from "@art/db/schema/auth";
import { env } from "@art/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { authSecurityOptions } from "./security-options";

type Database = ReturnType<typeof createDb>;

export function createAuth(db: Database = createDb()) {
  const security = authSecurityOptions(env);

  return betterAuth({
    appName: "Art",
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    trustedOrigins: security.trustedOrigins,
    emailAndPassword: {
      enabled: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    rateLimit: security.rateLimit,
    advanced: {
      useSecureCookies: security.secureCookies,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: security.ipAddressHeaders,
      },
      defaultCookieAttributes: security.cookieAttributes,
      ...(security.crossSubDomainCookies
        ? { crossSubDomainCookies: security.crossSubDomainCookies }
        : {}),
    },
  });
}
