## Repository guide for coding agents

This is the public source for [Art by John Philip Morgan](https://art.jpamorgan.com), a
TanStack Start web app and Hono/oRPC API for discovering physical art. Read
[`README.md`](./README.md) before making changes. The production agent entry point is
[`apps/web/public/llms.txt`](./apps/web/public/llms.txt).

- Use Bun from the repository root. Run focused tests for the files you change, then run
  `bun test`, `bun run check-types`, and `bun run build` when the change warrants the full
  suite.
- Keep public catalog access read-only and anonymous. Do not expose internal curation
  routes, browser session cookies, secrets, private R2 objects, or user-specific data in
  discovery artifacts.
- Keep `llms.txt`, `auth.md`, the MCP server card, the Agent Skills index, and the ARD
  catalog consistent when public capabilities or endpoints change.
- Treat generated files and database migrations as owned artifacts: update them only
  through the repository's documented tooling, and never rewrite existing migrations.

## Local development

If asked to start the dev server:

- Complete the README local setup if dependencies or `.env` files are missing.
- Run `bun run dev` from the repository root in a persistent terminal.
- Wait for the Worker on port 3000 and Vite on port 3001.
- Verify both return HTTP 200.
- Open `http://localhost:3001` in the Codex in-app browser unless Chrome was requested.
- Keep both processes running.

## Release workflow

When work is complete:

- merge into main
- push to github
- deploy to prod
