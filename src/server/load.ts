import type {
  AccountView,
  BudgetView,
  CategoryView,
  GoalView,
  RateRecord,
  RecurringView,
  SettingsView,
  SourceView,
} from "@/lib/app-types";
import type { ISODate } from "@/lib/finance/dates";
import type { RecurringBill } from "@/lib/finance/forecast";
import type { IncomeStream } from "@/lib/finance/income";
import { type Schedule, incomeSchedule, recurringSchedule } from "@/lib/finance/recurrence";
import { type StrategyId, parseStrategyConfigs } from "@/lib/finance/savings";
import type { GoalInput as GoalFinance } from "@/lib/finance/savings";
import type { AllocationMode, LedgerInput, LedgerTx, TxType } from "@/lib/finance/types";
import type { Tx } from "./db";

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Everything the app knows, as plain serialisable data. */
export interface AppData {
  settings: SettingsView;
  accounts: AccountView[];
  sources: SourceView[];
  categories: CategoryView[];
  transactions: LedgerTx[];
  rates: RateRecord[];
  goals: GoalView[];
  budgets: BudgetView[];
  recurring: RecurringView[];
}

export async function loadAppData(db: Tx): Promise<AppData> {
  const [settingsRow, accounts, sources, categories, txs, rates, goals, budgets, recurring] = await Promise.all([
    db.settings.findUnique({ where: { id: 1 } }),
    // Every list has a total order (ending in id): SQLite happens to return rows in insertion order,
    // but Postgres returns them in no particular order unless asked, and results must not depend on that.
    db.account.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    db.incomeSource.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    db.transaction.findMany({ include: { allocations: { orderBy: { id: "asc" } } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    db.exchangeRate.findMany({ orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    db.goal.findMany({ include: { allocations: { orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.budget.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.recurringPayment.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);

  const s = settingsRow ?? {
    baseCurrency: "AZN",
    timezone: "Asia/Baku",
    locale: "en-US",
    reportingMode: "MONTH",
    cycleStartDay: 1,
    weekStartsOn: 1,
    activeStrategy: "SAVE_ALL",
    strategyConfig: "{}",
    deductUpcomingBills: false,
    upcomingBillsDays: 30,
    forecastSpending: null,
    onboardedAt: null,
  };

  return {
    settings: {
      baseCurrency: s.baseCurrency,
      timezone: s.timezone,
      locale: s.locale,
      reportingMode: s.reportingMode === "CYCLE" ? "CYCLE" : "MONTH",
      cycleStartDay: s.cycleStartDay,
      weekStartsOn: s.weekStartsOn,
      activeStrategy: s.activeStrategy as StrategyId,
      strategyConfig: parseStrategyConfigs(s.strategyConfig),
      deductUpcomingBills: s.deductUpcomingBills,
      upcomingBillsDays: s.upcomingBillsDays,
      forecastSpending: s.forecastSpending,
      onboarded: s.onboardedAt !== null,
    },
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type as AccountView["type"],
      currency: a.currency,
      nickname: a.nickname,
      color: a.color,
      archived: a.archived,
      sortOrder: a.sortOrder,
    })),
    sources: sources.map((x) => ({
      id: x.id,
      name: x.name,
      kind: x.kind,
      isSystem: x.isSystem,
      currency: x.currency,
      expectedAmount: x.expectedAmount,
      scheduleType: x.scheduleType,
      scheduleDays: parseJson<number[]>(x.scheduleDays, []),
      scheduleAnchor: x.scheduleAnchor,
      scheduleEnd: x.scheduleEnd,
      destinationAccountId: x.destinationAccountId,
      color: x.color,
      isActive: x.isActive,
      sortOrder: x.sortOrder,
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      bucket: c.bucket as CategoryView["bucket"],
      archived: c.archived,
      sortOrder: c.sortOrder,
    })),
    transactions: txs.map(rowToLedgerTx),
    rates: rates.map((r) => ({
      id: r.id,
      from: r.fromCurrency,
      to: r.toCurrency,
      rate: r.rate,
      effectiveFrom: r.effectiveFrom,
      accountId: r.accountId,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind as GoalView["kind"],
      targetAmount: g.targetAmount,
      currency: g.currency,
      targetDate: g.targetDate,
      priority: g.priority,
      isPrimary: g.isPrimary,
      icon: g.icon,
      color: g.color,
      note: g.note,
      archived: g.archived,
      createdAt: g.createdAt.toISOString(),
      allocations: g.allocations
        .map((a) => ({ id: a.id, date: a.date, amount: a.amount, note: a.note }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    })),
    budgets: budgets.map((b) => ({ id: b.id, categoryId: b.categoryId, amount: b.amount, isActive: b.isActive })),
    recurring: recurring.map((r) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      currency: r.currency,
      accountId: r.accountId,
      categoryId: r.categoryId,
      frequency: r.frequency as RecurringView["frequency"],
      interval: r.interval,
      dayOfMonth: r.dayOfMonth,
      startDate: r.startDate,
      endDate: r.endDate,
      isActive: r.isActive,
      skippedDates: parseJson<ISODate[]>(r.skippedDates, []),
      sourceShares: parseJson<Record<string, number> | null>(r.sourceShares, null),
      tags: parseJson<string[]>(r.tags, []),
      notes: r.notes,
    })),
  };
}

type TxRow = Awaited<ReturnType<Tx["transaction"]["findMany"]>>[number] & {
  allocations: { sourceId: string; amount: string }[];
};

export function rowToLedgerTx(row: TxRow): LedgerTx {
  return {
    id: row.id,
    type: row.type as TxType,
    date: row.date,
    time: row.time,
    createdAt: row.createdAt.toISOString(),
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    amount: row.amount,
    currency: row.currency,
    accountAmount: row.accountAmount,
    toAmount: row.toAmount,
    feeAmount: row.feeAmount,
    feeFixed: row.feeFixed,
    feePercent: row.feePercent,
    fx: parseJson<Record<string, string> | null>(row.fx, null),
    exchangeRate: row.exchangeRate,
    categoryId: row.categoryId,
    incomeSourceId: row.incomeSourceId,
    expectedDate: row.expectedDate,
    expectedAmount: row.expectedAmount,
    refundOfId: row.refundOfId,
    recurringId: row.recurringId,
    dueDate: row.dueDate,
    subtype: row.subtype,
    description: row.description,
    notes: row.notes,
    tags: parseJson<string[]>(row.tags, []),
    allocationMode: (row.allocationMode === "MANUAL" ? "MANUAL" : "AUTO") as AllocationMode,
    allocations: row.allocations.map((a) => ({ sourceId: a.sourceId, amount: a.amount })),
  };
}

export function ledgerInputOf(data: AppData): LedgerInput {
  return {
    baseCurrency: data.settings.baseCurrency,
    accounts: data.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      archived: a.archived,
      sortOrder: a.sortOrder,
    })),
    sources: data.sources.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      isSystem: s.isSystem,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
    })),
    transactions: data.transactions,
    rates: data.rates.map((r) => ({
      from: r.from,
      to: r.to,
      rate: r.rate,
      effectiveFrom: r.effectiveFrom,
      accountId: r.accountId,
    })),
  };
}

/**
 * The income streams with their pay schedules. A starting balance already contains whatever was
 * received before its date, so pay dates on or before the latest opening balance of the account a
 * salary lands in are not expected again (otherwise a new salary would open with a false
 * "not recorded yet" for a payment that is already in the balance, inviting a double count).
 */
export function streamsOf(data: AppData): IncomeStream[] {
  const openedOn = new Map<string, string>();
  for (const t of data.transactions) {
    if (t.type === "OPENING" && t.accountId && t.date > (openedOn.get(t.accountId) ?? "")) openedOn.set(t.accountId, t.date);
  }
  return data.sources
    .filter((s) => !s.isSystem)
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      currency: s.currency,
      expectedAmount: s.expectedAmount,
      schedule: withCoverage(
        incomeSchedule({
          scheduleType: s.scheduleType,
          scheduleDays: s.scheduleDays,
          scheduleAnchor: s.scheduleAnchor,
          scheduleEnd: s.scheduleEnd,
        }),
        s.destinationAccountId ? openedOn.get(s.destinationAccountId) : undefined,
      ),
      destinationAccountId: s.destinationAccountId,
      isActive: s.isActive,
    }));
}

function withCoverage(schedule: Schedule, coveredThrough: string | undefined): Schedule {
  return coveredThrough && schedule.type !== "NONE" ? { ...schedule, after: coveredThrough } : schedule;
}

export function billsOf(data: AppData): RecurringBill[] {
  return data.recurring.map((r) => ({
    id: r.id,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    accountId: r.accountId,
    categoryId: r.categoryId,
    schedule: recurringSchedule({
      frequency: r.frequency,
      interval: r.interval,
      dayOfMonth: r.dayOfMonth,
      startDate: r.startDate,
      endDate: r.endDate,
    }),
    isActive: r.isActive,
    skippedDates: r.skippedDates,
  }));
}

/** Goals in the shape the savings maths expects. */
export function goalsOf(data: AppData): GoalFinance[] {
  return data.goals.map((g) => ({
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
  }));
}
