import { type CurrencyCode } from "./currency";
import { type ISODate, addDays, diffDays } from "./dates";
import { type Dec, ZERO, dec, round } from "./money";
import type { PeriodPoint, PeriodStats } from "./stats";

/* ================================================================== */
/* Goals                                                                */
/* ================================================================== */

export type GoalKind = "RESERVE" | "TOTAL" | "EMERGENCY";

export interface GoalInput {
  id: string;
  name: string;
  kind: GoalKind | string;
  targetAmount: string;
  currency: CurrencyCode;
  targetDate: ISODate | null;
  /** 1 = high, 2 = medium, 3 = low */
  priority: number;
  isPrimary: boolean;
  archived: boolean;
  /** signed reservations (positive) / releases (negative), in the goal's currency */
  allocations: { amount: string }[];
}

export type GoalStatus = "done" | "on_track" | "behind" | "no_deadline" | "unknown";

export interface GoalProgress {
  goalId: string;
  currency: CurrencyCode;
  target: Dec;
  /** money counted toward the goal, in the goal's currency */
  current: Dec;
  targetBase: Dec;
  currentBase: Dec;
  /** current / target (may exceed 1) */
  ratio: Dec;
  remaining: Dec;
  remainingBase: Dec;
  done: boolean;
  /** fractional months until the target date (null without a deadline) */
  monthsLeft: number | null;
  /** base-currency amount to put aside per month to hit the deadline */
  requiredMonthlyBase: Dec | null;
  /** when recent saving behaviour would complete the goal */
  estimatedCompletion: ISODate | null;
  status: GoalStatus;
}

export interface GoalContext {
  today: ISODate;
  /** value of 1 unit of `ccy` in the base currency */
  toBase: (ccy: CurrencyCode) => Dec;
  /** total liquid savings in the base currency (for TOTAL goals) */
  liquidBase: Dec;
  /** typical net savings per month in the base currency */
  avgMonthlySavingsBase: Dec;
}

const DAYS_PER_MONTH = 30.4375;

export function reservedIn(goal: Pick<GoalInput, "allocations">): Dec {
  return goal.allocations.reduce((acc, a) => acc.plus(dec(a.amount)), ZERO);
}

/**
 * Progress of every goal. RESERVE and EMERGENCY goals count the money explicitly set aside for them;
 * TOTAL goals ("reach 50,000 in total savings") are measured against the whole of liquid savings.
 *
 * Estimated completion funds reserve-type goals in priority order from the average monthly savings
 * (so two goals do not both count the same future savings); TOTAL goals are estimated independently.
 */
export function goalsProgress(goals: readonly GoalInput[], ctx: GoalContext): GoalProgress[] {
  const active = goals.filter((g) => !g.archived);
  const result = new Map<string, GoalProgress>();

  const base = (g: GoalInput) => {
    const rate = ctx.toBase(g.currency);
    const target = dec(g.targetAmount);
    const current = g.kind === "TOTAL" ? (rate.isZero() ? ZERO : ctx.liquidBase.div(rate)) : reservedIn(g);
    const remaining = target.minus(current).gt(0) ? target.minus(current) : ZERO;
    const done = target.gt(0) && current.gte(target);
    let monthsLeft: number | null = null;
    let requiredMonthlyBase: Dec | null = null;
    if (g.targetDate && !done) {
      monthsLeft = diffDays(ctx.today, g.targetDate) / DAYS_PER_MONTH;
      const remainingBase = remaining.times(rate);
      requiredMonthlyBase = remainingBase.div(Math.max(monthsLeft, 1));
    }
    const p: GoalProgress = {
      goalId: g.id,
      currency: g.currency,
      target,
      current,
      targetBase: target.times(rate),
      currentBase: current.times(rate),
      ratio: target.gt(0) ? current.div(target) : ZERO,
      remaining,
      remainingBase: remaining.times(rate),
      done,
      monthsLeft,
      requiredMonthlyBase,
      estimatedCompletion: null,
      status: done ? "done" : g.targetDate ? "unknown" : "no_deadline",
    };
    return p;
  };
  for (const g of active) result.set(g.id, base(g));

  const avg = ctx.avgMonthlySavingsBase;
  const eta = (remainingBase: Dec): ISODate | null => {
    if (remainingBase.lte(0) || avg.lte(0)) return null;
    const months = remainingBase.div(avg).toNumber();
    if (!Number.isFinite(months) || months > 600) return null;
    return addDays(ctx.today, Math.ceil(months * DAYS_PER_MONTH));
  };

  // reserve-type goals: waterfall in priority order
  const reserveGoals = active
    .filter((g) => g.kind !== "TOTAL")
    .sort((a, b) => a.priority - b.priority || (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") || a.name.localeCompare(b.name));
  let cumulativeRemaining = ZERO;
  for (const g of reserveGoals) {
    const p = result.get(g.id) as GoalProgress;
    cumulativeRemaining = cumulativeRemaining.plus(p.remainingBase);
    if (!p.done) p.estimatedCompletion = eta(cumulativeRemaining);
  }
  for (const g of active.filter((x) => x.kind === "TOTAL")) {
    const p = result.get(g.id) as GoalProgress;
    if (!p.done) p.estimatedCompletion = eta(p.remainingBase);
  }

  for (const g of active) {
    const p = result.get(g.id) as GoalProgress;
    if (p.done || !g.targetDate) continue;
    if (p.estimatedCompletion) p.status = p.estimatedCompletion <= g.targetDate ? "on_track" : "behind";
    // a positive saving pace that still never gets there is behind; no pace at all means "can't tell yet"
    else p.status = avg.gt(0) ? "behind" : "unknown";
  }
  return active.map((g) => result.get(g.id) as GoalProgress);
}

/** Money set aside for goals, in the base currency. Archived goals release their reservations. */
export function reservedTotalBase(goals: readonly GoalInput[], toBase: (ccy: CurrencyCode) => Dec): Dec {
  return goals
    .filter((g) => !g.archived && g.kind !== "TOTAL")
    .reduce((acc, g) => acc.plus(reservedIn(g).times(toBase(g.currency))), ZERO);
}

export interface AvailableToSpend {
  liquid: Dec;
  reserved: Dec;
  upcomingBills: Dec;
  /** liquid − reserved − (optionally) bills due soon. Reserving never changes `liquid`. */
  available: Dec;
  /** reserved exceeds liquid */
  overReserved: boolean;
}

export function availableToSpend(liquid: Dec, reserved: Dec, upcomingBills: Dec = ZERO): AvailableToSpend {
  const available = liquid.minus(reserved).minus(upcomingBills);
  return { liquid, reserved, upcomingBills, available, overReserved: reserved.gt(liquid) };
}

/** Average net savings of up to `n` completed periods (falls back to the running period). */
export function averageMonthlySavings(points: readonly PeriodPoint[], today: ISODate, n = 3): Dec {
  const completed = points.filter((p) => p.period.end < today);
  const used = completed.slice(-n);
  if (used.length > 0) {
    return used.reduce((acc, p) => acc.plus(p.stats.netSavings), ZERO).div(used.length);
  }
  const current = points.find((p) => p.period.start <= today && today <= p.period.end);
  return current ? current.stats.netSavings : ZERO;
}

/* ================================================================== */
/* Savings strategies                                                   */
/* ================================================================== */

export const STRATEGY_IDS = ["SAVE_ALL", "PERCENT_TARGET", "FIXED_MONTHLY", "BUDGET_50_30_20", "EMERGENCY_FIRST"] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

export interface StrategyConfigs {
  PERCENT_TARGET: { percent: number };
  FIXED_MONTHLY: { amount: string };
  BUDGET_50_30_20: { needs: number; wants: number; savings: number };
  EMERGENCY_FIRST: { essentialMonthly: string; months: number };
}

export const DEFAULT_STRATEGY_CONFIGS: StrategyConfigs = {
  PERCENT_TARGET: { percent: 20 },
  FIXED_MONTHLY: { amount: "0" },
  BUDGET_50_30_20: { needs: 50, wants: 30, savings: 20 },
  EMERGENCY_FIRST: { essentialMonthly: "0", months: 6 },
};

export const STRATEGY_INFO: Record<StrategyId, { title: string; blurb: string }> = {
  SAVE_ALL: {
    title: "Save everything left",
    blurb: "Whatever you don't spend is savings. No targets, no rules — just your real numbers.",
  },
  PERCENT_TARGET: {
    title: "Percentage target",
    blurb: "Aim to keep a share of every salary. A goal to compare against, never a deduction from your balances.",
  },
  FIXED_MONTHLY: {
    title: "Fixed monthly amount",
    blurb: "Aim to save the same amount each month and see how far along you are.",
  },
  BUDGET_50_30_20: {
    title: "50 / 30 / 20 budget",
    blurb: "Needs, wants and savings as a share of income, with your actual spending next to each.",
  },
  EMERGENCY_FIRST: {
    title: "Emergency fund first",
    blurb: "Build a cushion of several months of essential costs before anything else.",
  },
};

export function parseStrategyConfigs(json: string | null | undefined): StrategyConfigs {
  let raw: Partial<Record<StrategyId, unknown>> = {};
  try {
    raw = json ? (JSON.parse(json) as typeof raw) : {};
  } catch {
    raw = {};
  }
  const merge = <K extends keyof StrategyConfigs>(key: K): StrategyConfigs[K] => ({
    ...DEFAULT_STRATEGY_CONFIGS[key],
    ...((raw[key] as object | undefined) ?? {}),
  });
  return {
    PERCENT_TARGET: merge("PERCENT_TARGET"),
    FIXED_MONTHLY: merge("FIXED_MONTHLY"),
    BUDGET_50_30_20: merge("BUDGET_50_30_20"),
    EMERGENCY_FIRST: merge("EMERGENCY_FIRST"),
  };
}

export type Bucket = "NEEDS" | "WANTS" | "OTHER";

export interface SourceTarget {
  sourceId: string;
  income: Dec;
  target: Dec;
  actual: Dec;
  /** actual − target: positive = ahead of the target */
  delta: Dec;
}

export interface SaveAllReport {
  strategy: "SAVE_ALL";
  income: Dec;
  spent: Dec;
  saved: Dec;
  rate: Dec | null;
}

export interface PercentReport {
  strategy: "PERCENT_TARGET";
  percent: number;
  income: Dec;
  target: Dec;
  actual: Dec;
  /** actual / target; null when there is no target yet */
  achieved: Dec | null;
  /** actual − target: positive = ahead */
  delta: Dec;
  bySource: SourceTarget[];
}

export interface FixedReport {
  strategy: "FIXED_MONTHLY";
  target: Dec;
  actual: Dec;
  remaining: Dec;
  achieved: Dec | null;
  periodEnd: ISODate;
  daysLeft: number;
  /** remaining ÷ days left */
  neededPerDay: Dec | null;
}

export interface BudgetLine {
  id: "NEEDS" | "WANTS" | "SAVINGS";
  label: string;
  percent: number;
  /** planned amount = income × percent */
  allocated: Dec;
  actual: Dec;
  /** needs/wants: allocated − actual (positive = under budget). savings: actual − allocated (positive = ahead) */
  delta: Dec;
  /** actual as a share of income */
  share: Dec | null;
}

export interface BudgetReport {
  strategy: "BUDGET_50_30_20";
  income: Dec;
  lines: BudgetLine[];
  /** spending in categories not marked as needs or wants */
  unclassified: Dec;
  percentSum: number;
}

export interface EmergencyReport {
  strategy: "EMERGENCY_FIRST";
  essentialMonthly: Dec;
  months: number;
  target: Dec;
  reserved: Dec;
  remaining: Dec;
  progress: Dec | null;
  /** how many months of essentials the reserved money covers */
  monthsCovered: Dec | null;
  done: boolean;
}

export type StrategyReport = SaveAllReport | PercentReport | FixedReport | BudgetReport | EmergencyReport;

export interface StrategyInput {
  /** stats over the global date range */
  stats: PeriodStats;
  /** stats of the running salary cycle / month (for monthly targets) */
  currentPeriod: { stats: PeriodStats; end: ISODate };
  today: ISODate;
  bucketOf: (categoryId: string) => Bucket;
  /** money reserved for emergency-fund goals, base currency */
  emergencyReservedBase: Dec;
}

export function strategyReport<K extends StrategyId>(
  strategy: K,
  configs: StrategyConfigs,
  input: StrategyInput,
): Extract<StrategyReport, { strategy: K }>;
export function strategyReport(strategy: StrategyId, configs: StrategyConfigs, input: StrategyInput): StrategyReport {
  const { stats } = input;
  switch (strategy) {
    case "SAVE_ALL":
      return { strategy, income: stats.income, spent: stats.spent.plus(stats.fees), saved: stats.netSavings, rate: stats.savingsRate };

    case "PERCENT_TARGET": {
      const percent = configs.PERCENT_TARGET.percent;
      const share = dec(percent).div(100);
      const target = round(stats.income.times(share), 2);
      const actual = stats.netSavings;
      const sourceIds = [...stats.incomeBySource.keys()];
      const bySource: SourceTarget[] = sourceIds.map((sourceId) => {
        const income = stats.incomeBySource.get(sourceId) ?? ZERO;
        const t = round(income.times(share), 2);
        const a = stats.netSavingsBySource.get(sourceId) ?? ZERO;
        return { sourceId, income, target: t, actual: a, delta: a.minus(t) };
      });
      return {
        strategy,
        percent,
        income: stats.income,
        target,
        actual,
        achieved: target.gt(0) ? actual.div(target) : null,
        delta: actual.minus(target),
        bySource,
      };
    }

    case "FIXED_MONTHLY": {
      const target = dec(configs.FIXED_MONTHLY.amount);
      const actual = input.currentPeriod.stats.netSavings;
      const remaining = target.minus(actual).gt(0) ? target.minus(actual) : ZERO;
      const daysLeft = Math.max(0, diffDays(input.today, input.currentPeriod.end));
      return {
        strategy,
        target,
        actual,
        remaining,
        achieved: target.gt(0) ? actual.div(target) : null,
        periodEnd: input.currentPeriod.end,
        daysLeft,
        neededPerDay: daysLeft > 0 && remaining.gt(0) ? remaining.div(daysLeft) : null,
      };
    }

    case "BUDGET_50_30_20": {
      const cfg = configs.BUDGET_50_30_20;
      let needs = ZERO;
      let wants = ZERO;
      let other = ZERO;
      for (const [categoryId, amount] of stats.spentByCategory) {
        const bucket = input.bucketOf(categoryId);
        if (bucket === "NEEDS") needs = needs.plus(amount);
        else if (bucket === "WANTS") wants = wants.plus(amount);
        else other = other.plus(amount);
      }
      const income = stats.income;
      const line = (id: BudgetLine["id"], label: string, percent: number, actual: Dec): BudgetLine => {
        const allocated = round(income.times(dec(percent).div(100)), 2);
        return {
          id,
          label,
          percent,
          allocated,
          actual,
          delta: id === "SAVINGS" ? actual.minus(allocated) : allocated.minus(actual),
          share: income.gt(0) ? actual.div(income) : null,
        };
      };
      return {
        strategy,
        income,
        lines: [
          line("NEEDS", "Needs", cfg.needs, needs),
          line("WANTS", "Wants", cfg.wants, wants),
          line("SAVINGS", "Savings", cfg.savings, stats.netSavings),
        ],
        unclassified: other,
        percentSum: cfg.needs + cfg.wants + cfg.savings,
      };
    }

    case "EMERGENCY_FIRST": {
      const essentialMonthly = dec(configs.EMERGENCY_FIRST.essentialMonthly);
      const months = configs.EMERGENCY_FIRST.months;
      const target = essentialMonthly.times(months);
      const reserved = input.emergencyReservedBase;
      return {
        strategy,
        essentialMonthly,
        months,
        target,
        reserved,
        remaining: target.minus(reserved).gt(0) ? target.minus(reserved) : ZERO,
        progress: target.gt(0) ? reserved.div(target) : null,
        monthsCovered: essentialMonthly.gt(0) ? reserved.div(essentialMonthly) : null,
        done: target.gt(0) && reserved.gte(target),
      };
    }
  }
}

/** Clamp a ratio to [0, 1] for progress bars. */
export function clampRatio(value: Dec | null | undefined): number {
  if (!value) return 0;
  const n = value.toNumber();
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
