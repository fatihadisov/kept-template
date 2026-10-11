import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { audit } from "../audit";
import type { Db, Tx } from "../db";
import { ValidationError } from "../errors";

export const BACKUP_FORMAT = 1;

const rows = z.array(z.record(z.string(), z.unknown()));
const backupSchema = z.object({
  app: z.literal("kept"),
  format: z.number().int().min(1).max(BACKUP_FORMAT),
  exportedAt: z.string(),
  tables: z.object({
    settings: rows,
    accounts: rows,
    incomeSources: rows,
    categories: rows,
    exchangeRates: rows,
    transactions: rows,
    goals: rows,
    budgets: rows,
    recurringPayments: rows,
    auditLog: rows,
  }),
});
export type BackupFile = z.infer<typeof backupSchema>;

/** Complete, human-readable JSON backup: every table, every link, every historical rate. */
export async function exportBackup(db: Tx): Promise<BackupFile> {
  const [settings, accounts, incomeSources, categories, exchangeRates, transactions, goals, budgets, recurringPayments, auditLog] =
    await Promise.all([
      db.settings.findMany(),
      db.account.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      db.incomeSource.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      db.category.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      db.exchangeRate.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      db.transaction.findMany({ include: { allocations: { orderBy: { id: "asc" } } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
      db.goal.findMany({ include: { allocations: { orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      db.budget.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      db.recurringPayment.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      db.auditLog.findMany({ orderBy: [{ at: "asc" }, { id: "asc" }] }),
    ]);
  const plain = <T,>(x: T) => JSON.parse(JSON.stringify(x)) as Record<string, unknown>[];
  return {
    app: "kept",
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    tables: {
      settings: plain(settings),
      accounts: plain(accounts),
      incomeSources: plain(incomeSources),
      categories: plain(categories),
      exchangeRates: plain(exchangeRates),
      transactions: plain(transactions),
      goals: plain(goals),
      budgets: plain(budgets),
      recurringPayments: plain(recurringPayments),
      auditLog: plain(auditLog),
    },
  };
}

const asDate = (v: unknown): Date | undefined => (typeof v === "string" || typeof v === "number" ? new Date(v) : undefined);
// Rows come from the same Prisma models, so they are re-inserted as-is minus the nested relations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const without = (row: any, ...keys: string[]): any => {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy;
};

export interface RestoreSummary {
  accounts: number;
  transactions: number;
  goals: number;
  safetyCopy: string | null;
}

/**
 * Replace ALL data with the contents of a backup. Runs in a single database transaction (all or
 * nothing) and first keeps a copy of the current database file next to it.
 */
export async function restoreBackup(db: Db, input: unknown, opts: { dbFile?: string } = {}): Promise<RestoreSummary> {
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("That file isn't a backup made by this app.", { file: parsed.error.issues[0]?.message ?? "Invalid backup" });
  }
  const t = parsed.data.tables;
  if (t.settings.length === 0) throw new ValidationError("The backup has no settings and looks incomplete.", { file: "Incomplete backup" });

  let safetyCopy: string | null = null;
  if (opts.dbFile && fs.existsSync(/*turbopackIgnore: true*/ opts.dbFile)) {
    const dir = path.join(path.dirname(opts.dbFile), "backups");
    fs.mkdirSync(dir, { recursive: true });
    safetyCopy = path.join(dir, `before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
    fs.copyFileSync(opts.dbFile, safetyCopy);
  }

  // Prisma's generated create types are strict; the backup rows came from the same models, so we cast.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  await db.$transaction(
    async (tx) => {
      await tx.auditLog.deleteMany();
      await tx.goalAllocation.deleteMany();
      await tx.goal.deleteMany();
      await tx.budget.deleteMany();
      await tx.transactionAllocation.deleteMany();
      await tx.transaction.updateMany({ data: { refundOfId: null } });
      await tx.transaction.deleteMany();
      await tx.recurringPayment.deleteMany();
      await tx.exchangeRate.deleteMany();
      await tx.incomeSource.deleteMany();
      await tx.category.deleteMany();
      await tx.account.deleteMany();
      await tx.settings.deleteMany();

      const s = t.settings[0] as any;
      await tx.settings.create({ data: { ...s, onboardedAt: asDate(s.onboardedAt) ?? null, updatedAt: asDate(s.updatedAt) ?? new Date() } });
      await tx.account.createMany({ data: t.accounts.map((r: any) => ({ ...r, createdAt: asDate(r.createdAt), updatedAt: asDate(r.updatedAt) })) });
      await tx.category.createMany({ data: t.categories.map((r: any) => ({ ...r, createdAt: asDate(r.createdAt) })) });
      await tx.incomeSource.createMany({ data: t.incomeSources.map((r: any) => ({ ...r, createdAt: asDate(r.createdAt), updatedAt: asDate(r.updatedAt) })) });
      await tx.recurringPayment.createMany({ data: t.recurringPayments.map((r: any) => ({ ...r, createdAt: asDate(r.createdAt) })) });
      await tx.exchangeRate.createMany({ data: t.exchangeRates.map((r: any) => ({ ...r, createdAt: asDate(r.createdAt) })) });
      await tx.goal.createMany({ data: t.goals.map((r: any) => ({ ...without(r, "allocations"), createdAt: asDate(r.createdAt) })) });
      await tx.goalAllocation.createMany({
        data: t.goals.flatMap((g: any) => (g.allocations ?? []).map((a: any) => ({ ...a, createdAt: asDate(a.createdAt) }))),
      });
      await tx.budget.createMany({ data: t.budgets.map((r: any) => ({ ...r, createdAt: asDate(r.createdAt) })) });

      // transactions: originals first, then link refunds (a refund references its expense)
      await tx.transaction.createMany({
        data: t.transactions.map((r: any) => ({
          ...without(r, "allocations", "refundOfId"),
          createdAt: asDate(r.createdAt),
          updatedAt: asDate(r.updatedAt),
        })),
      });
      for (const r of t.transactions as any[]) {
        if (r.refundOfId) await tx.transaction.update({ where: { id: r.id }, data: { refundOfId: r.refundOfId } });
      }
      await tx.transactionAllocation.createMany({
        data: t.transactions.flatMap((r: any) => (r.allocations ?? []).map((a: any) => ({ ...a }))),
      });
      await tx.auditLog.createMany({ data: t.auditLog.map((r: any) => ({ ...r, at: asDate(r.at) })) });
      await audit(tx, {
        entity: "Backup",
        entityId: "restore",
        action: "IMPORT",
        summary: `Restored backup from ${parsed.data.exportedAt.slice(0, 10)}: ${t.accounts.length} accounts, ${t.transactions.length} transactions`,
      });
    },
    { timeout: 60_000, maxWait: 60_000 },
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { accounts: t.accounts.length, transactions: t.transactions.length, goals: t.goals.length, safetyCopy };
}
