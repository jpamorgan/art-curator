import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as schema from "@art/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { authSecurityOptions } from "./security-options";

const databases = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function authFixture(
  environment = {
    BETTER_AUTH_URL: "http://localhost:3000",
    CORS_ORIGIN: "http://localhost:3001",
  },
) {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE user (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      email_verified integer DEFAULT false NOT NULL,
      image text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE UNIQUE INDEX user_email_unique ON user (email);
    CREATE TABLE session (
      id text PRIMARY KEY NOT NULL,
      expires_at integer NOT NULL,
      token text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      ip_address text,
      user_agent text,
      user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX session_token_unique ON session (token);
    CREATE INDEX session_userId_idx ON session (user_id);
    CREATE TABLE account (
      id text PRIMARY KEY NOT NULL,
      account_id text NOT NULL,
      provider_id text NOT NULL,
      user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      access_token text,
      refresh_token text,
      id_token text,
      access_token_expires_at integer,
      refresh_token_expires_at integer,
      scope text,
      password text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE INDEX account_userId_idx ON account (user_id);
    CREATE TABLE verification (
      id text PRIMARY KEY NOT NULL,
      identifier text NOT NULL,
      value text NOT NULL,
      expires_at integer NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE INDEX verification_identifier_idx ON verification (identifier);
    CREATE TABLE rate_limit (
      id text PRIMARY KEY NOT NULL,
      key text NOT NULL,
      count integer NOT NULL,
      last_request integer NOT NULL
    );
    CREATE UNIQUE INDEX rate_limit_key_unique ON rate_limit (key);
  `);

  const database = drizzle(sqlite, { schema });
  const security = authSecurityOptions(environment);
  const auth = betterAuth({
    appName: "Art test",
    database: drizzleAdapter(database, { provider: "sqlite", schema }),
    baseURL: environment.BETTER_AUTH_URL,
    secret: "integration-test-secret-that-is-at-least-32-characters",
    trustedOrigins: security.trustedOrigins,
    emailAndPassword: { enabled: true },
    rateLimit: security.rateLimit,
    advanced: {
      useSecureCookies: security.secureCookies,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: security.ipAddressHeaders },
      defaultCookieAttributes: security.cookieAttributes,
      ...(security.crossSubDomainCookies
        ? { crossSubDomainCookies: security.crossSubDomainCookies }
        : {}),
    },
  });

  return { auth, sqlite };
}

function authRequest(path, body) {
  return new Request(`http://localhost:3000/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3001",
      "CF-Connecting-IP": "203.0.113.24",
    },
    body: JSON.stringify(body),
  });
}

describe("Better Auth database integration", () => {
  test("signs up and signs in with Lax cookies and database rate-limit rows", async () => {
    const { auth, sqlite } = authFixture();
    const credentials = {
      email: "curator@example.com",
      password: "correct-horse-battery-staple",
    };

    const signUp = await auth.handler(
      authRequest("sign-up/email", { ...credentials, name: "Curator" }),
    );
    expect(signUp.status).toBe(200);
    const signUpCookie = signUp.headers.get("set-cookie") ?? "";
    expect(signUpCookie).toMatch(/SameSite=Lax/i);
    expect(signUpCookie).not.toMatch(/Domain=/i);
    expect(signUpCookie).not.toMatch(/;\s*Secure(?:;|$)/i);
    expect((await signUp.json()).user.email).toBe(credentials.email);

    const signIn = await auth.handler(authRequest("sign-in/email", credentials));
    expect(signIn.status).toBe(200);
    expect(signIn.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
    expect((await signIn.json()).user.email).toBe(credentials.email);

    const rateLimits = sqlite
      .query("SELECT key, count, last_request FROM rate_limit ORDER BY key")
      .all();
    expect(rateLimits).toHaveLength(2);
    expect(rateLimits.every(({ key }) => key.startsWith("203.0.113.24|/sign-"))).toBe(true);
    expect(rateLimits.every(({ count, last_request }) => count === 1 && last_request > 0)).toBe(
      true,
    );
  });
});

describe("Better Auth production cookies", () => {
  test("shares secure session cookies only across the art.jpamorgan.com parent", async () => {
    const { auth } = authFixture({
      BETTER_AUTH_URL: "https://api.art.jpamorgan.com",
      CORS_ORIGIN: "https://art.jpamorgan.com",
    });
    const response = await auth.handler(
      new Request("https://api.art.jpamorgan.com/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://art.jpamorgan.com",
          "CF-Connecting-IP": "203.0.113.25",
        },
        body: JSON.stringify({
          email: "production-curator@example.com",
          password: "correct-horse-battery-staple",
          name: "Production Curator",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/Domain=\.?art\.jpamorgan\.com/i);
    expect(cookie).not.toMatch(/Domain=\.?jpamorgan\.com(?:;|$)/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});
