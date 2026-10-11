import { decimalsOf } from "@/lib/finance/currency";
import { distribute } from "@/lib/finance/distribute";
import { billOccurrences } from "@/lib/finance/forecast";
import { ZERO, dec } from "@/lib/finance/money";
import { type RecurringInputRaw, recurringInput } from "@/lib/validation";
import { audit } from "../audit";
import type { Db } from "../db";
import { billsOf } from "../load";
import { fail, makeCtx, parseInput } from "./context";
import { type WriteOptions, createTransaction } from "./transactions";

function checkShares(shares: Record<string, number> | null | undefined, sources: Set<string>) {
  if (!shares) return null;
  const entries = Object.entries(shares).filter(([, pct]) => pct > 0);
  if (entries.length === 0) return null;
  for (const [id] of entries) if (!sources.has(id)) fail("sourceShares", "Unknown income source");
  const total = entries.reduce((a, [, p]) => a + p, 0);
  if (Math.abs(total - 100) > 0.01) fail("sourceShares", "The shares must add up to 100%");
  return Object.fromEntries(entries);
}

export async function createRecurring(db: Db, raw: RecurringInputRaw): Promise<{ id: string }> {
  const input = parseInput(recurringInput, raw);
  const ctx = await makeCtx(db);
  if (!ctx.accounts.has(input.accountId)) fail("accountId", "Choose an account");
  if (input.categoryId && !ctx.categories.has(input.categoryId)) fail("categoryId", "Unknown category");
  const shares = checkShares(input.sourceShares, new Set(ctx.sources.keys()));
  const created = await db.recurringPayment.create({
    data: {
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      frequency: input.frequency,
      interval: input.interval,
      dayOfMonth: input.frequency === "MONTHLY" ? (input.dayOfMonth ?? Number(input.startDate.slice(8, 10))) : null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      isActive: input.isActive,
      sourceShares: shares ? JSON.stringify(shares) : null,
      tags: JSON.stringify(input.tags),
      notes: input.notes ?? null,
    },
  });
  await audit(db, { entity: "RecurringPayment", entityId: created.id, action: "CREATE", summary: `Added recurring ${created.description}`, after: created });
  return { id: created.id };
}

export async function updateRecurring(db: Db, id: string, raw: RecurringInputRaw): Promise<{ id: string }> {
  const input = parseInput(recurringInput, raw);
  const ctx = await makeCtx(db);
  const existing = ctx.data.recurring.find((r) => r.id === id);
  if (!existing) fail("id", "That recurring payment no longer exists");
  if (!ctx.accounts.has(input.accountId)) fail("accountId", "Choose an account");
  const shares = checkShares(input.sourceShares, new Set(ctx.sources.keys()));
  const updated = await db.recurringPayment.update({
    where: { id },
    data: {
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      frequency: input.frequency,
      interval: input.interval,
      dayOfMonth: input.frequency === "MONTHLY" ? (input.dayOfMonth ?? Number(input.startDate.slice(8, 10))) : null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      isActive: input.isActive,
      sourceShares: shares ? JSON.stringify(shares) : null,
      tags: JSON.stringify(input.tags),
      notes: input.notes ?? null,
    },
  });
  await audit(db, { entity: "RecurringPayment", entityId: id, action: "UPDATE", summary: `Edited recurring ${updated.description}`, before: existing, after: updated });
  return { id };
}

export async function deleteRecurring(db: Db, id: string): Promise<void> {
  const r = await db.recurringPayment.findUnique({ where: { id } });
  if (!r) return;
  await db.recurringPayment.delete({ where: { id } });
  await audit(db, { entity: "RecurringPayment", entityId: id, action: "DELETE", summary: `Deleted recurring ${r.description}`, before: r });
}

async function mutateSkipped(db: Db, id: string, dueDate: string, skip: boolean): Promise<void> {
  const r = await db.recurringPayment.findUnique({ where: { id } });
  if (!r) fail("id", "That recurring payment no longer exists");
  const list = new Set<string>(JSON.parse(r.skippedDates || "[]") as string[]);
  if (skip) list.add(dueDate);
  else list.delete(dueDate);
  await db.recurringPayment.update({ where: { id }, data: { skippedDates: JSON.stringify([...list].sort()) } });
}

export const skipOccurrence = (db: Db, id: string, dueDate: string) => mutateSkipped(db, id, dueDate, true);
export const unskipOccurrence = (db: Db, id: string, dueDate: string) => mutateSkipped(db, id, dueDate, false);

/**
 * Record one occurrence of a recurring payment as PAID. Only now does money leave an account: until
 * then an upcoming bill is just a reminder and a forecast line.
 */
export async function markRecurringPaid(
  db: Db,
  id: string,
  dueDate: string,
  overrides: { date?: string; amount?: string; accountId?: string } = {},
  opts: WriteOptions = {},
): Promise<{ id: string }> {
  const ctx = await makeCtx(db);
  const template = ctx.data.recurring.find((r) => r.id === id);
  if (!template) fail("id", "That recurring payment no longer exists");
  const bill = billsOf(ctx.data).find((b) => b.id === id);
  if (!bill) fail("id", "That recurring payment no longer exists");
  const occurrence = billOccurrences(ctx.ledger, bill, { from: dueDate, to: dueDate }, ctx.today)[0];
  if (!occurrence) fail("dueDate", "That isn't a scheduled date for this payment");
  if (occurrence.status === "paid") fail("dueDate", "This one is already recorded as paid");

  const accountId = overrides.accountId ?? template.accountId;
  const account = ctx.accounts.get(accountId);
  if (!account) fail("accountId", "Choose an account");
  const amount = overrides.amount ?? template.amount;

  let attribution: { mode: "AUTO" } | { mode: "MANUAL"; allocations: { sourceId: string; amount: string }[] } = { mode: "AUTO" };
  if (template.sourceShares && template.currency === account.currency) {
    const entries = Object.entries(template.sourceShares).filter(([, p]) => p > 0);
    if (entries.length > 0) {
      const parts = distribute(dec(amount), entries.map(([, p]) => dec(p)), decimalsOf(account.currency));
      const allocations = entries
        .map(([sourceId], i) => ({ sourceId, amount: parts[i].toFixed(decimalsOf(account.currency)) }))
        .filter((a) => !dec(a.amount).eq(ZERO));
      if (allocations.length > 0) attribution = { mode: "MANUAL", allocations };
    }
  }

  return createTransaction(
    db,
    {
      type: "EXPENSE",
      date: overrides.date ?? (dueDate <= ctx.today ? dueDate : ctx.today),
      accountId,
      amount,
      currency: template.currency,
      categoryId: template.categoryId,
      description: template.description,
      notes: template.notes,
      tags: template.tags,
      recurringId: id,
      dueDate,
      attribution,
    },
    opts,
  );
}
