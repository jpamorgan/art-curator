# Art agent authentication

Art by John Philip Morgan has two read-only agent surfaces. The public MCP and A2A catalog interfaces need no credential. The protected catalog at `https://api.art.jpamorgan.com/agent/catalog` uses OAuth 2.1 authorization code flow with PKCE, dynamically registered public clients, and the `art:read` scope. The resource and authorization server share `https://api.art.jpamorgan.com`.

## Discover

Request the protected catalog without a token to receive:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://api.art.jpamorgan.com/.well-known/oauth-protected-resource"
```

Fetch that RFC 9728 document, follow its `authorization_servers` entry to `https://api.art.jpamorgan.com/.well-known/oauth-authorization-server`, and read the standard `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `revocation_endpoint`, scopes, grant types, and PKCE methods. Its service-specific `agent_oauth` block points back to this guide and publishes the convenience `register_uri` at `https://api.art.jpamorgan.com/agent/identity`.

## Pick a method

- For public catalog conversation and visual browsing, use MCP at `https://api.art.jpamorgan.com/mcp` or A2A at `https://api.art.jpamorgan.com/a2a`; both are anonymous and accept no credential.
- For the protected JSON catalog, dynamically register an `oauth2_public_client`, then use authorization code flow with PKCE. Registration needs no pre-existing credential, but a person still signs in and approves requested scopes at the authorization endpoint.
- The service-specific `agent_oauth` object is not the WorkOS `agent_auth` identity-assertion protocol. `identity_assertion`, the ID-JAG assertion type `urn:ietf:params:oauth:token-type:id-jag`, and an auth.md `claim_token` exchange are not advertised or accepted. Do not invent those fields.

## Register

Create a native public OAuth client through `agent_oauth.register_uri`. Supply one to ten exact redirect URIs. Loopback redirects may choose an available local port.

```http
POST /agent/identity HTTP/1.1
Host: api.art.jpamorgan.com
Content-Type: application/json
```

```json
{
  "type": "oauth2_public_client",
  "client_name": "My art research agent",
  "application_type": "native",
  "redirect_uris": ["http://127.0.0.1:49152/callback"],
  "scope": "offline_access art:read"
}
```

A successful RFC 7591 response returns `client_id`, `redirect_uris`, `scope`, and `token_endpoint_auth_method: "none"`. It does not return a `client_secret`. Store the client ID and use PKCE for every authorization request. Direct standards-aware clients may instead use the advertised `/api/auth/oauth2/register` endpoint with the equivalent RFC 7591 fields.

## Claim

Generate a high-entropy PKCE verifier and its `S256` challenge. Open the advertised authorization endpoint with `response_type=code`, the registered `client_id` and exact `redirect_uri`, `scope=offline_access art:read`, `state`, `code_challenge`, and `code_challenge_method=S256`. Hand the resulting Art login and consent pages to the person. The person authenticates on the Art domain and approves the scopes; never ask them to paste a password, session cookie, or authorization code into the agent conversation.

After approval, Art redirects to the registered URI with `code`, the original `state`, and `iss=https://api.art.jpamorgan.com`. Verify both `state` and `iss` before exchanging the one-time code. This interactive authorization is the ownership and consent step; there is no separate `claim_token`, `user_code`, or polling ceremony.

## Use the credential

Exchange the code at the discovered token endpoint using form encoding:

```http
POST /api/auth/oauth2/token HTTP/1.1
Host: api.art.jpamorgan.com
Content-Type: application/x-www-form-urlencoded
```

```text
grant_type=authorization_code&client_id=<client_id>&code=<code>&code_verifier=<verifier>&redirect_uri=<exact_redirect_uri>&resource=https%3A%2F%2Fapi.art.jpamorgan.com%2Fagent%2Fcatalog
```

Send the resulting access token only in `Authorization: Bearer <access_token>` to `https://api.art.jpamorgan.com/agent/catalog`. The resource supports `limit` (1–48), `sort` (`recent`, `title`, or `artist`), optional lowercase `category`, `style`, `gallery`, and `artist` slug filters, and the opaque `cursor` returned by the prior page. The JWT must have issuer `https://api.art.jpamorgan.com`, include the protected resource in `aud`, and contain `art:read` in `scope`. Use the refresh token at the same token endpoint with `grant_type=refresh_token`, `client_id`, `refresh_token`, and the same `resource`; replace the old refresh token after every successful rotation.

## Errors

Treat `invalid_request`, `invalid_client`, `invalid_scope`, `invalid_grant`, and PKCE failures as terminal for that request; correct the input instead of retrying unchanged. A protected-resource `401` with `error="invalid_token"` means the token is malformed, expired, revoked, or has the wrong issuer or audience. A `403` with `error="insufficient_scope"` means a valid token lacks `art:read`; start a new authorization with that scope. Restart authorization if refresh fails. Retry a transient `503` only with bounded exponential backoff and honor `Retry-After`. Never send browser cookies to an agent endpoint.

## Revocation

Revoke a refresh or access token at `https://api.art.jpamorgan.com/api/auth/oauth2/revoke` with form fields `client_id`, `token`, and `token_type_hint` (`refresh_token` or `access_token`). A revoked access token is immediately denied by the protected catalog. Revoking a refresh token prevents future refreshes but does not revoke an already issued access token; revoke that access token separately or let its one-hour lifetime expire. Stop using revoked credentials, discard rotated predecessors, and begin a new PKCE authorization if access is needed later. Interactive browser sessions remain user-controlled and separate from agent credentials.
