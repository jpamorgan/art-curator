import { createDb } from "@art/db";
import { and, eq, gt, lt } from "@art/db/query";
import * as schema from "@art/db/schema/auth";
import { env } from "@art/env/server";
import {
  oauthProvider,
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins";

import { getAgentOAuthProviderOptions, getAgentOAuthUrls } from "./oauth-options";
import { authSecurityOptions } from "./security-options";

type Database = ReturnType<typeof createDb>;
type OAuthEnvironment = Parameters<typeof getAgentOAuthUrls>[0];
type JwksFetch = Parameters<typeof verifyJwsAccessToken>[1]["jwksFetch"];
const agentJwksCacheKey = {};

export type AgentAccessTokenErrorCode =
  | "invalid_token"
  | "insufficient_scope"
  | "temporarily_unavailable";

export class AgentAccessTokenError extends Error {
  constructor(
    readonly code: AgentAccessTokenErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentAccessTokenError";
  }
}

export function createAuth(db: Database = createDb()) {
  const security = authSecurityOptions(env);
  const oauthUrls = getAgentOAuthUrls(env);

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
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwt: {
          issuer: oauthUrls.authorizationServer,
          audience: oauthUrls.protectedResource,
        },
      }),
      oauthProvider(getAgentOAuthProviderOptions(env)),
    ],
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

export async function getOAuthAuthorizationServerMetadata(request: Request) {
  const response = await oauthProviderAuthServerMetadata(createAuth())(request);
  return response.json() as Promise<Record<string, unknown>>;
}

export function getOpenIdConfiguration(request: Request) {
  return oauthProviderOpenIdConfigMetadata(createAuth())(request);
}

async function agentAccessTokenClaims(
  token: string,
  environment: OAuthEnvironment,
  jwksFetch: JwksFetch,
  requiredScope?: string,
) {
  if (!token || token.length > 16 * 1_024) {
    throw new AgentAccessTokenError("invalid_token", "The access token is malformed.");
  }
  const urls = getAgentOAuthUrls(environment);
  let claims: Awaited<ReturnType<typeof verifyJwsAccessToken>>;
  try {
    claims = await verifyJwsAccessToken(token, {
      jwksFetch,
      jwksCacheKey: agentJwksCacheKey,
      verifyOptions: {
        issuer: urls.authorizationServer,
        audience: urls.protectedResource,
      },
    });
  } catch (error) {
    throw new AgentAccessTokenError("invalid_token", "The access token is invalid.", {
      cause: error,
    });
  }
  const scopes = typeof claims.scope === "string" ? claims.scope.split(/\s+/u) : [];
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw new AgentAccessTokenError(
      "insufficient_scope",
      `The access token does not include ${requiredScope}.`,
    );
  }
  return claims;
}

async function tokenHash(token: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyOAuthAccessTokenWithDatabase(
  token: string,
  database: Database,
  environment: OAuthEnvironment,
  jwksFetch: JwksFetch,
  requiredScope?: string,
) {
  const claims = await agentAccessTokenClaims(token, environment, jwksFetch, requiredScope);
  try {
    const [revocation] = await database
      .select({ tokenHash: schema.oauthAgentAccessTokenRevocation.tokenHash })
      .from(schema.oauthAgentAccessTokenRevocation)
      .where(
        and(
          eq(schema.oauthAgentAccessTokenRevocation.tokenHash, await tokenHash(token)),
          gt(schema.oauthAgentAccessTokenRevocation.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (revocation) {
      throw new AgentAccessTokenError("invalid_token", "The access token has been revoked.");
    }
  } catch (error) {
    if (error instanceof AgentAccessTokenError) throw error;
    throw new AgentAccessTokenError(
      "temporarily_unavailable",
      "Access-token revocation state is unavailable.",
      { cause: error },
    );
  }
  return claims;
}

export function verifyAgentAccessTokenWithDatabase(
  token: string,
  database: Database,
  environment: OAuthEnvironment,
  jwksFetch: JwksFetch,
) {
  return verifyOAuthAccessTokenWithDatabase(token, database, environment, jwksFetch, "art:read");
}

export function verifyOAuthAccessTokenNotRevokedWithDatabase(
  token: string,
  database: Database,
  environment: OAuthEnvironment,
  jwksFetch: JwksFetch,
) {
  return verifyOAuthAccessTokenWithDatabase(token, database, environment, jwksFetch);
}

export async function recordAgentAccessTokenRevocationWithDatabase(
  token: string,
  clientId: string,
  database: Database,
  environment: OAuthEnvironment,
  jwksFetch: JwksFetch,
) {
  let claims: Awaited<ReturnType<typeof agentAccessTokenClaims>>;
  try {
    claims = await agentAccessTokenClaims(token, environment, jwksFetch);
  } catch (error) {
    if (error instanceof AgentAccessTokenError) return false;
    throw error;
  }
  const tokenClientId =
    typeof claims.azp === "string"
      ? claims.azp
      : typeof claims.client_id === "string"
        ? claims.client_id
        : undefined;
  if (tokenClientId !== clientId || typeof claims.exp !== "number") return false;
  const expiresAt = new Date(claims.exp * 1_000);
  if (expiresAt.getTime() <= Date.now()) return false;

  await database
    .delete(schema.oauthAgentAccessTokenRevocation)
    .where(lt(schema.oauthAgentAccessTokenRevocation.expiresAt, new Date()));
  await database
    .insert(schema.oauthAgentAccessTokenRevocation)
    .values({
      tokenHash: await tokenHash(token),
      clientId,
      expiresAt,
    })
    .onConflictDoNothing();
  return true;
}

export async function verifyAgentAccessToken(token: string) {
  const database = createDb();
  return verifyAgentAccessTokenWithDatabase(token, database, env, () =>
    createAuth(database).api.getJwks(),
  );
}

export async function recordAgentAccessTokenRevocation(token: string, clientId: string) {
  const database = createDb();
  return recordAgentAccessTokenRevocationWithDatabase(token, clientId, database, env, () =>
    createAuth(database).api.getJwks(),
  );
}

export async function verifyOAuthAccessTokenNotRevoked(token: string) {
  const database = createDb();
  return verifyOAuthAccessTokenNotRevokedWithDatabase(token, database, env, () =>
    createAuth(database).api.getJwks(),
  );
}

export { AGENT_OAUTH_DEFAULT_SCOPES, AGENT_OAUTH_SCOPES, getAgentOAuthUrls } from "./oauth-options";
