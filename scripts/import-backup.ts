/**
 * npm run db:import -- path/to/backup.json
 *
 * Loads a Kept backup (Settings → Your data → Download backup) into the hosted Postgres database that
 * DATABASE_URL points at: this is how your data moves from your computer to the cloud. It replaces
 * whatever the hosted database holds, so run it once, on purpose.
 *
 * It refuses to run against a local SQLite file, so it can never overwrite your local data by accident.
 */
import "dotenv/config";
import fs from "node:fs";
import { buildLedger } from "../src/lib/finance/ledger";
import { snapshotAt } from "../src/lib/finance/queries";
import { todayIn } from "../src/lib/finance/dates";
import { openMode, usesPostgres } from "../src/server/db";
import { ledgerInputOf, loadAppData } from "../src/server/load";
import { migratePostgres } from "../src/server/migrate-pg";
import { restoreBackup } from "../src/server/services/backup";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run db:import -- <backup.json>");
  if (!usesPostgres()) {
    throw new Error("DATABASE_URL must be a Postgres address. This script only fills the hosted database; use Settings → Restore for your local one.");
  }

  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  await migratePostgres(process.env.DATABASE_URL as string);
  const db = await openMode("real");

  const summary = await restoreBackup(db, backup);
  const data = await loadAppData(db);
  const today = todayIn(data.settings.timezone);
  const snap = snapshotAt(buildLedger(ledgerInputOf(data)), today);

  console.log(`Imported ${summary.accounts} accounts, ${summary.transactions} transactions and ${summary.goals} goals.`);
  console.log(`Total money in the hosted database today (${today}): ${snap.total.toFixed(2)} ${data.settings.baseCurrency}`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
