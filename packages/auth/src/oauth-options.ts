import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";

export const AGENT_OAUTH_SCOPES: Scope[] = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "art:read",
];
export const AGENT_OAUTH_DEFAULT_SCOPES: Scope[] = ["art:read"];

export type AgentOAuthRuntimeEnvironment = {
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
};

export function getAgentOAuthUrls(environment: AgentOAuthRuntimeEnvironment) {
  const authorizationServer = new URL(environment.BETTER_AUTH_URL).origin;
  const webOrigin = new URL(environment.CORS_ORIGIN).origin;

  return {
    authorizationServer,
    authBaseUrl: new URL("/api/auth", authorizationServer).href.replace(/\/$/u, ""),
    protectedResource: new URL("/agent/catalog", authorizationServer).href,
    loginPage: new URL("/login", webOrigin).href,
    consentPage: new URL("/oauth/consent", webOrigin).href,
    authDocumentation: new URL("/auth.md", webOrigin).href,
  };
}

export function getAgentOAuthProviderOptions(
  environment: AgentOAuthRuntimeEnvironment,
): OAuthOptions<Scope[]> {
  const urls = getAgentOAuthUrls(environment);

  return {
    loginPage: urls.loginPage,
    consentPage: urls.consentPage,
    scopes: AGENT_OAUTH_SCOPES,
    advertisedMetadata: {
      scopes_supported: AGENT_OAUTH_SCOPES,
    },
    validAudiences: [urls.protectedResource],
    grantTypes: ["authorization_code", "refresh_token"],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationDefaultScopes: AGENT_OAUTH_DEFAULT_SCOPES,
    clientRegistrationAllowedScopes: AGENT_OAUTH_SCOPES,
    clientRegistrationClientSecretExpiration: "30 days",
    accessTokenExpiresIn: 60 * 60,
    refreshTokenExpiresIn: 30 * 24 * 60 * 60,
    codeExpiresIn: 10 * 60,
    silenceWarnings: {
      oauthAuthServerConfig: true,
      openidConfig: true,
    },
  };
}
