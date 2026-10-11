import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildLedger } from "@/lib/finance/ledger";
import { snapshotAt } from "@/lib/finance/queries";
import type { Db } from "@/server/db";
import { closeDb, openDb, openPostgres, postgresKey, removeDbFiles } from "@/server/db";
import { ledgerInputOf, loadAppData } from "@/server/load";
import { dropTestSchema, migratePostgres } from "@/server/migrate-pg";
import { createAccount } from "@/server/services/accounts";
import { createIncomeSource } from "@/server/services/income";
import { addRate } from "@/server/services/rates";
import { makeCtx } from "@/server/services/context";

/**
 * The same suite runs against either database:
 *   npm test                                  -> a fresh SQLite file per test (the default)
 *   TEST_DATABASE_URL=postgres://… npm test   -> a fresh, private schema per test in that Postgres database
 * Point TEST_DATABASE_URL at a throw-away branch, never at the database that holds real data.
 */
export const onPostgres = Boolean(process.env.TEST_DATABASE_URL);

export interface TempDb {
  db: Db;
  /** SQLite only: the database file */
  file: string | null;
  /** like restarting the app: closes the connection and opens the same database again */
  reopen: () => Promise<Db>;
  /** what restoreBackup should be told about where the database lives */
  restoreOptions: { dbFile?: string };
  dispose: () => Promise<void>;
}

/** A brand-new migrated database: a SQLite file in the OS temp dir, or a private Postgres schema. Removed when done. */
export async function tempDb(label = "t"): Promise<TempDb> {
  if (onPostgres) {
    const url = process.env.TEST_DATABASE_URL as string;
    const schema = `kept_test_${label.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 20)}_${randomBytes(4).toString("hex")}`;
    await migratePostgres(url, { schema });
    const key = postgresKey(url, schema);
    const open = () => openPostgres(url, { schema, max: 8 });
    const db = await open();
    return {
      db,
      file: null,
      reopen: async () => {
        await closeDb(key);
        return open();
      },
      restoreOptions: {},
      dispose: async () => {
        await closeDb(key);
        await dropTestSchema(url, schema);
      },
    };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kept-${label}-`));
  const file = path.join(dir, "test.db");
  const db = await openDb(file);
  return {
    db,
    file,
    reopen: async () => {
      await closeDb(file);
      return openDb(file);
    },
    restoreOptions: { dbFile: file },
    dispose: async () => {
      await removeDbFiles(file);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export { closeDb, openDb };

/** The standard fixture used by service tests: USD+AZN cards and cash, two salaries, a USD→AZN rate. */
export async function seedBasics(db: Db) {
  await addRate(db, { from: "USD", to: "AZN", rate: "1.70", effectiveFrom: "2026-01-01" });
  const usdCard = (await createAccount(db, { name: "USD card", type: "CARD", currency: "USD" })).id;
  const aznCard = (await createAccount(db, { name: "AZN card", type: "CARD", currency: "AZN" })).id;
  const cashAzn = (await createAccount(db, { name: "Cash AZN", type: "CASH", currency: "AZN" })).id;
  const cashUsd = (await createAccount(db, { name: "Cash USD", type: "CASH", currency: "USD" })).id;
  const a = (
    await createIncomeSource(db, {
      name: "Salary A",
      currency: "USD",
      expectedAmount: "1000",
      scheduleType: "MONTHLY",
      scheduleDays: [5],
      destinationAccountId: usdCard,
    })
  ).id;
  const b = (
    await createIncomeSource(db, {
      name: "Salary B",
      currency: "AZN",
      expectedAmount: "2000",
      scheduleType: "MONTHLY",
      scheduleDays: [15],
      destinationAccountId: aznCard,
    })
  ).id;
  return { usdCard, aznCard, cashAzn, cashUsd, a, b };
}

/** Engine view of the database as of a date. */
export async function snapshot(db: Db, date: string) {
  const data = await loadAppData(db);
  const ledger = buildLedger(ledgerInputOf(data));
  return { data, ledger, snap: snapshotAt(ledger, date) };
}

export const balanceOf = (snap: Awaited<ReturnType<typeof snapshot>>["snap"], accountId: string) =>
  snap.accounts.find((a) => a.accountId === accountId)!.balance.toFixed(2);

export const sourceValue = (snap: Awaited<ReturnType<typeof snapshot>>["snap"], sourceId: string) =>
  snap.sources.find((s) => s.sourceId === sourceId)!.baseValue.toFixed(2);

export { makeCtx };
