# Kept: a private personal finance & savings app

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffatihadisov%2Fkept-template&env=DATABASE_URL,APP_PASSWORD,AUTH_SECRET&envDescription=A%20Neon%20Postgres%20address%2C%20your%20sign-in%20code%20%284%2B%20characters%29%20and%20a%20long%20random%20secret%20%2816%2B%20characters%29&envLink=https%3A%2F%2Fgithub.com%2Ffatihadisov%2Fkept-template%23environment-variables&project-name=kept&repository-name=kept)

A one-person finance app that answers five questions the moment you open it:
**how much money you have, where it is, which salary it came from, what you spent, and what you kept.**

Everything you don't spend counts as savings. Two or more income streams stay separate all the way through
(converting dollars to local currency, paying with cash, moving money between cards), so you can always see how
much of what you hold came from which salary. It works as an iPhone home-screen app, in light and dark mode, and
its data is yours: one private database, one sign-in code, no third-party tracking, no card numbers or bank
credentials, ever.

**Free to run:** Vercel (hosting) + Neon (Postgres) + this code. About 10 minutes to launch your own copy.

> **This repository is a public template. Your copy must be private.** Click **Use this template** (or the
> Deploy button above) and make sure the new repository is **private**. Your copy holds nothing secret in
> git (settings live in Vercel), but it is your finances: keep the repository and its web address to yourself.

**Contents:** [What's inside](#whats-inside) · [Launch your own copy](#launch-your-own-copy) ·
[For AI agents: start here](#for-ai-agents-start-here) · [Run it locally](#run-it-locally) ·
[Environment variables](#environment-variables) · [Scripts](#scripts) · [How it works](#how-it-works) ·
[The money model](#the-money-model) · [Changing the app](#changing-the-app) · [Security](#security) ·
[Backups and moving data](#backups-and-moving-data) · [Updating your copy](#updating-your-copy-when-the-template-changes) ·
[Troubleshooting](#troubleshooting) · [Ideas to build next](#ideas-to-build-next)

---

## What's inside

- **Overview:** total money, saved this month, available to spend, where it came from (per salary), main goal.
- **Activity:** every entry, with filters, a calendar and CSV export.
- **Wallets & cards:** balances, "Update balance" to match your bank, exchange between currencies with a custom
  rate and fees (for example a card withdrawal where the bank's rate differs from the market).
- **Income:** each salary on its own, with its pay schedule and "expected vs received".
- **Savings & goals:** "Save everything left" by default (other strategies optional); goals *reserve* money, they
  never spend it.
- **Analytics, budgets, recurring bills, categories**, an activity log of every change, backup/restore.
- **Sign-in:** one code, with a limit on wrong tries; installable on an iPhone home screen; the 4-digit case gets
  the phone's number pad and signs in by itself after the last digit.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Recharts · Prisma 7 with SQLite
(local) or Postgres (hosted) · Zod · decimal.js · Vitest.

---

## Launch your own copy

You need free accounts at **GitHub**, **Vercel** and **Neon**. (Node.js is only needed to run or change the code
on your computer.)

1. **Make your copy of the code.** On this page click **Use this template → Create a new repository**. Name it
   anything, and choose **Private**.
2. **Create the database (Neon).** At [neon.com](https://neon.com) create a project and pick the region closest to
   you. In the project, open **Connect**, turn **Connection pooling** on, and copy the connection string (it starts
   with `postgresql://` and contains `-pooler`). If it ends with `&channel_binding=require`, delete that part.
3. **Create the website (Vercel).** At [vercel.com](https://vercel.com) choose **Add New… → Project** and import your
   private copy. Before pressing **Deploy**, add three **Environment Variables** (see
   [Environment variables](#environment-variables)):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon string from step 2 |
   | `APP_PASSWORD` | the code you will type to sign in: at least 4 characters. A 4-digit code works; 6 digits or more is safer |
   | `AUTH_SECRET` | any long random text, 16+ characters. Make one with `openssl rand -hex 32` |

   Turn **Sensitive** on for all three if Vercel offers it (the values then can't be read back later), and leave
   *Preview* and *Development* unticked so only Production can reach your data.
4. **Pick the server region.** In the Vercel project: **Settings → Functions → Function Region**, choose the one
   nearest your Neon region (for example Frankfurt for `eu-central-1`). This keeps every page fast. Then **Redeploy**
   if the first build already ran.
5. **Deploy and open it.** The first build creates the tables in your database by itself. Open the address Vercel
   shows you and sign in with `APP_PASSWORD`.
6. **First run: set your currency and time zone before adding anything.** Open **Settings → General**. The
   defaults are AZN and Asia/Baku (the app was built in Baku) and **the reporting currency locks as soon as the first
   account exists**. Then add where your money is (Wallets → add), then your incomes, then record an expense.
7. **Put it on your phone.** On an iPhone open the address in **Safari → Share → Add to Home Screen** and leave
   *Open as Web App* on. It opens full screen from its own icon. (It keeps its own sign-in, separate from Safari.)
8. **Lock down your accounts.** See the [security checklist](#security-checklist).

The plain-language version of these steps, with what to do if something goes wrong, is in [DEPLOY.md](DEPLOY.md);
a short how-to for daily use is in [GUIDE.md](GUIDE.md).

---

## For AI agents: start here

You are probably reading this because a person asked you to set up or extend **their own copy** of Kept. This is
your runbook. The rest of this file is reference.

### Ground rules (read these first)

1. **It is someone's money.** Never weaken sign-in to "make something work". Never print, log, commit or paste
   secrets (`DATABASE_URL`, `APP_PASSWORD`, `AUTH_SECRET`, tokens). Ask the person to type secrets into Vercel and
   Neon themselves; do not put them in files you commit. `.env*` is git-ignored: keep it that way.
2. **Never touch a database you did not create.** `npm run db:import`, `TEST_DATABASE_URL`, and migrations
   act on whatever `DATABASE_URL` points at. For tests use a throw-away database or Neon branch, never real data.
3. **Node 22.x and npm.** Check `node -v` first (a shell's default `node` is often older). Do not switch to pnpm or
   yarn, and keep Prisma at the pinned version.
4. **This is Next.js 16, not the one you remember.** Before changing routing, caching, the proxy, metadata or
   prefetching, read the matching guide in `node_modules/next/dist/docs/`. (`middleware` is now `proxy`; see
   `src/proxy.ts`.) `AGENTS.md` has the standing rules.
5. **Verify before saying "done":** `npm run typecheck && npm run lint && npm test` must pass, and for anything
   visible, look at it on a phone-sized screen in light and dark mode.

### What to ask the person for

- Their GitHub account, with a **private** copy of this template (not the public template itself).
- A Vercel account and a Neon account (both free) and which Neon **region** they chose.
- The **sign-in code** they want (recommend 6 digits; 4 is allowed) and the **reporting currency and time zone**
  (the currency can't be changed after the first account is added).
- Whether they will use it on an iPhone (then walk them through Add to Home Screen).

### Steps

| # | Step | Who |
| --- | --- | --- |
| 1 | `node -v` is 22.x; `npm install`; `npm run typecheck && npm run lint && npm test` all pass | you |
| 2 | Create the Neon project, copy the **pooled** string, remove `channel_binding=require` | person (you guide) |
| 3 | In Vercel import the private repo, add `DATABASE_URL`, `APP_PASSWORD`, `AUTH_SECRET` for **Production only**, mark them Sensitive | person (you guide) |
| 4 | Set the Vercel Function Region to match the Neon region | person (you guide) |
| 5 | Deploy; read the build log for `Applied 1 migration(s)` (first deploy) or `Postgres database is up to date.` | you / person |
| 6 | Verify the deployment (below) | you |
| 7 | First run in the app: Settings → General → currency and time zone, **then** accounts, incomes, first expense | person (you guide) |
| 8 | iPhone: Add to Home Screen; then the [security checklist](#security-checklist) | person (you guide) |

Credentials are the person's to enter. If you have the Vercel or Neon CLI logged in, you may use it, but show the
person what you are about to do first.

### Verify a deployment (replace `$URL`)

```bash
curl -s -o /dev/null -w "%{http_code}\n"               $URL/login                # 200
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $URL/                   # 307 -> /login (locked, as it should be)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $URL/api/export/backup  # 307 -> /login (downloads are locked too)
curl -s -o /dev/null -w "%{http_code}\n"               $URL/manifest.webmanifest # 200 (public on purpose)
curl -s $URL/robots.txt                                                          # Disallow: /
```

If `/` returns 200 without signing in, **stop**: something is wrong with the sign-in setup. If the login page says
"Kept isn't ready yet", it names what is missing (a code under 4 characters, or a secret under 16).

### Where things live

```
prisma/schema.prisma        the data model (SQLite flavour; the single source of truth)
prisma/migrations/          SQLite migrations (applied by the app itself on start)
prisma/postgres/            derived Postgres schema (generated, git-ignored), Postgres migrations, and
                            applied.schema.prisma (a committed snapshot that the migration generator diffs against)
scripts/                    prisma-generate, migrate-pg (runs at every Vercel build), pg-migration, import-backup,
                            demo seed, make-icons
src/lib/finance/            the accounting engine: pure TypeScript, no I/O (money, ledger, rates, stats, savings,
                            forecast, recurrence, periods, dates…). Its only dependency is decimal.js
src/lib/                    config (app name), validation (Zod), session-token (cookie signing, auth mode),
                            download helpers, formatting
src/server/                 db.ts (two Prisma clients behind one type), migrate.ts / migrate-pg.ts, session.ts
                            (currentDb, getState), auth.ts (requireSession), login-guard.ts (the wrong-try limit),
                            load.ts (read everything), base.ts (first-run rows), services/* (every write)
src/app/                    routes. (app)/ holds Overview, Activity, Income, Wallets, Savings, Analytics,
                            Settings; plus login, welcome, api/export/*, manifest.ts, actions.ts (server actions)
src/proxy.ts                the front door: sends anyone without a valid session to /login
src/components/             UI: shell/ (sidebar, bottom tab bar, top bar), transaction/ (the add flow), ui/
                            (primitives), and one folder per page
tests/                      engine/ (pure maths), integration/ (services against real temporary databases), auth
public/icons                home-screen icons (regenerate with scripts/make-icons.mjs)
```

### Rules of this codebase (break these and money goes wrong)

- **Money is decimal, never `number`.** Amounts and rates are exact decimal *strings* in the database and `Decimal`
  (decimal.js) in code. Rounding is half-up, only at the currency's minor unit, only when shown or stored.
- **Every write goes through a service** in `src/server/services/*`: validate, simulate in memory, warn about
  overdrafts or odd rates, then write the change together with an audit-log row in one transaction. Server actions
  (`src/app/actions.ts`) call `revalidatePath("/", "layout")` after success; that is what keeps the app's
  client-side page cache fresh. Keep that line in every new mutation path.
- **Balances are never stored.** They are derived from transactions (`src/lib/finance/ledger.ts`), so edits and
  back-dated entries can't leave a stale balance. Don't add stored totals.
- **Postgres returns rows in no particular order.** End every `findMany` with an `id` order. (SQLite hides this bug.)
- **Two databases, one schema.** `DATABASE_URL` unset or `file:…` means SQLite; `postgres(ql)://…` means hosted
  Postgres. Two Prisma clients are generated from the same schema by `scripts/prisma-generate.mjs` (it runs on
  `postinstall`); `src/generated/` and `prisma/postgres/schema.prisma` are generated and git-ignored.
- **Sign-in has two layers on purpose:** `src/proxy.ts` (quick redirect) and `requireSession()` inside `currentDb()`
  (nothing is read or written without a session). Keep both. The cookie is signed with `AUTH_SECRET`, which is
  **required**: without it a short code could be bypassed by forging the cookie. The wrong-try limit (`LoginGuard`
  table) claims a try with a compare-and-swap *before* the code is checked, so parallel guesses can't sneak
  through. Don't "simplify" either.
- **iPhone home-screen app:** the manifest deliberately has no `theme_color`/`background_color` (iOS paints the strip
  behind the clock from the page's own colour at launch). Download links use `DownloadLink` (the share sheet),
  because a plain download link strands a full-screen app on a file page with no way back. Bottom-bar tabs use
  `prefetch` plus `src/app/(app)/loading.tsx`, so taps feel instant; every save drops the cache.
- **Design:** phone-first, minimal, few inputs, one focal point per screen, soft rounded type. Colours are tokens in
  `src/app/globals.css` (light and dark). Check light, dark and a ~400 px width. Avoid generic dashboard looks.

### Recipes

- **Change the data model:** edit `prisma/schema.prisma`, then make *both* migrations: `npm run db:migrate` (SQLite;
  by default this touches `data/finance.db`, so point `DATABASE_URL` at a scratch file if that has real data) and
  `npm run db:migrate:pg -- short_name` (writes `prisma/postgres/migrations/…` and refreshes
  `applied.schema.prisma`). Commit all three. The Vercel build applies the Postgres migration by itself.
- **Another default currency or time zone:** `prisma/schema.prisma` (`Settings` defaults) and the first migration
  files (`DEFAULT 'AZN'`, `DEFAULT 'Asia/Baku'` in both `prisma/migrations/*/migration.sql` and
  `prisma/postgres/migrations/*/migration.sql`), the fallbacks in `src/server/base.ts` and `src/server/load.ts`,
  the colour in `src/lib/defaults.ts`, the zone list in `src/app/(app)/settings/page.tsx`. Many tests assume AZN as
  the reporting currency, so update those fixtures too (search for `"AZN"` in `tests/`). Only do this before the
  database holds real data.
- **Rename the app / change colours:** `src/lib/config.ts` (name, tagline) and `src/app/globals.css` (tokens);
  regenerate the home-screen icons with `node scripts/make-icons.mjs` after editing `src/app/icon.svg`.
- **Add a page:** create `src/app/(app)/<name>/page.tsx` (it inherits the layout, the loading skeleton and the
  sign-in lock), and add it to `src/components/shell/nav.ts` and the `TABS`/`MORE` lists in `mobile-nav.tsx`.
- **Test on Postgres as well:** `TEST_DATABASE_URL="postgresql://…" npm test` (a throw-away database only). Each test
  gets a private schema `kept_test_*` and drops it afterwards.

---

## Run it locally

Needs Node.js 22.

```bash
npm install        # also generates the two Prisma clients
npm run dev        # http://localhost:3000
```

The database is one SQLite file (`data/finance.db`), created and migrated on first start. The first visit shows a
welcome screen: **Start with my own data**, or **Explore with demo data** (about eight months of invented data in a
*separate* file; local only).

To use it from a phone on your Wi-Fi: `npm run build && npm start -- -H 0.0.0.0 -p 3000`, then open
`http://<your-computer>:3000`. **Local mode has no sign-in unless you set `APP_PASSWORD` and `AUTH_SECRET`** in `.env`
(see [`.env.example`](.env.example)), so set them before exposing it to any network you don't fully trust.

---

## Environment variables

| Variable | Needed | What it does |
| --- | --- | --- |
| `DATABASE_URL` | hosted | Unset or `file:./data/finance.db` → local SQLite. A `postgresql://…` address → hosted Postgres (this switches the app into **hosted mode**, which requires the next two). Use Neon's **pooled** string. |
| `APP_PASSWORD` | hosted (optional locally) | The code that opens the app. At least 4 characters. When set locally it turns the sign-in on. |
| `AUTH_SECRET` | with `APP_PASSWORD` | Random text, at least 16 characters, that signs the sign-in cookie. Required whenever a code is set. Changing it (or the code) signs every device out. |
| `FINANCE_DB` | no | Override the SQLite file location (scratch runs, tests). |
| `FINANCE_DEMO_DB` | no | Override the demo database file. |
| `TEST_DATABASE_URL` | no | A **throw-away** Postgres database for running the test suite against Postgres. |
| `FINANCE_MIGRATIONS_DIR`, `KEPT_PG_MIGRATIONS_DIR` | no | Migration folder overrides (used by tests). |
| `VERCEL`, `VERCEL_ENV` | set by Vercel | The build uses them: previews never touch the database; a production build **fails loudly** if the code or secret is missing or too short. |

Hosted mode means `VERCEL` is set or `DATABASE_URL` is a Postgres address. In hosted mode the app refuses to serve
anything until `APP_PASSWORD` and `AUTH_SECRET` are valid (the login page says what is missing).

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` (`npm run test:watch`) | The test suite (about 190 tests; a fresh SQLite file per test) |
| `npm run build:vercel` | What Vercel runs: migrate the Postgres database, then `next build` |
| `npm run db:deploy:pg` | Create/update the tables in the hosted database (also runs inside `build:vercel`) |
| `npm run db:migrate` | After editing `prisma/schema.prisma`: create the SQLite migration and regenerate the clients |
| `npm run db:migrate:pg -- name` | The matching Postgres migration |
| `npm run db:import -- backup.json` | Load a backup into the **hosted** database (replaces its data; refuses a local file) |
| `npm run db:demo` | Rebuild the demo database (never the real one) |
| `npm run db:studio` | Browse the local database in Prisma Studio |
| `npm run setup` | Create/migrate the local database explicitly |

---

## How it works

- **One person, one code.** There are no accounts. A signed cookie (`kept_session`, 90 days, HttpOnly) proves "this
  browser entered the code". After **5 wrong tries** sign-in pauses for 15 minutes; once the pause is over, each
  further wrong try pauses it again until the right code is entered (a quiet day or a changed code starts afresh).
  Even the right code is refused during a pause; devices already signed in aren't affected. The count lives in the
  database (`LoginGuard`).
- **Data model** (`prisma/schema.prisma`): `Settings`, `Account`, `IncomeSource`, `Category`, `Transaction` (+
  `TransactionAllocation`), `ExchangeRate`, `Goal` (+ `GoalAllocation`), `Budget`, `RecurringPayment`, `AuditLog`,
  `LoginGuard`. Money columns are decimal strings; dates are plain `YYYY-MM-DD` in the user's time zone.
- **Reading:** every page asks `getState()` (`src/server/session.ts`), which loads all rows once per request
  (`loadAppData`), builds the ledger with the pure engine and derives what the page shows.
- **Writing:** a server action → a service → validate, simulate, write + audit row in one transaction →
  `revalidatePath`.
- **Migrations:** the app applies SQLite migrations itself on start (`src/server/migrate.ts`); Postgres migrations
  run at every Vercel build (`scripts/migrate-pg.ts`, safe to run twice, takes a lock so two deploys can't collide).
- **Hosted builds are strict on purpose:** a production build fails with a clear message if `DATABASE_URL`,
  `APP_PASSWORD` or `AUTH_SECRET` is missing, rather than deploying an unprotected app.

---

## The money model

Every posting touches **two axes at once**: *which account holds it* and *which income it came from*.

- **Account balance** = everything posted to that account. **Income balance** = everything attributed to that
  income. Both add up to the same grand total, always.
- **Existing funds:** money you already had when you started (opening balances) belongs to a built-in source called
  *Existing funds*. It is never counted as income.
- **Spending** reduces the account you paid from *and* the incomes that funded it. By default the split follows what
  that account currently holds ("auto"); you can split a purchase by hand ("Funded by").
- **Transfers and exchanges are not spending.** Moving money, or converting USD to local currency, keeps its income
  attribution. A bank's worse-than-usual rate is shown as "lost to exchange rates", **not** as a fee; only
  commissions you enter are fees.
- **Refunds** reverse the original purchase (never counted as income) and go back to the incomes it was paid from.
- **Savings** = income − spending − fees. Total savings is everything you own and haven't spent; a monthly figure is
  that month's slice. Currency-rate moves are shown separately and never look like earnings.
- **Goals reserve money, they don't spend it.** Reserving 500 for a trip lowers *Available to spend*, never your total.
- **Expected pay is a promise, not money.** An income only counts once you record that it arrived (late, partial,
  early or a different amount are all fine; each payment is matched to the due date it settles). Pay dates on or
  before the receiving account's opening-balance date are not "expected": the opening balance already holds them.

**Currencies.** One reporting currency (locked once accounts exist, because every historical value is stored in it).
Rates are effective-dated and **frozen onto each entry**: changing today's rate never rewrites the past. Each
direction (USD→AZN, AZN→USD) has its own rate, a card can have a preferred rate, and any single entry can override it.

**Numbers.** Half-up rounding at the currency's minor unit; splits use largest-remainder distribution so parts
always add up to the whole to the last cent. Dates are calendar dates in your time zone, so nothing shifts around
midnight or daylight-saving changes.

---

## Changing the app

See the agent [recipes](#recipes) above (they work for people too). Two habits worth having:

1. Run `npm run typecheck && npm run lint && npm test` before every push. A push to `main` deploys to production.
2. If you change the data model, commit **both** migrations and `prisma/postgres/applied.schema.prisma`.

The tests cover what matters for money: decimal maths and splits, calendar logic, recurrence, the rate book, the
ledger and its invariants (randomised ledgers must always foot; replaying history is deterministic; wealth
reconciles to income − spending − fees + revaluation), savings and strategy maths, forecasting, the add-form logic,
the whole service layer against real temporary databases (migrations, validation, overdraft warnings, edit/delete
with audit trail, backup/restore), sign-in (cookie signing, the wrong-try limit and its parallel-guess behaviour),
and the home-screen setup.

---

## Security

### How it protects you

- Nothing is served without signing in: no page, no download, no action. The home-screen manifest and icons are the
  only public files (they hold nothing private).
- The cookie can't be forged without `AUTH_SECRET`; a wrong code can only be tried a few times per pause.
- Search engines are told to stay away (`robots.txt`, `X-Robots-Tag`), pages can't be framed, and previews never
  touch the database.

### Security checklist

- [ ] Your copy of the repository is **private**, and so is your web address.
- [ ] **2-step verification** on GitHub, Vercel and Neon. Those accounts are the real keys to everything.
- [ ] `DATABASE_URL`, `APP_PASSWORD` and `AUTH_SECRET` are set for **Production only** and marked **Sensitive**.
- [ ] If your database password ever appeared in a chat, a screenshot or a log, reset it in Neon, update
      `DATABASE_URL` in Vercel and redeploy.
- [ ] A 4-digit code is fine while the address stays private. If you ever share the address, use 6+ digits.
- [ ] Download a backup now and then (**Settings → Your data**) and keep it somewhere safe.
- [ ] Forgot the code or locked out? Change `APP_PASSWORD` in Vercel and redeploy: that clears any pause and signs
      every device out.

---

## Backups and moving data

**Settings → Your data** has *Download backup* (one JSON file with everything), *Restore from a backup*
(all-or-nothing; a copy is kept first locally) and CSV exports. To move a local database to the hosted one:

```bash
DATABASE_URL="postgresql://…direct (non-pooled) connection…" npm run db:import -- path/to/backup.json
```

This **replaces** what the hosted database holds. After you start using the hosted copy, keep using only that one:
the local file won't see new entries.

---

## Updating your copy when the template changes

"Use this template" gives you a copy with its own history, so there is no automatic link back. To pull in later
improvements:

```bash
git remote add template https://github.com/fatihadisov/kept-template.git
git fetch template
git merge template/main --allow-unrelated-histories   # resolve conflicts, run the checks, push
```

If you would rather track updates easily from the start, **fork** the template instead of using it as a template
(and make the fork private).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build says `DATABASE_URL is missing or is not a Postgres address` | Add `DATABASE_URL` for **Production** in Vercel, redeploy. |
| Build says `APP_PASSWORD is not set` / `is too short` | Add or lengthen `APP_PASSWORD` (4+ characters), redeploy. |
| Build says `AUTH_SECRET is missing or too short` | Add a 16+ character `AUTH_SECRET` (`openssl rand -hex 32`), redeploy. |
| The page says "Kept isn't ready yet" | The page names what is missing; fix it in Vercel and redeploy. |
| "Too many wrong tries" | Wait for the pause to end, or change `APP_PASSWORD` in Vercel and redeploy. |
| First page after a quiet spell takes 1–2 seconds | The free database naps when idle and wakes on the first request. Normal. |
| Pages are slow every time | The Vercel Function Region doesn't match the Neon region: set it (Launch step 4). |
| `npm install` fails on `better-sqlite3`, or a type error about a missing Prisma client | You are not on Node 22. Switch with `nvm use 22`, delete `node_modules`, and run `npm install` again. |
| Tests against Postgres leave schemas behind | Drop any `kept_test_*` schemas from the throw-away database. |
| An iPhone icon added earlier shows an old name or look | Delete the icon (press and hold → Remove App) and add it again. |

---

## Ideas to build next

- **Sign in with a one-time code from Telegram** (free through a bot): a fresh code per sign-in, sent only to your
  own Telegram, with an alert on every new sign-in and a "sign out all devices" button.
- **A practice copy**: a separate deployment with sample data and a step-by-step guide, for showing the app to a
  friend without any real data anywhere near it.
- **Environment-based defaults** for reporting currency and time zone, so a new copy never starts on the wrong one.
- **iPhone extras:** Shortcuts, widgets, a Face ID lock through a small native wrapper.
- If you want to share one running copy with other people, give **each person their own copy** (own Vercel project and
  database). Hosting several people's finances in one app needs strong isolation and a privacy promise; it is a
  different project from this one.

---

## License

MIT, see [LICENSE](LICENSE). Use it, change it, share it. Please keep your own copy private.
