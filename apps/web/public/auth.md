# Art agent access

Art by John Philip Morgan exposes a public, read-only art catalog. Agents can browse it without a credential through the MCP server described at <https://art.jpamorgan.com/.well-known/mcp/server-card.json>. Saved works, follows, submissions, and personalized recommendations are interactive user features; they require a person to sign in through the website and are not authorized for autonomous agent access.

## Discover

Fetch the MCP server card and the Agent Skills index at <https://art.jpamorgan.com/.well-known/agent-skills/index.json>. The public MCP endpoint does not return a `WWW-Authenticate` challenge because its advertised catalog tool is anonymous and read-only. Art does not publish RFC 9728 Protected Resource Metadata or an OAuth `agent_auth` extension for this surface.

## Pick a method

Use the public method with no `Authorization` header. There is no agent registration method to select: `anonymous` registration, `identity_assertion`, and the ID-JAG assertion type `urn:ietf:params:oauth:token-type:id-jag` are not accepted. A browser login session must not be copied into an agent request.

## Register

No agent registration is required or supported. There is no `register_uri`, identity endpoint, client secret, API key, or token exchange for public catalog browsing. Do not submit user identity or credentials to the MCP endpoint.

## Claim

There is no agent claim ceremony, user code, verification URI, or claim endpoint. If a person wants saved or personalized features, hand off to <https://art.jpamorgan.com/login> so they can use the interactive application directly.

## Use the credential

No credential is issued. Connect a Streamable HTTP MCP client to the endpoint declared in the server card and call `browse_art`. Requests are read-only; respect the documented limit and filter values. Canonical artwork links in results point back to the public website.

## Errors

Treat an MCP protocol error or an HTTP `4xx` response as a request or compatibility problem; correct the request instead of attempting login. Retry transient `5xx` responses with bounded exponential backoff. A `401` on another API route does not authorize an agent to reuse a person's cookies, and agents should not attempt to bypass that boundary.

## Revocation

There is no public agent credential to revoke. A person can manage their own browser session through the website. If Art later introduces agent credentials, this document and standards-based discovery metadata will be updated together before agents are expected to use them.
