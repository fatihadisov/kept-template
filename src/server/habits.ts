import type { AppContextValue } from "@/components/app-provider";
import type { LedgerTx } from "@/lib/finance/types";
import type { AppData } from "./load";

/** Small things learned from use so the next entry needs fewer taps. */
export function habitsOf(data: AppData): { habits: AppContextValue["habits"]; recentExpenses: LedgerTx[] } {
  const live = new Set(data.accounts.filter((a) => !a.archived).map((a) => a.id));
  const recent = [...data.transactions]
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
    .slice(0, 400);

  const expenses = recent.filter((t) => t.type === "EXPENSE");
  const lastExpense = expenses.find((t) => live.has(t.accountId));

  const counts = new Map<string, number>();
  for (const t of expenses.slice(0, 120)) {
    if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  }
  const archived = new Set(data.categories.filter((c) => c.archived).map((c) => c.id));
  const topCategoryIds = [...counts.entries()]
    .filter(([id]) => !archived.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);

  const lastIncome = recent.find((t) => t.type === "INCOME" && t.incomeSourceId);

  const lastCurrencyAccountIds: Record<string, string> = {};
  for (const t of recent) {
    const account = data.accounts.find((a) => a.id === t.accountId);
    if (account && live.has(account.id) && !(account.currency in lastCurrencyAccountIds)) lastCurrencyAccountIds[account.currency] = account.id;
  }

  return {
    habits: {
      expenseAccountId: lastExpense?.accountId ?? null,
      topCategoryIds,
      incomeSourceId: lastIncome?.incomeSourceId ?? null,
      lastCurrencyAccountIds,
    },
    recentExpenses: expenses.slice(0, 60),
  };
}
