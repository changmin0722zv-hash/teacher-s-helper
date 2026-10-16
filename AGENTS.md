<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project workflow

- This is a private, single-teacher Korean elementary lesson planner. Follow the confirmed requirements in README.md and docs/DATA.md.
- Use the existing checkout. Cloud tasks already run in an isolated environment; do not create a Git worktree unless explicitly requested.
- Read docs/DATA.md before editing lesson records. All real records live in data/planner.json. Never treat .local/planner.json test/demo data as real records.
- For natural-language data edits, fetch the latest configured remote branch before editing, preserve unrelated records, IDs and createdAt timestamps, and run `npm run validate:data`. Resolve relative dates in Asia/Seoul. Ask only when the intended lesson or required field cannot be inferred.
- Do not invent achievement criteria or student feedback. Keep a unit's design blank unless the teacher explicitly supplies it. Use only classroom-level feedback.
- Do not force push to bypass simultaneous web edits. Reconcile the latest remote file and repeat validation. The website sees only committed changes pushed to its configured GitHub data branch.
- For code changes, run `npm test`, `npm run build`, and `npm run typecheck`. For UI/storage changes, also run `npm run test:e2e` with Chromium installed; `CHROMIUM_EXECUTABLE=/usr/bin/chromium` uses the system browser here.
- LOCAL_DEMO=true is exclusively for local development and is disabled by code in production. Do not weaken authentication for a deployed preview.
- Never commit OAuth secrets, session keys, .env.local, .local contents, or access tokens. GitHub repository privacy does not by itself restrict a deployed website.
