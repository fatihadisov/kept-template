import type { TrendPoint } from "@/components/charts/trend-chart";
import type { FlowPoint } from "@/components/charts/bar-charts";
import type { GoalView } from "@/lib/app-types";
import type { ISODate } from "@/lib/finance/dates";
import { type Dec, ZERO } from "@/lib/finance/money";
import { diffDays } from "@/lib/finance/dates";
import { periodStats, reconcile, sampleDates, wealthSeries } from "@/lib/finance/stats";
import {
  type GoalProgress,
  type StrategyReport,
  STRATEGY_INFO,
  clampRatio,
  reservedIn,
  strategyReport,
} from "@/lib/finance/savings";
import type { AppState } from "../session";
import { getCore } from "./core";
import { flowPoints, trendLabel } from "./overview";

export interface GoalCard {
  goal: GoalView;
  progress: GoalProgress;
  ratio: number;
  /** what's set aside right now, in the goal's currency */
  reserved: Dec;
}

export interface SavingsModel {
  total: Dec;
  reserved: Dec;
  available: Dec;
  billsDeducted: Dec;
  overReserved: boolean;
  /** the all-time "how it adds up" statement */
  lifetime: {
    since: ISODate | null;
    starting: Dec;
    earned: Dec;
    spent: Dec;
    costs: Dec;
    revaluation: Dec;
    corrections: Dec;
    saved: Dec;
  };
  strategy: { id: string; title: string; blurb: string; report: StrategyReport };
  periodLabel: string;
  goals: GoalCard[];
  archivedGoals: GoalView[];
  avgMonthly: Dec;
  trend: TrendPoint[];
  flows: FlowPoint[];
}

export function buildSavings(s: AppState): SavingsModel {
  const { ledger, today, data } = s;
  const core = getCore(s);

  /* ---- all time ---- */
  const since = s.firstDate;
  const rec = reconcile(ledger, { from: since ?? today, to: today }, { cap: today });

  /* ---- strategy ---- */
  const to = s.range.to < today ? s.range.to : today;
  const range = { from: s.range.from > to ? to : s.range.from, to };
  const stats = periodStats(ledger, range);
  const buckets = new Map(data.categories.map((c) => [c.id, c.bucket]));
  const emergencyReserved = data.goals
    .filter((g) => !g.archived && g.kind === "EMERGENCY")
    .reduce((acc, g) => acc.plus(reservedIn(g).times(core.toBase(g.currency))), ZERO);
  const id = data.settings.activeStrategy;
  const report = strategyReport(id, data.settings.strategyConfig, {
    stats,
    currentPeriod: { stats: core.currentStats, end: core.currentPeriod.end },
    today,
    bucketOf: (categoryId) => buckets.get(categoryId) ?? "OTHER",
    emergencyReservedBase: emergencyReserved,
  });

  /* ---- goals ---- */
  const byId = new Map(core.progress.map((p) => [p.goalId, p]));
  const goals: GoalCard[] = data.goals
    .filter((g) => !g.archived)
    .map((g) => {
      const progress = byId.get(g.id) as GoalProgress;
      return { goal: g, progress, ratio: clampRatio(progress.ratio), reserved: reservedIn(g) };
    })
    .sort((a, b) => Number(b.goal.isPrimary) - Number(a.goal.isPrimary) || a.goal.priority - b.goal.priority || (a.goal.targetDate ?? "9999").localeCompare(b.goal.targetDate ?? "9999"));

  /* ---- growth ---- */
  const dates = sampleDates({ from: since && diffDays(since, today) > 0 ? since : today, to: today }, 48);
  const step = dates.length > 1 ? diffDays(dates[0], dates[1]) : 1;
  const trend: TrendPoint[] = wealthSeries(ledger, dates).map((p) => ({ date: p.date, label: trendLabel(p.date, step), value: p.total.toNumber() }));
  const flows = flowPoints(s, core.series.map((p) => p.period).slice(-12));

  const info = STRATEGY_INFO[id];
  return {
    total: core.snap.total,
    reserved: core.avail.reserved,
    available: core.avail.available,
    billsDeducted: data.settings.deductUpcomingBills ? core.billsTotal : ZERO,
    overReserved: core.avail.overReserved,
    lifetime: {
      since,
      starting: rec.opening,
      earned: rec.income,
      spent: rec.spent,
      costs: rec.fees.plus(rec.conversionLoss),
      revaluation: rec.revaluation,
      corrections: rec.adjustments,
      saved: rec.endWealth,
    },
    strategy: { id, title: info.title, blurb: info.blurb, report },
    periodLabel: core.currentPeriod.label,
    goals,
    archivedGoals: data.goals.filter((g) => g.archived),
    avgMonthly: core.avgMonthlySavings,
    trend,
    flows,
  };
}

