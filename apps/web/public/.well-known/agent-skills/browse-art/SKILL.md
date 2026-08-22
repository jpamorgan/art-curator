---
name: browse-art
description: Browse John Philip Morgan's public art catalog and filter artworks by artist, gallery, style, or category through read-only MCP, A2A, or OAuth-protected JSON interfaces.
---

# Browse art

Use this skill when someone wants to discover or compare physical artworks in the public Art by John Philip Morgan catalog.

## Connect

For tool calls and an interactive gallery, send MCP Streamable HTTP requests to `https://api.art.jpamorgan.com/mcp`. For task-oriented A2A v1.0 clients, fetch `https://art.jpamorgan.com/.well-known/agent-card.json` and use its JSON-RPC interface at `https://api.art.jpamorgan.com/a2a`. Public browsing on both interfaces is anonymous: do not invent an access token or send a browser session cookie.

## Use the tool

Call `browse_art` with an optional `artist`, `gallery`, `style`, or `category` slug. Results can be sorted by `recent`, `title`, or `artist`; `limit` accepts 1 through 12. The operation is read-only and returns canonical artwork URLs plus an MCP Apps gallery resource.

An OAuth-protected JSON representation is also available at `https://api.art.jpamorgan.com/agent/catalog`. Use it only when a caller needs authenticated agent access: follow `https://art.jpamorgan.com/auth.md`, dynamically register a public client, and complete authorization code flow with PKCE for `art:read`.

## Read more

For the machine-readable endpoint map, fetch `https://art.jpamorgan.com/?mode=agent`. For Markdown catalog pages and authentication boundaries, start with `https://art.jpamorgan.com/llms.txt`.
