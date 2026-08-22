import {
  AGENT_OAUTH_DEFAULT_SCOPES,
  AGENT_OAUTH_SCOPES,
  getAgentOAuthUrls,
} from "@art/auth/oauth-options";
import { z } from "zod";

import { BoundedJsonError, readBoundedJson } from "./bounded-json";

const MAX_REGISTRATION_BYTES = 16 * 1_024;
const MAX_REVOCATION_BYTES = 16 * 1_024;
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .max(96);

const registrationSchema = z
  .object({
    type: z.literal("oauth2_public_client"),
    client_name: z.string().trim().min(1).max(200).optional(),
    client_uri: z.url().max(2_048).optional(),
    application_type: z.literal("native").optional(),
    redirect_uris: z.array(z.url().max(2_048)).min(1).max(10),
    scope: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

const catalogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(48).default(24),
  sort: z.enum(["recent", "title", "artist"]).default("recent"),
  category: slug.optional(),
  gallery: slug.optional(),
  style: slug.optional(),
  artist: slug.optional(),
  cursor: z.string().min(1).max(512).optional(),
});

type OAuthEnvironment = {
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
};

type AgentCatalogInput = z.infer<typeof catalogQuerySchema>;

export type AgentCatalogArtwork = {
  slug: string;
  title: string;
  artist: string;
  date: string;
  gallery: string;
  category: string;
  styles: { name: string; slug: string }[];
  url: string;
  thumbnailUrl: string;
  alt: string;
};

export type AgentCatalogPage = {
  items: AgentCatalogArtwork[];
  nextCursor: string | null;
};

function publicMetadataHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    "Content-Type": "application/json; charset=utf-8",
  };
}

export function hardenAuthResponse(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function getProtectedResourceMetadata(environment: OAuthEnvironment) {
  const urls = getAgentOAuthUrls(environment);
  return {
    resource: urls.protectedResource,
    authorization_servers: [urls.authorizationServer],
    scopes_supported: ["art:read"],
    bearer_methods_supported: ["header"],
    resource_documentation: urls.authDocumentation,
  };
}

export function getAgentOAuthExtension(environment: OAuthEnvironment) {
  const urls = getAgentOAuthUrls(environment);
  const registrationEndpoint = new URL("/agent/identity", urls.authorizationServer).href;
  return {
    skill: urls.authDocumentation,
    register_uri: registrationEndpoint,
    registration_profile: "oauth2_public_client",
    revocation_uri: `${urls.authBaseUrl}/oauth2/revoke`,
  };
}

export function handleProtectedResourceMetadataRequest(
  request: Request,
  environment: OAuthEnvironment,
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD, OPTIONS" },
    });
  }
  return new Response(
    request.method === "HEAD" ? null : JSON.stringify(getProtectedResourceMetadata(environment)),
    { headers: publicMetadataHeaders() },
  );
}

export async function handleAuthorizationServerMetadataRequest(
  request: Request,
  environment: OAuthEnvironment,
  readProviderMetadata: (request: Request) => Promise<Record<string, unknown>>,
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD, OPTIONS" },
    });
  }
  const metadata = await readProviderMetadata(request);
  const body = {
    ...metadata,
    // This is an OAuth DCR extension, not WorkOS's reserved agent_auth
    // identity-assertion protocol. The distinction prevents agents from
    // attempting an unsupported identity_assertion/claim exchange.
    agent_oauth: getAgentOAuthExtension(environment),
  };
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    headers: publicMetadataHeaders(),
  });
}

function registrationError(status: number, error: string, message: string) {
  return Response.json(
    { error, error_description: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

function validateRegistrationOrigin(request: Request, trustedOrigins: readonly string[]) {
  const origin = request.headers.get("origin");
  return origin === null || trustedOrigins.includes(origin);
}

export async function handleAgentIdentityRegistrationRequest(
  request: Request,
  dependencies: {
    environment: OAuthEnvironment;
    trustedOrigins: readonly string[];
    register: (request: Request) => Promise<Response>;
  },
) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "OPTIONS, POST" } });
  }
  if (!validateRegistrationOrigin(request, dependencies.trustedOrigins)) {
    return new Response(null, { status: 403 });
  }

  let input: z.infer<typeof registrationSchema>;
  try {
    const parsed = registrationSchema.safeParse(
      await readBoundedJson(request, MAX_REGISTRATION_BYTES),
    );
    if (!parsed.success) {
      return registrationError(400, "invalid_request", "Invalid public-client registration.");
    }
    input = parsed.data;
  } catch (error) {
    if (error instanceof BoundedJsonError) {
      return registrationError(error.status, error.reason, "Invalid registration request body.");
    }
    throw error;
  }

  const requestedScopes = input.scope
    ? [...new Set(input.scope.split(/\s+/u).filter(Boolean))]
    : [...AGENT_OAUTH_DEFAULT_SCOPES];
  if (requestedScopes.some((scopeName) => !AGENT_OAUTH_SCOPES.includes(scopeName))) {
    return registrationError(400, "invalid_scope", "One or more requested scopes are unsupported.");
  }

  const urls = getAgentOAuthUrls(dependencies.environment);
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  for (const name of ["cf-connecting-ip", "user-agent"] as const) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const origin = request.headers.get("origin");
  if (origin) headers.set("origin", origin);

  const response = await dependencies.register(
    new Request(`${urls.authBaseUrl}/oauth2/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_name: input.client_name ?? "Anonymous art agent",
        ...(input.client_uri ? { client_uri: input.client_uri } : {}),
        type: "native",
        redirect_uris: input.redirect_uris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: requestedScopes.join(" "),
      }),
    }),
  );

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("Pragma", "no-cache");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function resourceChallenge(
  environment: OAuthEnvironment,
  error?: "invalid_token" | "insufficient_scope",
) {
  const metadataUrl = new URL(
    "/.well-known/oauth-protected-resource",
    getAgentOAuthUrls(environment).authorizationServer,
  ).href;
  return (
    `Bearer resource_metadata="${metadataUrl}"` +
    (error ? `, error="${error}"` : "") +
    (error === "insufficient_scope" ? ', scope="art:read"' : "")
  );
}

function unauthorized(environment: OAuthEnvironment, invalidToken = false) {
  return Response.json(
    { error: "unauthorized" },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": resourceChallenge(
          environment,
          invalidToken ? "invalid_token" : undefined,
        ),
      },
    },
  );
}

function insufficientScope(environment: OAuthEnvironment) {
  return Response.json(
    { error: "insufficient_scope", required_scope: "art:read" },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": resourceChallenge(environment, "insufficient_scope"),
      },
    },
  );
}

function temporarilyUnavailable() {
  return Response.json(
    { error: "temporarily_unavailable" },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    },
  );
}

function agentAccessTokenErrorCode(error: unknown) {
  if (!(error instanceof Error) || error.name !== "AgentAccessTokenError") return undefined;
  const code = (error as Error & { code?: unknown }).code;
  return code === "invalid_token" ||
    code === "insufficient_scope" ||
    code === "temporarily_unavailable"
    ? code
    : undefined;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/u.exec(authorization);
  return match?.[1] ?? "";
}

export async function handleAgentCatalogRequest(
  request: Request,
  dependencies: {
    environment: OAuthEnvironment;
    verifyAccessToken: (token: string) => Promise<Record<string, unknown>>;
    browseArt: (input: AgentCatalogInput) => Promise<AgentCatalogPage>;
  },
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
  }
  const token = readBearerToken(request);
  if (token === null) return unauthorized(dependencies.environment);
  if (!token) return unauthorized(dependencies.environment, true);

  let identity: Record<string, unknown>;
  try {
    identity = await dependencies.verifyAccessToken(token);
  } catch (error) {
    const code = agentAccessTokenErrorCode(error);
    if (code === "insufficient_scope") return insufficientScope(dependencies.environment);
    if (code === "temporarily_unavailable") return temporarilyUnavailable();
    return unauthorized(dependencies.environment, true);
  }

  const url = new URL(request.url);
  const parsed = catalogQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_query" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const page = await dependencies.browseArt(parsed.data);
    const body = {
      resource: getAgentOAuthUrls(dependencies.environment).protectedResource,
      authenticated: {
        subject: typeof identity.sub === "string" ? identity.sub : null,
        clientId: typeof identity.azp === "string" ? identity.azp : null,
        scopes:
          typeof identity.scope === "string" ? identity.scope.split(/\s+/u).filter(Boolean) : [],
      },
      ...page,
    };
    return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Agent catalog failed", error);
    return Response.json(
      { error: "catalog_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}

async function readBoundedOAuthForm(request: Request, operation: "introspection" | "revocation") {
  if (
    !/^application\/x-www-form-urlencoded(?:\s*;.*)?$/iu.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    return {
      error: registrationError(415, "invalid_request", `Use form-encoded ${operation} fields.`),
    };
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      return { error: registrationError(400, "invalid_request", "Invalid Content-Length.") };
    }
    if (length > MAX_REVOCATION_BYTES) {
      return {
        error: registrationError(413, "invalid_request", `${operation} request is too large.`),
      };
    }
  }
  const body = request.body;
  if (!body)
    return { error: registrationError(400, "invalid_request", `Missing ${operation} form.`) };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REVOCATION_BYTES) {
      await reader.cancel().catch(() => {});
      return {
        error: registrationError(413, "invalid_request", `${operation} request is too large.`),
      };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const form = new URLSearchParams(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
    const names = new Set<string>();
    for (const name of form.keys()) {
      if (names.has(name)) {
        return {
          error: registrationError(
            400,
            "invalid_request",
            "OAuth form parameters must not be repeated.",
          ),
        };
      }
      names.add(name);
    }
    return { form, bytes };
  } catch {
    return { error: registrationError(400, "invalid_request", `Invalid ${operation} form.`) };
  }
}

export async function handleAgentOAuthRevocationRequest(
  request: Request,
  dependencies: {
    revoke: (request: Request) => Promise<Response>;
    recordAccessTokenRevocation: (token: string, clientId: string) => Promise<boolean>;
  },
) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } });
  }
  const parsed = await readBoundedOAuthForm(request, "revocation");
  if (parsed.error) return parsed.error;

  const upstreamRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: parsed.bytes,
  });
  const response = hardenAuthResponse(await dependencies.revoke(upstreamRequest));
  if (!response.ok || !parsed.form) return response;
  const token = parsed.form.get("token");
  const clientId = parsed.form.get("client_id");
  // RFC 7009 defines token_type_hint as a hint only. Identify self-contained
  // access tokens from their JWT shape even when the caller supplies a wrong hint.
  const isPossibleAccessToken = token?.split(".").length === 3;
  if (!token || !clientId || !isPossibleAccessToken) return response;

  try {
    await dependencies.recordAccessTokenRevocation(token, clientId);
    return response;
  } catch (error) {
    console.error("Access-token revocation state could not be recorded", error);
    return temporarilyUnavailable();
  }
}

export async function handleOAuthIntrospectionRequest(
  request: Request,
  dependencies: {
    introspect: (request: Request) => Promise<Response>;
    verifyAccessTokenNotRevoked: (token: string) => Promise<Record<string, unknown>>;
  },
) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } });
  }
  const parsed = await readBoundedOAuthForm(request, "introspection");
  if (parsed.error) return parsed.error;
  const upstreamRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: parsed.bytes,
  });
  const response = hardenAuthResponse(await dependencies.introspect(upstreamRequest));
  const token = parsed.form?.get("token");
  if (!response.ok || !token || token.split(".").length !== 3) return response;
  const responseBody = (await response
    .clone()
    .json()
    .catch(() => undefined)) as Record<string, unknown> | undefined;
  if (responseBody?.active !== true) return response;

  try {
    await dependencies.verifyAccessTokenNotRevoked(token);
    return response;
  } catch (error) {
    if (agentAccessTokenErrorCode(error) === "temporarily_unavailable") {
      return temporarilyUnavailable();
    }
    return Response.json(
      { active: false },
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
    );
  }
}

export async function handleOAuthUserInfoRequest(
  request: Request,
  dependencies: {
    verifyAccessTokenNotRevoked: (token: string) => Promise<Record<string, unknown>>;
    userInfo: (request: Request) => Promise<Response>;
  },
) {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST, OPTIONS" } });
  }
  const token = readBearerToken(request);
  if (token?.split(".").length === 3) {
    try {
      await dependencies.verifyAccessTokenNotRevoked(token);
    } catch (error) {
      if (agentAccessTokenErrorCode(error) === "temporarily_unavailable") {
        return temporarilyUnavailable();
      }
      return Response.json(
        { error: "invalid_token" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store",
            "WWW-Authenticate": 'Bearer error="invalid_token"',
          },
        },
      );
    }
  }
  return hardenAuthResponse(await dependencies.userInfo(request));
}
