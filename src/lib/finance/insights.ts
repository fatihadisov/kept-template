import type { ISODate } from "./dates";
import { type Dec, ZERO } from "./money";
import type { PeriodPoint } from "./stats";

export interface Insights {
  /** completed periods that had any activity, oldest first */
  periods: PeriodPoint[];
  avgIncome: Dec;
  avgSpent: Dec;
  avgSavings: Dec;
  avgSavingsRate: Dec | null;
  highestSpending: PeriodPoint | null;
  lowestSpending: PeriodPoint | null;
  bestSavings: PeriodPoint | null;
  worstSavings: PeriodPoint | null;
  /** (latest − previous) / previous spending of the two latest completed periods */
  spendingGrowth: Dec | null;
  savingsRateTrend: { direction: "up" | "down" | "flat"; delta: Dec } | null;
}

const hasActivity = (p: PeriodPoint) => p.stats.income.gt(0) || p.stats.spent.gt(0) || p.stats.fees.gt(0);

/**
 * Month-over-month statistics from a series of periods. Only COMPLETED periods with activity are
 * used, so a half-finished month does not drag the averages down.
 */
export function insightsFrom(points: readonly PeriodPoint[], today: ISODate): Insights {
  const periods = points.filter((p) => p.period.end < today && hasActivity(p));
  const n = periods.length;

  const total = (pick: (p: PeriodPoint) => Dec) => periods.reduce((acc, p) => acc.plus(pick(p)), ZERO);
  const avg = (pick: (p: PeriodPoint) => Dec) => (n ? total(pick).div(n) : ZERO);

  const extreme = (pick: (p: PeriodPoint) => Dec, dir: 1 | -1): PeriodPoint | null => {
    let best: PeriodPoint | null = null;
    for (const p of periods) {
      if (!best || pick(p).comparedTo(pick(best)) * dir > 0) best = p;
    }
    return best;
  };

  const incomeTotal = total((p) => p.stats.income);
  const avgSavingsRate = incomeTotal.gt(0) ? total((p) => p.stats.netSavings).div(incomeTotal) : null;

  let spendingGrowth: Dec | null = null;
  if (n >= 2) {
    const last = periods[n - 1].stats.spent;
    const prev = periods[n - 2].stats.spent;
    if (prev.gt(0)) spendingGrowth = last.minus(prev).div(prev);
  }

  let savingsRateTrend: Insights["savingsRateTrend"] = null;
  const rates = periods.map((p) => p.stats.savingsRate).filter((r): r is Dec => r !== null);
  if (rates.length >= 2) {
    const half = Math.max(1, Math.floor(rates.length / 2));
    const recent = rates.slice(-half);
    const earlier = rates.slice(0, rates.length - half).slice(-half);
    const mean = (xs: Dec[]) => xs.reduce((a, x) => a.plus(x), ZERO).div(xs.length);
    const delta = mean(recent).minus(mean(earlier));
    savingsRateTrend = {
      direction: delta.gt(0.01) ? "up" : delta.lt(-0.01) ? "down" : "flat",
      delta,
    };
  }

  return {
    periods,
    avgIncome: avg((p) => p.stats.income),
    avgSpent: avg((p) => p.stats.spent),
    avgSavings: avg((p) => p.stats.netSavings),
    avgSavingsRate,
    highestSpending: extreme((p) => p.stats.spent, 1),
    lowestSpending: extreme((p) => p.stats.spent, -1),
    bestSavings: extreme((p) => p.stats.netSavings, 1),
    worstSavings: extreme((p) => p.stats.netSavings, -1),
    spendingGrowth,
    savingsRateTrend,
  };
}
