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

## Import

`POST /internal/art-import` accepts a bounded, normalized artwork batch with a bearer `ART_IMPORT_SECRET`. It upserts sources, galleries, styles, categories, artwork, provenance, and private R2 image artifacts.

## Deploy

```bash
bun run deploy
```

Production uses `art.jpamorgan.com` for the web app and `api.art.jpamorgan.com` for the API.
Deploys apply D1 migrations and idempotently sync the curated R2 seed before publishing the Workers.
