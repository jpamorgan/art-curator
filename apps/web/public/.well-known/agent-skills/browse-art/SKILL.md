---
name: browse-art
description: Browse John Philip Morgan's public art catalog and filter artworks by artist, gallery, style, or category through its read-only MCP server.
---

# Browse art

Use this skill when someone wants to discover or compare physical artworks in the public Art by John Philip Morgan catalog.

## Connect

Send MCP Streamable HTTP requests to `https://api.art.jpamorgan.com/mcp`. Public browsing is anonymous: do not invent an access token or send a browser session cookie.

## Use the tool

Call `browse_art` with an optional `artist`, `gallery`, `style`, or `category` slug. Results can be sorted by `recent`, `title`, or `artist`; `limit` accepts 1 through 12. The operation is read-only and returns canonical artwork URLs plus an MCP Apps gallery resource.

## Read more

For the machine-readable endpoint map, fetch `https://art.jpamorgan.com/?mode=agent`. For Markdown catalog pages and authentication boundaries, start with `https://art.jpamorgan.com/llms.txt`.
