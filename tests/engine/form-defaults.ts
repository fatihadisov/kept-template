import type { AppContextValue } from "@/components/app-provider";

/** A small, realistic app context for form tests: two incomes, USD + AZN cards and cash. */
export function parseDefaults(): AppContextValue {
  return {
    mode: "real",
  hosted: false,
  passwordProtected: false,
    today: "2026-10-09",
    settings: {
      baseCurrency: "AZN",
      timezone: "Asia/Baku",
      locale: "en-US",
      reportingMode: "MONTH",
      cycleStartDay: 1,
      weekStartsOn: 1,
      activeStrategy: "SAVE_ALL",
      strategyConfig: {
        PERCENT_TARGET: { percent: 20 },
        FIXED_MONTHLY: { amount: "0" },
        BUDGET_50_30_20: { needs: 50, wants: 30, savings: 20 },
        EMERGENCY_FIRST: { essentialMonthly: "0", months: 6 },
      },
      deductUpcomingBills: false,
      upcomingBillsDays: 30,
      forecastSpending: null,
      onboarded: true,
    },
    accounts: [
      { id: "usdCard", name: "USD card", type: "CARD", currency: "USD", nickname: null, color: null, archived: false, sortOrder: 0 },
      { id: "aznCard", name: "AZN card", type: "CARD", currency: "AZN", nickname: null, color: null, archived: false, sortOrder: 1 },
      { id: "cashAzn", name: "Cash AZN", type: "CASH", currency: "AZN", nickname: null, color: null, archived: false, sortOrder: 2 },
      { id: "cashUsd", name: "Cash USD", type: "CASH", currency: "USD", nickname: null, color: null, archived: false, sortOrder: 3 },
    ],
    sources: [
      { id: "OPEN", name: "Existing funds", kind: "OPENING", isSystem: true, currency: "AZN", expectedAmount: null, scheduleType: "NONE", scheduleDays: [], scheduleAnchor: null, scheduleEnd: null, destinationAccountId: null, color: "0", isActive: true, sortOrder: -1 },
      { id: "A", name: "Remote job", kind: "SALARY", isSystem: false, currency: "USD", expectedAmount: "1500", scheduleType: "MONTHLY", scheduleDays: [5], scheduleAnchor: null, scheduleEnd: null, destinationAccountId: "usdCard", color: "a", isActive: true, sortOrder: 0 },
      { id: "B", name: "Local job", kind: "SALARY", isSystem: false, currency: "AZN", expectedAmount: "1500", scheduleType: "MONTHLY", scheduleDays: [15], scheduleAnchor: null, scheduleEnd: null, destinationAccountId: "aznCard", color: "b", isActive: true, sortOrder: 1 },
    ],
    categories: [
      { id: "food", name: "Food & Groceries", icon: "shopping-basket", color: "#5FA67A", bucket: "NEEDS", archived: false, sortOrder: 0 },
      { id: "fun", name: "Entertainment", icon: "clapperboard", color: "#9A7BD6", bucket: "WANTS", archived: false, sortOrder: 1 },
    ],
    rates: [
      { id: "r1", from: "USD", to: "AZN", rate: "1.70", effectiveFrom: "2026-01-01", accountId: null, note: null, createdAt: "2026-01-01T00:00:00Z" },
    ],
    recentExpenses: [],
    balances: { usdCard: "1000.00", aznCard: "1000.00", cashAzn: "50.00", cashUsd: "0.00" },
    compositions: { aznCard: [{ sourceId: "B", share: 1 }] },
    habits: { expenseAccountId: "aznCard", topCategoryIds: ["food", "fun"], incomeSourceId: "A", lastCurrencyAccountIds: {} },
  };
}
