import { dec, round } from "@/lib/finance/money";
import { formatMoney } from "@/lib/finance/format";
import { snapshotAt } from "@/lib/finance/queries";
import { type GoalInput as GoalFinance, availableToSpend, reservedIn, reservedTotalBase } from "@/lib/finance/savings";
import { type GoalAllocationInputRaw, type GoalInputRaw, goalAllocationInput, goalInput } from "@/lib/validation";
import { audit } from "../audit";
import type { Db } from "../db";
import { type Ctx, fail, makeCtx, parseInput } from "./context";

function toFinance(g: Ctx["data"]["goals"][number]): GoalFinance {
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    targetAmount: g.targetAmount,
    currency: g.currency,
    targetDate: g.targetDate,
    priority: g.priority,
    isPrimary: g.isPrimary,
    archived: g.archived,
    allocations: g.allocations,
  };
}

/** Unreserved money right now: total savings minus everything already set aside (base currency). */
export function unreservedNow(ctx: Ctx) {
  const toBase = (ccy: string) => (ccy === ctx.base ? dec(1) : (ctx.ledger.rates.toBase(ccy, ctx.today) ?? dec(0)));
  const total = snapshotAt(ctx.ledger, ctx.today).total;
  const reserved = reservedTotalBase(ctx.data.goals.map(toFinance), toBase);
  return { toBase, ...availableToSpend(total, reserved) };
}

export async function createGoal(db: Db, raw: GoalInputRaw): Promise<{ id: string }> {
  const input = parseInput(goalInput, raw);
  const ctx = await makeCtx(db);
  const created = await db.$transaction(async (tx) => {
    if (input.isPrimary) await tx.goal.updateMany({ data: { isPrimary: false } });
    const hasPrimary = ctx.data.goals.some((g) => g.isPrimary && !g.archived);
    return tx.goal.create({
      data: {
        ...input,
        targetDate: input.targetDate ?? null,
        color: input.color ?? null,
        note: input.note ?? null,
        isPrimary: input.isPrimary || !hasPrimary,
      },
    });
  });
  await audit(db, { entity: "Goal", entityId: created.id, action: "CREATE", summary: `Added goal ${created.name}`, after: created });
  return { id: created.id };
}

export async function updateGoal(db: Db, id: string, raw: GoalInputRaw): Promise<{ id: string }> {
  const input = parseInput(goalInput, raw);
  const ctx = await makeCtx(db);
  const existing = ctx.data.goals.find((g) => g.id === id);
  if (!existing) fail("id", "That goal no longer exists");
  if (existing.currency !== input.currency && existing.allocations.length > 0) {
    fail("currency", "This goal already has money set aside in its current currency. Release it first or create a new goal.");
  }
  const updated = await db.$transaction(async (tx) => {
    if (input.isPrimary) await tx.goal.updateMany({ where: { id: { not: id } }, data: { isPrimary: false } });
    return tx.goal.update({
      where: { id },
      data: { ...input, targetDate: input.targetDate ?? null, color: input.color ?? null, note: input.note ?? null },
    });
  });
  await audit(db, { entity: "Goal", entityId: id, action: "UPDATE", summary: `Edited goal ${updated.name}`, before: existing, after: updated });
  return { id };
}

export async function setGoalArchived(db: Db, id: string, archived: boolean): Promise<void> {
  const g = await db.goal.findUnique({ where: { id } });
  if (!g) fail("id", "That goal no longer exists");
  await db.goal.update({ where: { id }, data: { archived, isPrimary: archived ? false : g.isPrimary } });
  await audit(db, { entity: "Goal", entityId: id, action: "UPDATE", summary: `${archived ? "Archived" : "Restored"} goal ${g.name} — ${archived ? "its reserved money is released" : "its reservation counts again"}` });
}

export async function deleteGoal(db: Db, id: string): Promise<void> {
  const g = await db.goal.findUnique({ where: { id }, include: { allocations: true } });
  if (!g) return;
  await db.goal.delete({ where: { id } });
  await audit(db, { entity: "Goal", entityId: id, action: "DELETE", summary: `Deleted goal ${g.name}`, before: g });
}

export async function setPrimaryGoal(db: Db, id: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.goal.updateMany({ data: { isPrimary: false } });
    if (id) await tx.goal.update({ where: { id }, data: { isPrimary: true } });
  });
}

/**
 * Reserve (positive) or release (negative) existing savings for a goal. This NEVER moves money or
 * creates an expense: total savings stay the same, only the "available to spend" figure changes.
 */
export async function allocateToGoal(db: Db, raw: GoalAllocationInputRaw): Promise<{ id: string }> {
  const input = parseInput(goalAllocationInput, raw);
  const ctx = await makeCtx(db);
  const goal = ctx.data.goals.find((g) => g.id === input.goalId);
  if (!goal || goal.archived) fail("goalId", "That goal isn't available");
  if (goal.kind === "TOTAL") fail("goalId", "This goal tracks your total savings — there's nothing to set aside for it.");

  const amount = dec(input.amount);
  if (amount.gt(0)) {
    const { available, toBase } = unreservedNow(ctx);
    const wanted = amount.times(toBase(goal.currency));
    if (wanted.gt(available)) {
      fail("amount", `Only ${formatMoney(available.lt(0) ? 0 : available, ctx.base)} of your savings is unreserved right now`);
    }
  } else if (amount.abs().gt(reservedIn(toFinance(goal)))) {
    fail("amount", `Only ${formatMoney(reservedIn(toFinance(goal)), goal.currency)} is set aside for this goal`);
  }

  const row = await db.goalAllocation.create({
    data: { goalId: goal.id, date: input.date, amount: round(amount, 2).toFixed(2), note: input.note ?? null },
  });
  await audit(db, {
    entity: "GoalAllocation",
    entityId: row.id,
    action: "CREATE",
    summary: `${amount.gt(0) ? "Reserved" : "Released"} ${formatMoney(amount.abs(), goal.currency)} ${amount.gt(0) ? "for" : "from"} ${goal.name}`,
    after: row,
  });
  return { id: row.id };
}

export async function removeAllocation(db: Db, id: string): Promise<void> {
  const row = await db.goalAllocation.findUnique({ where: { id } });
  if (!row) return;
  await db.goalAllocation.delete({ where: { id } });
  await audit(db, { entity: "GoalAllocation", entityId: id, action: "DELETE", summary: "Removed a reservation entry", before: row });
}

/**
 * Keeps the emergency-fund goal in step with the "Emergency fund first" settings:
 * target = essential monthly costs × months of coverage.
 */
export async function syncEmergencyGoal(db: Db): Promise<void> {
  const ctx = await makeCtx(db);
  const cfg = ctx.data.settings.strategyConfig.EMERGENCY_FIRST;
  const target = dec(cfg.essentialMonthly).times(cfg.months);
  if (target.lte(0)) return;
  const existing = ctx.data.goals.find((g) => g.kind === "EMERGENCY" && !g.archived);
  const targetStr = round(target, 2).toFixed(2);
  if (existing) {
    if (existing.targetAmount !== targetStr || existing.currency !== ctx.base) {
      if (existing.currency === ctx.base || existing.allocations.length === 0) {
        await db.goal.update({ where: { id: existing.id }, data: { targetAmount: targetStr, currency: ctx.base } });
      }
    }
    return;
  }
  await db.goal.create({
    data: {
      name: "Emergency fund",
      kind: "EMERGENCY",
      targetAmount: targetStr,
      currency: ctx.base,
      priority: 1,
      icon: "life-buoy",
      note: `${cfg.months} months of essential costs`,
    },
  });
}
