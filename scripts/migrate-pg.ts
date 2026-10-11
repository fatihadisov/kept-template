/**
 * npm run db:deploy:pg — creates / updates the tables in the hosted Postgres database (DATABASE_URL).
 * It also runs at the start of every Vercel production build (npm run build:vercel).
 *
 * Safe by design: previews never touch the database, and a production build fails loudly (instead of
 * quietly deploying something broken or unprotected) when the settings it needs are missing.
 */
import "dotenv/config";
import { authMode } from "../src/lib/session-token";
import { migratePostgres } from "../src/server/migrate-pg";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const onVercel = Boolean(process.env.VERCEL);
  const vercelEnv = process.env.VERCEL_ENV; // production | preview | development

  if (onVercel && vercelEnv !== "production") {
    console.log(`Vercel ${vercelEnv ?? "non-production"} build: leaving the database alone.`);
    return;
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    if (onVercel) {
      throw new Error(
        "DATABASE_URL is missing or is not a Postgres address. In Vercel: Settings → Environment Variables → add DATABASE_URL (your Neon connection string) for Production, then redeploy.",
      );
    }
    console.log("DATABASE_URL is not a Postgres address, so there is nothing to migrate (Kept is using local SQLite files).");
    return;
  }

  if (onVercel) {
    const mode = authMode(process.env);
    if (mode.kind === "misconfigured") {
      throw new Error(
        `${mode.reason} This app has no other protection, so it refuses to deploy like this. In Vercel: Settings → Environment Variables → set APP_PASSWORD and AUTH_SECRET for Production, then redeploy.`,
      );
    }
  }

  const { applied } = await migratePostgres(url);
  console.log(applied.length ? `Applied ${applied.length} migration(s): ${applied.join(", ")}` : "Postgres database is up to date.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
