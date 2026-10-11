import type { FlowPoint, StackPoint, StackSeries } from "@/components/charts/bar-charts";
import type { ForecastPoint } from "@/components/charts/forecast-chart";
import type { TrendPoint } from "@/components/charts/trend-chart";
import { sourceColor } from "@/lib/colors";
import { type ISODate, addDays, addYears, diffDays, minDate, monthNameShort, parseISO } from "@/lib/finance/dates";
import { billOccurrences, buildForecast, estimateVariableSpending } from "@/lib/finance/forecast";
import { type Insights, insightsFrom } from "@/lib/finance/insights";
import { type Dec, ZERO, dec } from "@/lib/finance/money";
import { type DateRange, periodContaining, periodsBetween, shiftPeriod } from "@/lib/finance/periods";
import { NO_CATEGORY, type PeriodStats, cumulativeSavingsSeries, periodSeries, periodStats, reconcile, sampleDates, sortedDesc, wealthSeries } from "@/lib/finance/stats";
import type { AppState } from "../session";
import { lookups } from "./common";
import { getCore } from "./core";
import { type CategoryRow, flowPoints, periodsForRange, trendLabel } from "./overview";

export interface CompareRow {
  label: string;
  a: Dec;
  b: Dec;
  kind: "money" | "percent";
  /** more of this is good / bad / neither */
  good: "up" | "down" | "none";
}

export interface CompareCategory {
  id: string | null;
  name: string;
  icon: string;
  color: string;
  a: Dec;
  b: Dec;
}

export interface AnalyticsModel {
  hasData: boolean;
  rangeText: string;
  insights: Insights;
  nextRecurring: Dec;
  flows: FlowPoint[];
  trend: TrendPoint[];
  cumulative: TrendPoint[];
  categories: CategoryRow[];
  categoriesTotal: Dec;
  bySource: { series: StackSeries[]; points: StackPoint[]; total: Dec };
  costs: { points: StackPoint[]; fees: Dec; spread: Dec; gains: Dec };
  compare: { mode: "prev" | "year"; aText: string; bText: string; rows: CompareRow[]; categories: CompareCategory[] };
  movement: { start: Dec; opening: Dec; income: Dec; spent: Dec; costs: Dec; fx: Dec; corrections: Dec; end: Dec; ratesMoved: boolean; startDate: ISODate };
  forecast: {
    points: ForecastPoint[];
    todayLabel: string;
    start: Dec;
    months: { label: string; income: Dec; bills: Dec; variable: Dec; net: Dec; end: Dec }[];
    assumptions: { variable: Dec; streams: number; bills: number; automatic: boolean };
    end: Dec;
  };
}

const shortMonth = (date: ISODate) => {
  const { y, m } = parseISO(date);
  return `${monthNameShort(m)} ’${String(y).slice(2)}`;
};

function rangeText(range: DateRange): string {
  const a = parseISO(range.from);
  const b = parseISO(range.to);
  return a.y === b.y && a.m === b.m && a.d === 1 ? `${monthNameShort(a.m)} ${a.y}` : `${a.d} ${monthNameShort(a.m)} – ${b.d} ${monthNameShort(b.m)} ${b.y}`;
}

export function buildAnalytics(s: AppState, cmp: "prev" | "year"): AnalyticsModel {
  const { ledger, today } = s;
  const lk = lookups(s);
  const core = getCore(s);

  const to = minDate(s.range.to, today);
  const range: DateRange = { from: s.range.from > to ? to : s.range.from, to };
  const stats = periodStats(ledger, range);

  /* ---- insights over every completed period (up to 3 years) ---- */
  const current = periodContaining(today, s.period);
  const firstP = s.firstDate ? periodContaining(s.firstDate, s.period) : current;
  const earliest = shiftPeriod(current, -35, s.period);
  const longFrom = firstP.start > earliest.start ? firstP.start : earliest.start;
  const long = periodSeries(ledger, periodsBetween(longFrom, current.end, s.period), today);
  const insights = insightsFrom(long, today);

  // recurring bills expected in the next 30 days (paid early or not)
  let nextRecurring = ZERO;
  for (const bill of s.bills.filter((b) => b.isActive)) {
    for (const o of billOccurrences(ledger, bill, { from: addDays(today, 1), to: addDays(today, 30) }, today)) {
      if (o.status !== "skipped") nextRecurring = nextRecurring.plus(o.amountBase);
    }
  }

  /* ---- period charts ---- */
  const periods = periodsForRange(range, s);
  const points = periodSeries(ledger, periods, today);
  const flows = flowPoints(s, periods);

  const longRange = diffDays(range.from, range.to) >= 13;
  let chartFrom = longRange ? range.from : addDays(range.to, -29);
  if (s.firstDate && chartFrom < s.firstDate) chartFrom = s.firstDate;
  if (chartFrom > range.to) chartFrom = range.to;
  const dates = sampleDates({ from: chartFrom, to: range.to }, 48);
  const step = dates.length > 1 ? diffDays(dates[0], dates[1]) : 1;
  const trend: TrendPoint[] = wealthSeries(ledger, dates).map((p) => ({ date: p.date, label: trendLabel(p.date, step), value: p.total.toNumber() }));
  const cumulativeDates = sampleDates(range, 48);
  const cStep = cumulativeDates.length > 1 ? diffDays(cumulativeDates[0], cumulativeDates[1]) : 1;
  const cumulative: TrendPoint[] = cumulativeSavingsSeries(ledger, range, cumulativeDates).map((p) => ({ date: p.date, label: trendLabel(p.date, cStep), value: p.cumulative.toNumber() }));

  /* ---- categories ---- */
  const q = new URLSearchParams({ from: range.from, to: range.to, type: "EXPENSE" });
  const catEntries = sortedDesc(stats.spentByCategory).filter(([, v]) => v.gt(0));
  const catTotal = catEntries.reduce((a, [, v]) => a.plus(v), ZERO);
  const categories: CategoryRow[] = catEntries.map(([id, amount]) => {
    const c = lk.category(id === NO_CATEGORY ? null : id);
    return { id: c.id, name: c.name, icon: c.icon, color: c.color, amount, share: catTotal.gt(0) ? amount.div(catTotal).toNumber() : 0, href: `/transactions?${q}&cat=${c.id ?? NO_CATEGORY}` };
  });

  /* ---- spending by income source, per period ---- */
  const used = new Map<string, Dec>();
  for (const pt of points) for (const [id, v] of pt.stats.spentBySource) used.set(id, (used.get(id) ?? ZERO).plus(v));
  const order = s.data.sources.filter((x) => used.get(x.id)?.gt(0)).sort((a, b) => Number(a.isSystem) - Number(b.isSystem) || a.sortOrder - b.sortOrder);
  const shown = order.slice(0, 4);
  const folded = order.slice(4);
  const series: StackSeries[] = shown.map((x) => ({ key: `s_${x.id}`, label: x.name, color: sourceColor(x.color, x.isSystem) }));
  if (folded.length > 0) series.push({ key: "s_other", label: "Other incomes", color: "var(--text-3)" });
  const sourcePoints: StackPoint[] = points.map((pt, i) => {
    const row: StackPoint = { label: flows[i].label, title: pt.period.label, from: flows[i].from, to: flows[i].to };
    for (const x of shown) row[`s_${x.id}`] = Math.max(0, (pt.stats.spentBySource.get(x.id) ?? ZERO).toNumber());
    if (folded.length > 0) row.s_other = folded.reduce((a, x) => a + Math.max(0, (pt.stats.spentBySource.get(x.id) ?? ZERO).toNumber()), 0);
    return row;
  });

  /* ---- fees and conversion costs ---- */
  let feeTotal = ZERO;
  let spreadTotal = ZERO;
  let gainTotal = ZERO;
  const costPoints: StackPoint[] = points.map((pt, i) => {
    feeTotal = feeTotal.plus(pt.stats.fees);
    const loss = pt.stats.conversionLoss;
    if (loss.gt(0)) spreadTotal = spreadTotal.plus(loss);
    else gainTotal = gainTotal.plus(loss.abs());
    return { label: flows[i].label, title: pt.period.label, from: flows[i].from, to: flows[i].to, fees: pt.stats.fees.toNumber(), spread: Math.max(0, loss.toNumber()) };
  });

  /* ---- comparison ---- */
  let other: DateRange;
  let bText: string;
  if (cmp === "year") {
    other = { from: addYears(range.from, -1), to: addYears(range.to, -1) };
    bText = `${rangeText(other)} (a year earlier)`;
  } else {
    const first = periodContaining(range.from, s.period);
    if (first.start === range.from && range.to <= first.end) {
      const prev = shiftPeriod(first, -1, s.period);
      other = { from: prev.start, to: minDate(prev.end, addDays(prev.start, diffDays(range.from, range.to))) };
    } else {
      const length = diffDays(range.from, range.to) + 1;
      other = { from: addDays(range.from, -length), to: addDays(range.from, -1) };
    }
    bText = rangeText(other);
  }
  const prev: PeriodStats = periodStats(ledger, other);
  const rows: CompareRow[] = [
    { label: "Income", a: stats.income, b: prev.income, kind: "money", good: "up" },
    { label: "Spent", a: stats.spent, b: prev.spent, kind: "money", good: "down" },
    { label: "Saved", a: stats.netSavings, b: prev.netSavings, kind: "money", good: "up" },
    { label: "Savings rate", a: stats.savingsRate ?? ZERO, b: prev.savingsRate ?? ZERO, kind: "percent", good: "up" },
    { label: "Fees & conversion costs", a: stats.fees.plus(stats.conversionLoss), b: prev.fees.plus(prev.conversionLoss), kind: "money", good: "down" },
  ];
  const catIds = new Set([...stats.spentByCategory.keys(), ...prev.spentByCategory.keys()]);
  const compareCategories: CompareCategory[] = [...catIds]
    .map((id) => {
      const c = lk.category(id === NO_CATEGORY ? null : id);
      return { id: c.id, name: c.name, icon: c.icon, color: c.color, a: stats.spentByCategory.get(id) ?? ZERO, b: prev.spentByCategory.get(id) ?? ZERO };
    })
    .sort((x, y) => y.a.plus(y.b).comparedTo(x.a.plus(x.b)))
    .slice(0, 7);

  /* ---- where the change in total money came from ---- */
  const rec = reconcile(ledger, range, { cap: today });
  const movement = {
    start: rec.startWealth,
    opening: rec.opening,
    income: rec.income,
    spent: rec.spent,
    costs: rec.fees.plus(rec.conversionLoss),
    fx: rec.revaluation,
    corrections: rec.adjustments,
    end: rec.endWealth,
    ratesMoved: rec.ratesMoved,
    startDate: addDays(range.from, -1),
  };

  /* ---- forecast ---- */
  let billsYear = ZERO;
  for (const bill of s.bills.filter((b) => b.isActive)) for (const o of billOccurrences(ledger, bill, { from: today, to: addDays(today, 365) }, today)) if (o.status !== "skipped") billsYear = billsYear.plus(o.amountBase);
  const configured = s.data.settings.forecastSpending ? dec(s.data.settings.forecastSpending) : null;
  const variable = configured ?? estimateVariableSpending(core.series, today, billsYear.div(12));
  const forecast = buildForecast({ ledger, today, months: 6, streams: s.streams, bills: s.bills, variableMonthly: variable, period: s.period });
  const histStart = shiftPeriod(current, -5, s.period).start;
  const histDates = [...new Set([...sampleDates({ from: s.firstDate && s.firstDate > histStart ? s.firstDate : histStart, to: today }, 30), today])].sort();
  const hStep = histDates.length > 1 ? diffDays(histDates[0], histDates[1]) : 1;
  const history = wealthSeries(ledger, histDates);
  const todayLabel = trendLabel(today, hStep);
  const fPoints: ForecastPoint[] = history.map((p) => ({ date: p.date, label: trendLabel(p.date, hStep), actual: p.total.toNumber() }));
  const last = fPoints[fPoints.length - 1];
  if (last) last.projected = last.actual;
  for (const m of forecast.months) {
    const end = minDate(m.period.end, addDays(today, 400));
    if (end <= today) continue;
    fPoints.push({ date: end, label: shortMonth(end), projected: m.endBalance.toNumber() });
  }

  return {
    hasData: s.data.transactions.length > 0,
    rangeText: rangeText(range),
    insights,
    nextRecurring,
    flows,
    trend,
    cumulative,
    categories,
    categoriesTotal: catTotal,
    bySource: { series, points: sourcePoints, total: [...used.values()].reduce((a, v) => a.plus(v), ZERO) },
    costs: { points: costPoints, fees: feeTotal, spread: spreadTotal, gains: gainTotal },
    compare: { mode: cmp, aText: rangeText(range), bText, rows, categories: compareCategories },
    movement,
    forecast: {
      points: fPoints,
      todayLabel,
      start: forecast.startBalance,
      months: forecast.months.map((m) => ({ label: m.period.label, income: m.income, bills: m.bills, variable: m.variable, net: m.net, end: m.endBalance })),
      assumptions: { variable, streams: forecast.assumptions.streams, bills: forecast.assumptions.bills, automatic: configured === null },
      end: forecast.months[forecast.months.length - 1]?.endBalance ?? forecast.startBalance,
    },
  };
}

