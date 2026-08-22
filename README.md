# Art

A minimal web app for discovering and saving physical art, styles, and galleries.

[art.jpamorgan.com](https://art.jpamorgan.com)

## Stack

- TanStack Start and React
- Hono and oRPC
- Better Auth
- Drizzle and Cloudflare D1
- Cloudflare Workers AI by default, with an interchangeable OpenAI adapter
- Cloudflare Vectorize, Queues, and Analytics Engine
- Private Cloudflare R2 image storage
- Tailwind CSS
- Bun and Turborepo
- Cloudflare Workers via Alchemy

## Local development

```bash
bun install
bun run dev
```

The web app runs at `http://localhost:3001` and the API runs at `http://localhost:3000`.

Local development serves recommendations from the deterministic D1 fallback. Model
enrichment, Vectorize backfill, and the production readiness gate run during remote
deployments.

Environment templates live beside each app and the infrastructure package. Use separate generated values:

```bash
openssl rand -base64 32 # BETTER_AUTH_SECRET and ALCHEMY_PASSWORD
openssl rand -hex 32    # ART_IMPORT_SECRET
```

## Checks

```bash
bun test
bun run check-types
bun run check
bun run build
```

## Curation API

Internal catalog requests use `Authorization: Bearer $ART_IMPORT_SECRET`.

- `GET /internal/artworks?q=<query>&limit=<1-25>` searches artwork identity, source,
  gallery, and taxonomy fields.
- `POST /internal/artworks` creates or updates one artwork from a compact draft. The
  common path references an existing source and gallery by slug; a compact `create`
  definition handles a genuinely new source or gallery without replaying the catalog
  graph. Category and style slugs remain references.

The draft includes distinct public HTTPS full and thumbnail JPEG URLs. The server derives
dimensions, storage identity, public slug, artifact fingerprints, and curation timestamps.
It returns stable duplicates without another upload, stores private content-addressed R2
artifacts, writes artwork relationships atomically, and removes an optional inbox row only
with a created or updated outcome. Duplicate outcomes deliberately keep the inbox row for
an explicit dismissal decision.

## Discovery and recommendations

- **Explore** is an adventurous, non-personalized catalog mix and works signed out.
- **For You** blends saved works, followed artists/galleries/styles, recent activity,
  visual-semantic similarity, novelty, freshness, and diversity. New accounts choose a
  few favorites to establish an initial taste profile.
- **Following** is a chronological feed of the newest works from followed entities.
- **Radio** accepts an optional artwork seed. It can combine that seed with the user's
  taste profile or run non-personalized, with familiar, balanced, and adventurous
  discovery presets.

Artwork metadata and permission-eligible images are analyzed into structured visual and
semantic facets. Canonical facet text is embedded at 768 dimensions and stored in
Cloudflare Vectorize; images remain in private R2 and are not themselves stored in the
vector index. Metadata-only enrichment is used when image-analysis permission is absent.
Model calls happen asynchronously through a Cloudflare Queue, never in page-serving
requests. Ranking falls back to deterministic D1 signals when Vectorize is unavailable.

Cloudflare Workers AI is the default provider (`@cf/google/gemma-4-26b-a4b-it` for
vision and `@cf/baai/bge-base-en-v1.5` for text embeddings), so it requires no external
model API key. Set `ENRICHMENT_PROVIDER=openai` and `OPENAI_API_KEY` to use the OpenAI
adapter instead. Provider, model, prompt, or dimension changes create a new embedding
generation; recommendation queries ignore older generations while the idempotent
backfill rebuilds the catalog.

Recommendation impressions and opens are recorded with opaque recommendation tokens.
Saved works and follows are positive signals; **Not for me** supplies explicit negative
signals. No user identifiers are written to Analytics Engine.

## MCP Apps

The public, no-auth MCP server is available at
`https://api.art.jpamorgan.com/mcp`. Its read-only `browse_art` tool returns a concise
selection from the same catalog query used by the web app and renders a portable MCP Apps
gallery. Filters accept existing category, style, gallery, and artist slugs.

For local inspection, start the app, then point MCP Inspector at the Streamable HTTP URL
`http://localhost:3000/mcp`:

```bash
bun run dev
npx @modelcontextprotocol/inspector
```

The endpoint accepts MCP JSON-RPC over `POST`. This direct call exercises the tool without a
host UI:

```bash
curl --silent --show-error http://localhost:3000/mcp \
  --request POST \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"browse_art","arguments":{"limit":6,"sort":"recent"}}}'
```

To test the widget in ChatGPT, expose port 3000 through a public HTTPS tunnel, enable
Developer mode under **Settings → Apps & Connectors → Advanced settings**, create an app
using the tunnel URL plus `/mcp`, and refresh the app after changing tool or resource
metadata.

## Deploy

```bash
bun run deploy
```

Production uses `art.jpamorgan.com` for the web app and `api.art.jpamorgan.com` for the API.
Deploys apply D1 migrations, idempotently sync the curated R2 seed, enqueue enrichment,
and verify every ready D1 enrichment row exists in Vectorize before publishing the web
Worker. The default Cloudflare provider uses the Worker AI binding. Provider, model names,
and the enrichment prompt version can be overridden with the variables shown in
`apps/server/.env.example`; only the OpenAI provider requires `OPENAI_API_KEY`.
