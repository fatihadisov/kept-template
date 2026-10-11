import { SOURCE_SLOTS } from "@/lib/defaults";
import { startOfMonth } from "@/lib/finance/dates";
import { type IncomeSourceInputRaw, incomeSourceInput } from "@/lib/validation";
import { audit } from "../audit";
import type { Db } from "../db";
import { fail, makeCtx, parseInput } from "./context";

/** First colour slot no existing income is using (so a deleted income's colour is reused, never shuffled onto another). */
function nextSlot(used: (string | null)[]): string {
  return SOURCE_SLOTS.find((slot) => !used.includes(slot)) ?? SOURCE_SLOTS[used.length % SOURCE_SLOTS.length];
}

/** Income streams: a salary, a bonus, side income. Independent of the account that receives them. */
export async function createIncomeSource(db: Db, raw: IncomeSourceInputRaw): Promise<{ id: string }> {
  const input = parseInput(incomeSourceInput, raw);
  const ctx = await makeCtx(db);
  const real = ctx.data.sources.filter((s) => !s.isSystem);
  if (real.some((s) => s.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
    fail("name", `You already have an income called “${input.name}”`);
  }
  if (input.destinationAccountId && !ctx.accounts.has(input.destinationAccountId)) {
    fail("destinationAccountId", "Choose an account");
  }

  const recurring = ["MONTHLY", "SEMI_MONTHLY", "WEEKLY"].includes(input.scheduleType);
  const created = await db.incomeSource.create({
    data: {
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      expectedAmount: input.expectedAmount ?? null,
      scheduleType: input.scheduleType,
      scheduleDays: JSON.stringify(input.scheduleDays),
      // Track from the start of this month by default: this month's pay is either received or pending,
      // and months before you started using the app never show up as "overdue".
      scheduleAnchor: input.scheduleAnchor ?? (recurring ? startOfMonth(ctx.today) : null),
      scheduleEnd: input.scheduleEnd ?? null,
      destinationAccountId: input.destinationAccountId ?? null,
      color: input.color ?? nextSlot(real.map((s) => s.color)),
      isActive: input.isActive,
      sortOrder: real.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1,
    },
  });
  await audit(db, { entity: "IncomeSource", entityId: created.id, action: "CREATE", summary: `Added income ${created.name}`, after: created });
  return { id: created.id };
}

export async function updateIncomeSource(db: Db, id: string, raw: IncomeSourceInputRaw): Promise<{ id: string }> {
  const input = parseInput(incomeSourceInput, raw);
  const ctx = await makeCtx(db);
  const source = ctx.sources.get(id);
  if (!source || source.isSystem) fail("id", "That income no longer exists");
  if (ctx.data.sources.some((s) => s.id !== id && !s.isSystem && s.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
    fail("name", `You already have an income called “${input.name}”`);
  }
  if (input.destinationAccountId && !ctx.accounts.has(input.destinationAccountId)) {
    fail("destinationAccountId", "Choose an account");
  }
  const updated = await db.incomeSource.update({
    where: { id },
    data: {
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      expectedAmount: input.expectedAmount ?? null,
      scheduleType: input.scheduleType,
      scheduleDays: JSON.stringify(input.scheduleDays),
      scheduleAnchor: input.scheduleAnchor ?? source.scheduleAnchor,
      scheduleEnd: input.scheduleEnd ?? null,
      destinationAccountId: input.destinationAccountId ?? null,
      color: input.color ?? source.color,
      isActive: input.isActive,
    },
  });
  await audit(db, { entity: "IncomeSource", entityId: id, action: "UPDATE", summary: `Edited income ${updated.name}`, before: source, after: updated });
  return { id };
}

export async function setIncomeSourceActive(db: Db, id: string, isActive: boolean): Promise<void> {
  const source = await db.incomeSource.findUnique({ where: { id } });
  if (!source || source.isSystem) fail("id", "That income no longer exists");
  await db.incomeSource.update({ where: { id }, data: { isActive } });
  await audit(db, { entity: "IncomeSource", entityId: id, action: "UPDATE", summary: `${isActive ? "Activated" : "Paused"} income ${source.name}` });
}

export async function deleteIncomeSource(db: Db, id: string): Promise<void> {
  const ctx = await makeCtx(db);
  const source = ctx.sources.get(id);
  if (!source || source.isSystem) fail("id", "That income no longer exists");
  const used = ctx.data.transactions.filter((t) => t.incomeSourceId === id || t.allocations.some((a) => a.sourceId === id)).length;
  if (used > 0) fail("id", `${source.name} has ${used} entr${used === 1 ? "y" : "ies"} behind it. Pause it instead — history stays intact.`);
  await db.incomeSource.delete({ where: { id } });
  await audit(db, { entity: "IncomeSource", entityId: id, action: "DELETE", summary: `Deleted income ${source.name}`, before: source });
}

export async function reorderIncomeSources(db: Db, ids: string[]): Promise<void> {
  await db.$transaction(ids.map((id, index) => db.incomeSource.update({ where: { id }, data: { sortOrder: index } })));
}
