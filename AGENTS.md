<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Kept: rules for agents working in this repo

This is a private, single-user personal finance app (Next.js 16, Prisma 7, SQLite locally or Postgres on Vercel +
Neon). **Read `README.md` → "For AI agents: start here" first.** It is the runbook for launching and changing it.

Commands: `npm install` · `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test`
(Node 22.x only; check `node -v`). All three checks must pass before you call anything done. A push to `main` deploys.

Non-negotiable:

- **It is someone's money.** Never weaken sign-in, never print/log/commit secrets (`DATABASE_URL`, `APP_PASSWORD`,
  `AUTH_SECRET`), never touch a database you did not create. `.env*` stays git-ignored.
- **Money is decimal** (exact strings in the database, `Decimal` in code), never `number`. Balances are never stored,
  only derived from transactions.
- **Every write goes through `src/server/services/*`** (validate → simulate → write + audit row in one transaction),
  and every successful server action calls `revalidatePath("/", "layout")`.
- **Postgres has no implicit row order:** end every `findMany` with an `id` order.
- **A schema change needs both migrations:** `npm run db:migrate` (SQLite) and `npm run db:migrate:pg -- name`
  (Postgres); commit both plus `prisma/postgres/applied.schema.prisma`.
- **Keep both sign-in layers** (`src/proxy.ts` and `requireSession()` in `currentDb()`), keep `AUTH_SECRET`
  mandatory, and leave the wrong-try limit (`src/server/login-guard.ts`) alone.
- **Next.js 16 differs from older versions:** read `node_modules/next/dist/docs/` before touching routing, caching,
  the proxy, metadata or prefetching.
- **Phone-first and minimal.** Check light, dark and a ~400 px width. For home-screen behaviour (manifest, status
  bar, downloads, tab bar) test in the iOS Simulator too; see README for the pitfalls already found.
