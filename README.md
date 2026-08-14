# Art

A minimal web app for discovering and saving physical art, styles, and galleries.

[art.jpamorgan.com](https://art.jpamorgan.com)

## Stack

- TanStack Start and React
- Hono and oRPC
- Better Auth
- Drizzle and Cloudflare D1
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

## Deploy

```bash
bun run deploy
```

Production uses `art.jpamorgan.com` for the web app and `api.art.jpamorgan.com` for the API.
Deploys apply D1 migrations and idempotently sync the curated R2 seed before publishing the Workers.
