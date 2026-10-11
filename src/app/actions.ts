"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/lib/app-types";
import type { StrategyId } from "@/lib/finance/savings";
import type {
  AccountInputRaw,
  CategoryInputRaw,
  GoalAllocationInputRaw,
  GoalInputRaw,
  IncomeSourceInputRaw,
  RateInputRaw,
  RecurringInputRaw,
  TransactionInputRaw,
} from "@/lib/validation";
import { dbFile, demoAvailable, removeDbFiles, usesPostgres } from "@/server/db";
import { AppError, NeedsConfirmation } from "@/server/errors";
import { MODE_COOKIE, RANGE_COOKIE, currentDb } from "@/server/session";
import * as accounts from "@/server/services/accounts";
import * as backup from "@/server/services/backup";
import * as catalog from "@/server/services/catalog";
import * as goals from "@/server/services/goals";
import * as income from "@/server/services/income";
import * as rates from "@/server/services/rates";
import * as recurring from "@/server/services/recurring";
import * as settings from "@/server/services/settings";
import * as tx from "@/server/services/transactions";
import type { Db } from "@/server/db";

/* ------------------------------------------------------------------ */
/* plumbing                                                             */
/* ------------------------------------------------------------------ */

function failure(error: unknown): ActionResult<never> {
  unstable_rethrow(error); // a redirect (e.g. "please sign in again") must not be reported as a failure
  if (error instanceof NeedsConfirmation) return { ok: false, error: error.message, warnings: error.warnings };
  if (error instanceof AppError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
  console.error(error);
  return { ok: false, error: "Something went wrong. Nothing was changed." };
}

async function run<T>(fn: (db: Db) => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const db = await currentDb();
    const data = await fn(db);
    revalidatePath("/", "layout");
    return { ok: true, data, message };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------------------------------------------ */
/* transactions                                                         */
/* ------------------------------------------------------------------ */

export async function saveTransactionAction(payload: {
  id?: string;
  input: TransactionInputRaw;
  confirm?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  return run((db) =>
    payload.id ? tx.updateTransaction(db, payload.id, payload.input, { confirm: payload.confirm }) : tx.createTransaction(db, payload.input, { confirm: payload.confirm }),
  );
}

export async function deleteTransactionAction(id: string, confirm = false): Promise<ActionResult<{ id: string }>> {
  return run((db) => tx.deleteTransaction(db, id, { confirm }));
}

export async function duplicateTransactionAction(id: string): Promise<ActionResult<{ id: string }>> {
  return run((db) => tx.duplicateTransaction(db, id, { confirm: true }));
}

export async function previewDeleteAction(id: string): Promise<ActionResult<Awaited<ReturnType<typeof tx.previewDelete>>>> {
  try {
    return { ok: true, data: await tx.previewDelete(await currentDb(), id) };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------------------------------------------ */
/* accounts, income, categories, goals, recurring, rates                */
/* ------------------------------------------------------------------ */

export const saveAccountAction = async (id: string | null, input: AccountInputRaw) =>
  run((db) => (id ? accounts.updateAccount(db, id, input) : accounts.createAccount(db, input)));
export const archiveAccountAction = async (id: string, archived: boolean) => run((db) => accounts.setAccountArchived(db, id, archived));
export const deleteAccountAction = async (id: string) => run((db) => accounts.deleteAccount(db, id));

export const saveIncomeSourceAction = async (id: string | null, input: IncomeSourceInputRaw) =>
  run((db) => (id ? income.updateIncomeSource(db, id, input) : income.createIncomeSource(db, input)));
export const setIncomeActiveAction = async (id: string, active: boolean) => run((db) => income.setIncomeSourceActive(db, id, active));
export const deleteIncomeSourceAction = async (id: string) => run((db) => income.deleteIncomeSource(db, id));

export const saveCategoryAction = async (id: string | null, input: CategoryInputRaw) =>
  run((db) => (id ? catalog.updateCategory(db, id, input) : catalog.createCategory(db, input)));
export const archiveCategoryAction = async (id: string, archived: boolean) => run((db) => catalog.setCategoryArchived(db, id, archived));
export const deleteCategoryAction = async (id: string) => run((db) => catalog.deleteCategory(db, id));
export const upsertBudgetAction = async (input: { categoryId: string | null; amount: string }) => run((db) => catalog.upsertBudget(db, input));
export const deleteBudgetAction = async (id: string) => run((db) => catalog.deleteBudget(db, id));

export const saveGoalAction = async (id: string | null, input: GoalInputRaw) =>
  run((db) => (id ? goals.updateGoal(db, id, input) : goals.createGoal(db, input)));
export const archiveGoalAction = async (id: string, archived: boolean) => run((db) => goals.setGoalArchived(db, id, archived));
export const deleteGoalAction = async (id: string) => run((db) => goals.deleteGoal(db, id));
export const allocateGoalAction = async (input: GoalAllocationInputRaw) => run((db) => goals.allocateToGoal(db, input));
export const removeAllocationAction = async (id: string) => run((db) => goals.removeAllocation(db, id));
export const setPrimaryGoalAction = async (id: string | null) => run((db) => goals.setPrimaryGoal(db, id));

export const saveRecurringAction = async (id: string | null, input: RecurringInputRaw) =>
  run((db) => (id ? recurring.updateRecurring(db, id, input) : recurring.createRecurring(db, input)));
export const deleteRecurringAction = async (id: string) => run((db) => recurring.deleteRecurring(db, id));
export const markRecurringPaidAction = async (id: string, dueDate: string, overrides: { date?: string; amount?: string; accountId?: string } = {}, confirm = false) =>
  run((db) => recurring.markRecurringPaid(db, id, dueDate, overrides, { confirm }));
export const skipOccurrenceAction = async (id: string, dueDate: string, skip: boolean) =>
  run((db) => (skip ? recurring.skipOccurrence(db, id, dueDate) : recurring.unskipOccurrence(db, id, dueDate)));

export const addRateAction = async (input: RateInputRaw) => run((db) => rates.addRate(db, input));
export const deleteRateAction = async (id: string) => run((db) => rates.deleteRate(db, id));

/* ------------------------------------------------------------------ */
/* settings & strategy                                                  */
/* ------------------------------------------------------------------ */

export const updateSettingsAction = async (patch: unknown) => run((db) => settings.updateSettings(db, patch));
export const setStrategyAction = async (strategy: StrategyId, config?: unknown) => run((db) => settings.setStrategy(db, strategy, config));
export const completeOnboardingAction = async () => run((db) => settings.completeOnboarding(db));

/* ------------------------------------------------------------------ */
/* date range, demo mode, backup                                        */
/* ------------------------------------------------------------------ */

const COOKIE_OPTS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };

export async function setRangeAction(value: string): Promise<void> {
  (await cookies()).set(RANGE_COOKIE, value, COOKIE_OPTS);
  revalidatePath("/", "layout");
}

export async function setModeAction(mode: "real" | "demo"): Promise<void> {
  if (!demoAvailable()) redirect("/");
  const store = await cookies();
  if (mode === "demo") store.set(MODE_COOKIE, "demo", COOKIE_OPTS);
  else store.delete(MODE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Throw away the demo database and rebuild it from scratch. The real database is never touched. */
export async function resetDemoAction(): Promise<void> {
  if (!demoAvailable()) redirect("/");
  await removeDbFiles(dbFile("demo"));
  (await cookies()).set(MODE_COOKIE, "demo", COOKIE_OPTS);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function restoreBackupAction(json: string): Promise<ActionResult<{ accounts: number; transactions: number; goals: number; safetyCopy: string | null }>> {
  try {
    const db = await currentDb();
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, error: "That file isn't valid JSON." };
    }
    const mode = (await cookies()).get(MODE_COOKIE)?.value === "demo" ? "demo" : "real";
    // a SQLite file gets a safety copy next to it first; the hosted database keeps its own history
    const summary = await backup.restoreBackup(db, parsed, { dbFile: usesPostgres() ? undefined : dbFile(mode) });
    revalidatePath("/", "layout");
    return { ok: true, data: summary };
  } catch (error) {
    return failure(error);
  }
}
