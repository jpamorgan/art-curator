import { afterEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as schema from "@art/db/schema/auth";
import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { getAgentOAuthProviderOptions, getAgentOAuthUrls } from "./oauth-options";
import {
  handleAgentCatalogRequest,
  handleAgentOAuthRevocationRequest,
  handleOAuthUserInfoRequest,
} from "../../../apps/server/src/agent-auth";

const environment = {
  BETTER_AUTH_URL: "http://localhost:3000",
  CORS_ORIGIN: "http://localhost:3001",
};

mock.module("cloudflare:workers", () => ({
  env: {
    BETTER_AUTH_URL: environment.BETTER_AUTH_URL,
    CORS_ORIGIN: environment.CORS_ORIGIN,
    BETTER_AUTH_SECRET: "oauth-integration-test-secret-at-least-32-characters",
  },
}));
const {
  AgentAccessTokenError,
  recordAgentAccessTokenRevocationWithDatabase,
  verifyAgentAccessTokenWithDatabase,
  verifyOAuthAccessTokenNotRevokedWithDatabase,
} = await import("./index");
const oauthMigration = await Bun.file(
  new URL("../../db/src/migrations/0011_mysterious_black_tom.sql", import.meta.url),
).text();
const revocationMigration = await Bun.file(
  new URL("../../db/src/migrations/0012_omniscient_tyger_tiger.sql", import.meta.url),
).text();
const databases = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function oauthFixture() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
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
  sqlite.exec(oauthMigration);
  sqlite.exec(revocationMigration);

  const urls = getAgentOAuthUrls(environment);
  const database = drizzle(sqlite, { schema });
  const auth = betterAuth({
    appName: "Art OAuth integration test",
    database: drizzleAdapter(database, { provider: "sqlite", schema }),
    baseURL: environment.BETTER_AUTH_URL,
    secret: "oauth-integration-test-secret-at-least-32-characters",
    trustedOrigins: [environment.CORS_ORIGIN, environment.BETTER_AUTH_URL],
    emailAndPassword: { enabled: true },
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwt: {
          issuer: urls.authorizationServer,
          audience: urls.protectedResource,
        },
      }),
      oauthProvider(getAgentOAuthProviderOptions(environment)),
    ],
  });
  return { auth, database, sqlite, urls };
}

function postJson(auth, path, body, { cookie, origin = environment.CORS_ORIGIN } = {}) {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "CF-Connecting-IP": "203.0.113.42",
  });
  if (origin) headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  return auth.handler(
    new Request(`${environment.BETTER_AUTH_URL}/api/auth/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function postForm(auth, path, body) {
  return auth.handler(
    new Request(`${environment.BETTER_AUTH_URL}/api/auth/${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": "203.0.113.42",
      },
      body: new URLSearchParams(body),
    }),
  );
}

async function redirectTarget(response) {
  const location = response.headers.get("location");
  if (location) return location;
  const body = await response.clone().json();
  return body.url ?? body.redirect_uri;
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /(?:^|,\s*)([^=;,\s]*session_token)=([^;,\s]+)/iu.exec(setCookie);
  if (!match) throw new Error(`Session cookie missing from ${setCookie}`);
  return `${match[1]}=${match[2]}`;
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

describe("OAuth 2.1 agent authorization flow", () => {
  test("registers a public client, authorizes with PKCE, verifies the JWT, refreshes, and revokes", async () => {
    const { auth, database, sqlite, urls } = oauthFixture();
    const redirectUri = "http://127.0.0.1:49152/callback";

    const serverMetadataResponse = await oauthProviderAuthServerMetadata(auth)(
      new Request(`${urls.authorizationServer}/.well-known/oauth-authorization-server`),
    );
    const serverMetadata = await serverMetadataResponse.json();
    expect(serverMetadata).toMatchObject({
      issuer: urls.authorizationServer,
      authorization_endpoint: `${urls.authBaseUrl}/oauth2/authorize`,
      token_endpoint: `${urls.authBaseUrl}/oauth2/token`,
      registration_endpoint: `${urls.authBaseUrl}/oauth2/register`,
      revocation_endpoint: `${urls.authBaseUrl}/oauth2/revoke`,
      code_challenge_methods_supported: ["S256"],
    });
    expect(serverMetadata.grant_types_supported).toEqual(
      expect.arrayContaining(["authorization_code", "refresh_token"]),
    );
    expect(serverMetadata.scopes_supported).toContain("art:read");

    const openIdResponse = await oauthProviderOpenIdConfigMetadata(auth)(
      new Request(`${urls.authorizationServer}/.well-known/openid-configuration`),
    );
    expect(await openIdResponse.json()).toMatchObject({
      issuer: urls.authorizationServer,
      jwks_uri: `${urls.authBaseUrl}/jwks`,
      userinfo_endpoint: `${urls.authBaseUrl}/oauth2/userinfo`,
    });

    const registration = await postJson(
      auth,
      "oauth2/register",
      {
        client_name: "Agent integration test",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        type: "native",
        scope: "openid profile email offline_access art:read",
      },
      { origin: undefined },
    );
    expect(registration.status).toBe(200);
    const client = await registration.json();
    expect(client).toMatchObject({
      client_name: "Agent integration test",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      type: "native",
    });
    expect(client.client_id).toBeString();
    expect(client.client_secret).toBeUndefined();

    const verifier = "oauth-agent-pkce-verifier-that-is-long-enough-0123456789";
    const authorizeUrl = new URL(`${urls.authBaseUrl}/oauth2/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: redirectUri,
      scope: "openid profile email offline_access art:read",
      state: "state-123",
      nonce: "nonce-123",
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
    }).toString();
    const authorize = await auth.handler(
      new Request(authorizeUrl, {
        headers: { Accept: "application/json", "CF-Connecting-IP": "203.0.113.42" },
      }),
    );
    expect(authorize.status).toBe(200);
    const loginUrl = new URL(await redirectTarget(authorize));
    expect(loginUrl.origin + loginUrl.pathname).toBe("http://localhost:3001/login");
    expect(loginUrl.searchParams.get("sig")).toBeTruthy();

    const signUp = await postJson(auth, "sign-up/email", {
      name: "OAuth Agent User",
      email: "oauth-agent@example.com",
      password: "correct-horse-battery-staple",
      oauth_query: loginUrl.searchParams.toString(),
    });
    expect(signUp.status).toBe(200);
    const cookie = sessionCookie(signUp);
    const consentUrl = new URL(await redirectTarget(signUp));
    expect(consentUrl.origin + consentUrl.pathname).toBe("http://localhost:3001/oauth/consent");
    expect(consentUrl.searchParams.get("sig")).toBeTruthy();

    const consent = await postJson(
      auth,
      "oauth2/consent",
      {
        accept: true,
        oauth_query: consentUrl.searchParams.toString(),
      },
      { cookie },
    );
    expect(consent.status).toBe(200);
    const callback = new URL(await redirectTarget(consent));
    expect(callback.origin + callback.pathname).toBe(redirectUri);
    expect(callback.searchParams.get("state")).toBe("state-123");
    expect(callback.searchParams.get("iss")).toBe(urls.authorizationServer);
    const code = callback.searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenResponse = await postForm(auth, "oauth2/token", {
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: urls.protectedResource,
    });
    expect(tokenResponse.status).toBe(200);
    const token = await tokenResponse.json();
    expect(token).toMatchObject({
      token_type: "Bearer",
      scope: "openid profile email offline_access art:read",
    });
    expect(token.access_token.split(".")).toHaveLength(3);
    expect(token.refresh_token).toBeString();

    const jwksResponse = await auth.handler(new Request(`${urls.authBaseUrl}/jwks`));
    expect(jwksResponse.status).toBe(200);
    const jwks = await jwksResponse.json();
    const claims = await verifyJwsAccessToken(token.access_token, {
      jwksFetch: async () => jwks,
      verifyOptions: {
        issuer: urls.authorizationServer,
        audience: urls.protectedResource,
      },
    });
    expect(claims).toMatchObject({
      iss: urls.authorizationServer,
      aud: [urls.protectedResource, `${urls.authBaseUrl}/oauth2/userinfo`],
      azp: client.client_id,
      client_id: client.client_id,
      scope: "openid profile email offline_access art:read",
    });

    const userInfoResponse = await auth.handler(
      new Request(`${urls.authBaseUrl}/oauth2/userinfo`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }),
    );
    expect(userInfoResponse.status).toBe(200);
    expect(await userInfoResponse.json()).toMatchObject({
      sub: claims.sub,
      email: "oauth-agent@example.com",
    });

    const refreshedResponse = await postForm(auth, "oauth2/token", {
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: token.refresh_token,
      resource: urls.protectedResource,
    });
    expect(refreshedResponse.status).toBe(200);
    const refreshed = await refreshedResponse.json();
    expect(refreshed.access_token).toBeString();
    expect(refreshed.refresh_token).toBeString();

    expect(
      await verifyAgentAccessTokenWithDatabase(refreshed.access_token, database, environment, () =>
        auth.api.getJwks(),
      ),
    ).toMatchObject({ azp: client.client_id, scope: expect.stringContaining("art:read") });
    const accessRevocationRequest = new Request(`${urls.authBaseUrl}/oauth2/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        token: refreshed.access_token,
        token_type_hint: "access_token",
      }),
    });
    const revokeAccess = await handleAgentOAuthRevocationRequest(accessRevocationRequest, {
      revoke: (request) => auth.handler(request),
      recordAccessTokenRevocation: (accessToken, clientId) =>
        recordAgentAccessTokenRevocationWithDatabase(
          accessToken,
          clientId,
          database,
          environment,
          () => auth.api.getJwks(),
        ),
    });
    expect(revokeAccess.status).toBe(200);
    await expect(
      verifyAgentAccessTokenWithDatabase(refreshed.access_token, database, environment, () =>
        auth.api.getJwks(),
      ),
    ).rejects.toMatchObject({
      name: AgentAccessTokenError.name,
      code: "invalid_token",
    });
    const protectedCatalog = await handleAgentCatalogRequest(
      new Request("http://localhost:3000/agent/catalog", {
        headers: { Authorization: `Bearer ${refreshed.access_token}` },
      }),
      {
        environment,
        verifyAccessToken: (accessToken) =>
          verifyAgentAccessTokenWithDatabase(accessToken, database, environment, () =>
            auth.api.getJwks(),
          ),
        browseArt: async () => ({ items: [], nextCursor: null }),
      },
    );
    expect(protectedCatalog.status).toBe(401);
    expect(protectedCatalog.headers.get("www-authenticate")).toContain('error="invalid_token"');
    const userInfoAfterRevocation = await handleOAuthUserInfoRequest(
      new Request(`${urls.authBaseUrl}/oauth2/userinfo`, {
        headers: { Authorization: `Bearer ${refreshed.access_token}` },
      }),
      {
        verifyAccessTokenNotRevoked: (accessToken) =>
          verifyOAuthAccessTokenNotRevokedWithDatabase(accessToken, database, environment, () =>
            auth.api.getJwks(),
          ),
        userInfo: (request) => auth.handler(request),
      },
    );
    expect(userInfoAfterRevocation.status).toBe(401);

    const revoke = await postForm(auth, "oauth2/revoke", {
      client_id: client.client_id,
      token: refreshed.refresh_token,
      token_type_hint: "refresh_token",
    });
    expect(revoke.status).toBe(200);
    expect(
      sqlite
        .query("SELECT count(*) AS count FROM oauth_refresh_token WHERE revoked IS NOT NULL")
        .get().count,
    ).toBe(2);

    const reuse = await postForm(auth, "oauth2/token", {
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: refreshed.refresh_token,
      resource: urls.protectedResource,
    });
    expect(reuse.status).toBe(400);
    expect(await reuse.json()).toMatchObject({ error: "invalid_grant" });
  });
});
