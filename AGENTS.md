If asked to start the dev server:
- Complete the README local setup if dependencies or `.env` files are missing.
- Run `bun run dev` from the repository root in a persistent terminal.
- Wait for the Worker on port 3000 and Vite on port 3001.
- Verify both return HTTP 200.
- Open `http://localhost:3001` in the Codex in-app browser unless Chrome was requested.
- Keep both processes running.

When work is complete: 
- merge into main
- push to github
- deploy to prod
