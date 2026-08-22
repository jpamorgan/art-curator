import { describe, expect, test } from "bun:test";

import {
  getAgentOAuthExtension,
  getProtectedResourceMetadata,
  handleAgentCatalogRequest,
  handleAgentIdentityRegistrationRequest,
  handleAgentOAuthRevocationRequest,
  handleAuthorizationServerMetadataRequest,
  handleOAuthIntrospectionRequest,
  handleProtectedResourceMetadataRequest,
  hardenAuthResponse,
} from "./agent-auth";

const environment = {
  BETTER_AUTH_URL: "https://api.art.jpamorgan.com",
  CORS_ORIGIN: "https://art.jpamorgan.com",
};

describe("agent OAuth discovery", () => {
  test("prevents every Better Auth response from being cached", async () => {
    const headers = new Headers({ "Cache-Control": "public" });
    headers.append("Set-Cookie", "session=one; HttpOnly; Path=/");
    headers.append("Set-Cookie", "state=two; HttpOnly; Path=/");
    const response = hardenAuthResponse(Response.json({ access_token: "secret" }, { headers }));

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.getSetCookie()).toEqual([
      "session=one; HttpOnly; Path=/",
      "state=two; HttpOnly; Path=/",
    ]);
    expect(await response.json()).toEqual({ access_token: "secret" });
  });

  test("cross-links RFC 9728 protected-resource metadata to the authorization server", async () => {
    expect(getProtectedResourceMetadata(environment)).toEqual({
      resource: "https://api.art.jpamorgan.com/agent/catalog",
      authorization_servers: ["https://api.art.jpamorgan.com"],
      scopes_supported: ["art:read"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://art.jpamorgan.com/auth.md",
    });

    const response = handleProtectedResourceMetadataRequest(
      new Request("https://api.art.jpamorgan.com/.well-known/oauth-protected-resource"),
      environment,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(await response.json()).toEqual(getProtectedResourceMetadata(environment));
  });

  test("adds a truthful custom public-client extension without claiming WorkOS agent_auth", async () => {
    const extension = getAgentOAuthExtension(environment);
    expect(extension).toEqual({
      skill: "https://art.jpamorgan.com/auth.md",
      register_uri: "https://api.art.jpamorgan.com/agent/identity",
      registration_profile: "oauth2_public_client",
      revocation_uri: "https://api.art.jpamorgan.com/api/auth/oauth2/revoke",
    });
    expect(JSON.stringify(extension)).not.toContain("identity_assertion");
    expect(JSON.stringify(extension)).not.toContain("id-jag");

    const response = await handleAuthorizationServerMetadataRequest(
      new Request("https://api.art.jpamorgan.com/.well-known/oauth-authorization-server"),
      environment,
      async () => ({
        issuer: "https://api.art.jpamorgan.com",
        authorization_endpoint: "https://api.art.jpamorgan.com/api/auth/oauth2/authorize",
        token_endpoint: "https://api.art.jpamorgan.com/api/auth/oauth2/token",
      }),
    );
    const body = await response.json();
    expect(body).toEqual({
      issuer: "https://api.art.jpamorgan.com",
      authorization_endpoint: "https://api.art.jpamorgan.com/api/auth/oauth2/authorize",
      token_endpoint: "https://api.art.jpamorgan.com/api/auth/oauth2/token",
      agent_oauth: extension,
    });
    expect(JSON.stringify(body)).not.toContain("agent_auth");
  });

  test("HEAD preserves discovery status and headers without a body", async () => {
    const protectedResponse = handleProtectedResourceMetadataRequest(
      new Request("https://api.art.jpamorgan.com/.well-known/oauth-protected-resource", {
        method: "HEAD",
      }),
      environment,
    );
    const serverResponse = await handleAuthorizationServerMetadataRequest(
      new Request("https://api.art.jpamorgan.com/.well-known/oauth-authorization-server", {
        method: "HEAD",
      }),
      environment,
      async () => ({ issuer: "https://api.art.jpamorgan.com" }),
    );

    expect(protectedResponse.status).toBe(200);
    expect(serverResponse.status).toBe(200);
    expect(await protectedResponse.text()).toBe("");
    expect(await serverResponse.text()).toBe("");
  });
});

describe("anonymous agent client registration", () => {
  const validRegistration = {
    type: "oauth2_public_client",
    client_name: "Museum research agent",
    application_type: "native",
    redirect_uris: ["http://127.0.0.1:49152/callback"],
    scope: "openid profile art:read offline_access",
  };

  test("translates the auth.md registration shape into real OAuth DCR", async () => {
    let upstream;
    const response = await handleAgentIdentityRegistrationRequest(
      new Request("https://api.art.jpamorgan.com/agent/identity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://art.jpamorgan.com",
          "User-Agent": "catalog-agent/1.0",
        },
        body: JSON.stringify(validRegistration),
      }),
      {
        environment,
        trustedOrigins: ["https://art.jpamorgan.com"],
        async register(request) {
          upstream = request;
          return Response.json(
            {
              client_id: "public-client-id",
              token_endpoint_auth_method: "none",
              redirect_uris: validRegistration.redirect_uris,
            },
            { status: 201 },
          );
        },
      },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upstream.url).toBe("https://api.art.jpamorgan.com/api/auth/oauth2/register");
    expect(upstream.headers.get("origin")).toBe("https://art.jpamorgan.com");
    expect(await upstream.json()).toEqual({
      client_name: "Museum research agent",
      type: "native",
      redirect_uris: validRegistration.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid profile art:read offline_access",
    });
    expect(await response.json()).toMatchObject({
      client_id: "public-client-id",
      token_endpoint_auth_method: "none",
    });
  });

  test("permits originless agent requests but rejects browser requests from untrusted origins", async () => {
    let calls = 0;
    const register = async () => {
      calls += 1;
      return Response.json({ client_id: "public" }, { status: 201 });
    };
    const makeRequest = (origin) =>
      new Request("https://api.art.jpamorgan.com/agent/identity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify(validRegistration),
      });

    expect(
      (
        await handleAgentIdentityRegistrationRequest(makeRequest(undefined), {
          environment,
          trustedOrigins: ["https://art.jpamorgan.com"],
          register,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await handleAgentIdentityRegistrationRequest(makeRequest("https://evil.example"), {
          environment,
          trustedOrigins: ["https://art.jpamorgan.com"],
          register,
        })
      ).status,
    ).toBe(403);
    expect(calls).toBe(1);
  });

  test("defaults registrations to the least-privilege art:read scope", async () => {
    let upstreamBody;
    const response = await handleAgentIdentityRegistrationRequest(
      new Request("https://api.art.jpamorgan.com/agent/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "oauth2_public_client",
          redirect_uris: ["http://127.0.0.1:49152/callback"],
        }),
      }),
      {
        environment,
        trustedOrigins: [],
        async register(request) {
          upstreamBody = await request.json();
          return Response.json({ client_id: "public" });
        },
      },
    );

    expect(response.status).toBe(200);
    expect(upstreamBody.scope).toBe("art:read");
  });

  test("rejects browser-based clients because cross-origin token exchange is not supported", async () => {
    let upstreamCalls = 0;
    const response = await handleAgentIdentityRegistrationRequest(
      new Request("https://api.art.jpamorgan.com/agent/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validRegistration, application_type: "web" }),
      }),
      {
        environment,
        trustedOrigins: [],
        async register() {
          upstreamCalls += 1;
          return Response.json({ client_id: "browser-public" });
        },
      },
    );
    expect(response.status).toBe(400);
    expect(upstreamCalls).toBe(0);
  });

  test("rejects unsupported scopes, malformed bodies, and oversized registrations", async () => {
    const register = async () => Response.json({ client_id: "should-not-run" });
    const request = (body, headers = {}) =>
      new Request("https://api.art.jpamorgan.com/agent/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
      });

    const unsupported = await handleAgentIdentityRegistrationRequest(
      request(JSON.stringify({ ...validRegistration, scope: "art:write" })),
      { environment, trustedOrigins: [], register },
    );
    const malformed = await handleAgentIdentityRegistrationRequest(request("{"), {
      environment,
      trustedOrigins: [],
      register,
    });
    const oversized = await handleAgentIdentityRegistrationRequest(
      request("{}", { "Content-Length": "20000" }),
      { environment, trustedOrigins: [], register },
    );

    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: "invalid_scope" });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "invalid_json" });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: "too_large" });
  });
});

describe("protected agent catalog", () => {
  test("challenges requests without a bearer token with RFC 9728 discovery", async () => {
    const response = await handleAgentCatalogRequest(
      new Request("https://api.art.jpamorgan.com/agent/catalog"),
      {
        environment,
        verifyAccessToken: async () => ({}),
        browseArt: async () => ({ items: [], nextCursor: null }),
      },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://api.art.jpamorgan.com/.well-known/oauth-protected-resource"',
    );
  });

  test("verifies the token, validates filters, and returns only public catalog data", async () => {
    let verifiedToken;
    let browseInput;
    const response = await handleAgentCatalogRequest(
      new Request(
        "https://api.art.jpamorgan.com/agent/catalog?limit=3&sort=title&style=surrealism&cursor=next-page",
        { headers: { Authorization: "Bearer signed.access.token" } },
      ),
      {
        environment,
        async verifyAccessToken(token) {
          verifiedToken = token;
          return { sub: "user-1", azp: "client-1", scope: "openid art:read" };
        },
        async browseArt(input) {
          browseInput = input;
          return {
            items: [
              {
                slug: "the-persistence-of-memory",
                title: "The Persistence of Memory",
                artist: "Salvador Dalí",
                date: "1931",
                gallery: "Museum of Modern Art",
                category: "painting",
                styles: [{ name: "Surrealism", slug: "surrealism" }],
                url: "https://art.jpamorgan.com/art/the-persistence-of-memory",
                thumbnailUrl: "https://api.art.jpamorgan.com/artifacts/1/thumbnail.webp",
                alt: "Melting clocks in a barren landscape",
              },
            ],
            nextCursor: null,
          };
        },
      },
    );

    expect(verifiedToken).toBe("signed.access.token");
    expect(browseInput).toEqual({
      limit: 3,
      sort: "title",
      style: "surrealism",
      cursor: "next-page",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      resource: "https://api.art.jpamorgan.com/agent/catalog",
      authenticated: {
        subject: "user-1",
        clientId: "client-1",
        scopes: ["openid", "art:read"],
      },
      items: [{ slug: "the-persistence-of-memory", title: "The Persistence of Memory" }],
      nextCursor: null,
    });
  });

  test("rejects invalid tokens and invalid filters without querying the catalog", async () => {
    let calls = 0;
    const dependencies = {
      environment,
      async verifyAccessToken(token) {
        if (token === "bad") throw new Error("bad signature");
        return { scope: "art:read" };
      },
      async browseArt() {
        calls += 1;
        return { items: [], nextCursor: null };
      },
    };
    const badToken = await handleAgentCatalogRequest(
      new Request("https://api.art.jpamorgan.com/agent/catalog", {
        headers: { Authorization: "Bearer bad" },
      }),
      dependencies,
    );
    const badFilter = await handleAgentCatalogRequest(
      new Request("https://api.art.jpamorgan.com/agent/catalog?style=NOT_A_SLUG", {
        headers: { Authorization: "Bearer valid" },
      }),
      dependencies,
    );

    expect(badToken.status).toBe(401);
    expect(badToken.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect(badFilter.status).toBe(400);
    expect(calls).toBe(0);
  });

  test("distinguishes valid tokens with insufficient scope from invalid tokens", async () => {
    const error = new Error("missing scope");
    error.name = "AgentAccessTokenError";
    error.code = "insufficient_scope";
    const response = await handleAgentCatalogRequest(
      new Request("https://api.art.jpamorgan.com/agent/catalog", {
        headers: { Authorization: "Bearer valid.but.wrong-scope" },
      }),
      {
        environment,
        verifyAccessToken: async () => {
          throw error;
        },
        browseArt: async () => ({ items: [], nextCursor: null }),
      },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(response.headers.get("www-authenticate")).toContain('scope="art:read"');
  });

  test("HEAD authenticates and preserves success headers without a body", async () => {
    const response = await handleAgentCatalogRequest(
      new Request("https://api.art.jpamorgan.com/agent/catalog", {
        method: "HEAD",
        headers: { Authorization: "Bearer valid" },
      }),
      {
        environment,
        verifyAccessToken: async () => ({ scope: "art:read" }),
        browseArt: async () => ({ items: [], nextCursor: null }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await response.text()).toBe("");
  });
});

describe("agent OAuth access-token revocation", () => {
  test("records a valid JWT after the provider accepts revocation", async () => {
    let recorded;
    const response = await handleAgentOAuthRevocationRequest(
      new Request("https://api.art.jpamorgan.com/api/auth/oauth2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "public-client",
          token: "signed.access.token",
          token_type_hint: "access_token",
        }),
      }),
      {
        revoke: async () => Response.json({}, { headers: { "Cache-Control": "public" } }),
        async recordAccessTokenRevocation(token, clientId) {
          recorded = { token, clientId };
          return true;
        },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(recorded).toEqual({ token: "signed.access.token", clientId: "public-client" });
  });

  test("does not denylist opaque refresh tokens, ignores a false hint, and fails closed", async () => {
    let calls = 0;
    const request = (token, hint) =>
      new Request("https://api.art.jpamorgan.com/api/auth/oauth2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "public-client",
          token,
          token_type_hint: hint,
        }),
      });
    const dependencies = {
      revoke: async () => Response.json({}),
      async recordAccessTokenRevocation() {
        calls += 1;
        throw new Error("D1 unavailable");
      },
    };
    expect(
      (
        await handleAgentOAuthRevocationRequest(
          request("refresh-token", "refresh_token"),
          dependencies,
        )
      ).status,
    ).toBe(200);
    expect(calls).toBe(0);
    const failed = await handleAgentOAuthRevocationRequest(
      request("signed.access.token", "refresh_token"),
      dependencies,
    );
    expect(failed.status).toBe(503);
    expect(failed.headers.get("retry-after")).toBe("30");
  });

  test("rejects repeated form fields before the provider sees an ambiguous token", async () => {
    let upstreamCalls = 0;
    let recordCalls = 0;
    const response = await handleAgentOAuthRevocationRequest(
      new Request("https://api.art.jpamorgan.com/api/auth/oauth2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "client_id=public-client&token=first.a.b&token=second.c.d",
      }),
      {
        async revoke() {
          upstreamCalls += 1;
          return Response.json({});
        },
        async recordAccessTokenRevocation() {
          recordCalls += 1;
          return true;
        },
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(upstreamCalls).toBe(0);
    expect(recordCalls).toBe(0);
  });

  test("stops reading chunked revocation bodies at the configured bound", async () => {
    let upstreamCalls = 0;
    let canceled = false;
    const chunk = new TextEncoder().encode("x".repeat(10_000));
    const pending = handleAgentOAuthRevocationRequest(
      new Request("https://api.art.jpamorgan.com/api/auth/oauth2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new ReadableStream({
          pull(controller) {
            controller.enqueue(chunk);
          },
          cancel() {
            canceled = true;
          },
        }),
      }),
      {
        async revoke() {
          upstreamCalls += 1;
          return Response.json({});
        },
        recordAccessTokenRevocation: async () => true,
      },
    );
    const response = await Promise.race([
      pending,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("bounded parser did not return promptly")), 250),
      ),
    ]);
    expect(response.status).toBe(413);
    expect(canceled).toBe(true);
    expect(upstreamCalls).toBe(0);
  });

  test("overrides stale active introspection for a denylisted JWT", async () => {
    const tokenError = new Error("revoked");
    tokenError.name = "AgentAccessTokenError";
    tokenError.code = "invalid_token";
    const response = await handleOAuthIntrospectionRequest(
      new Request("https://api.art.jpamorgan.com/api/auth/oauth2/introspect", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "confidential-client",
          client_secret: "secret",
          token: "signed.access.token",
        }),
      }),
      {
        introspect: async () => Response.json({ active: true, scope: "art:read" }),
        verifyAccessTokenNotRevoked: async () => {
          throw tokenError;
        },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ active: false });
  });
});
