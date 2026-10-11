import { type BudgetInput, type CategoryInputRaw, budgetInput, categoryInput } from "@/lib/validation";
import { audit } from "../audit";
import type { Db } from "../db";
import { fail, makeCtx, parseInput } from "./context";

/* Categories */

export async function createCategory(db: Db, raw: CategoryInputRaw): Promise<{ id: string }> {
  const input = parseInput(categoryInput, raw);
  const ctx = await makeCtx(db);
  if (ctx.data.categories.some((c) => c.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
    fail("name", `There is already a category called “${input.name}”`);
  }
  const created = await db.category.create({
    data: { ...input, sortOrder: ctx.data.categories.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1 },
  });
  await audit(db, { entity: "Category", entityId: created.id, action: "CREATE", summary: `Added category ${created.name}`, after: created });
  return { id: created.id };
}

export async function updateCategory(db: Db, id: string, raw: CategoryInputRaw): Promise<{ id: string }> {
  const input = parseInput(categoryInput, raw);
  const ctx = await makeCtx(db);
  const existing = ctx.categories.get(id);
  if (!existing) fail("id", "That category no longer exists");
  if (ctx.data.categories.some((c) => c.id !== id && c.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
    fail("name", `There is already a category called “${input.name}”`);
  }
  const updated = await db.category.update({ where: { id }, data: input });
  await audit(db, { entity: "Category", entityId: id, action: "UPDATE", summary: `Edited category ${updated.name}`, before: existing, after: updated });
  return { id };
}

export async function setCategoryArchived(db: Db, id: string, archived: boolean): Promise<void> {
  const c = await db.category.findUnique({ where: { id } });
  if (!c) fail("id", "That category no longer exists");
  await db.category.update({ where: { id }, data: { archived } });
  await audit(db, { entity: "Category", entityId: id, action: "UPDATE", summary: `${archived ? "Archived" : "Restored"} category ${c.name}` });
}

/** Deletes an unused category; a category with history can only be archived. */
export async function deleteCategory(db: Db, id: string): Promise<void> {
  const ctx = await makeCtx(db);
  const c = ctx.categories.get(id);
  if (!c) fail("id", "That category no longer exists");
  const used = ctx.data.transactions.filter((t) => t.categoryId === id).length + ctx.data.recurring.filter((r) => r.categoryId === id).length;
  if (used > 0) fail("id", `${c.name} is used by ${used} entr${used === 1 ? "y" : "ies"}. Archive it instead.`);
  await db.category.delete({ where: { id } });
  await audit(db, { entity: "Category", entityId: id, action: "DELETE", summary: `Deleted category ${c.name}`, before: c });
}

export async function reorderCategories(db: Db, ids: string[]): Promise<void> {
  await db.$transaction(ids.map((id, index) => db.category.update({ where: { id }, data: { sortOrder: index } })));
}

/* Budgets: optional monthly limits, per category or overall */

export async function upsertBudget(db: Db, raw: unknown): Promise<{ id: string }> {
  const input: BudgetInput = parseInput(budgetInput, raw);
  const ctx = await makeCtx(db);
  if (input.categoryId && !ctx.categories.has(input.categoryId)) fail("categoryId", "Unknown category");
  const existing = await db.budget.findFirst({ where: { categoryId: input.categoryId ?? null } });
  const row = existing
    ? await db.budget.update({ where: { id: existing.id }, data: { amount: input.amount, isActive: true } })
    : await db.budget.create({ data: { categoryId: input.categoryId ?? null, amount: input.amount } });
  await audit(db, {
    entity: "Budget",
    entityId: row.id,
    action: existing ? "UPDATE" : "CREATE",
    summary: `Budget ${input.categoryId ? (ctx.categories.get(input.categoryId)?.name ?? "") : "overall"}: ${input.amount}`,
    before: existing ?? undefined,
    after: row,
  });
  return { id: row.id };
}

export async function deleteBudget(db: Db, id: string): Promise<void> {
  const b = await db.budget.findUnique({ where: { id } });
  if (!b) return;
  await db.budget.delete({ where: { id } });
  await audit(db, { entity: "Budget", entityId: id, action: "DELETE", summary: "Removed a budget", before: b });
}
