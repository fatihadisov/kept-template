import { type ISODate, addDays, diffDays, formatDateShort, formatRelativeDay, minDate, monthNameShort, parseISO } from "@/lib/finance/dates";
import { expectedPayments } from "@/lib/finance/income";
import { type Dec, ZERO, dec } from "@/lib/finance/money";
import { type DateRange, type Period, periodContaining, periodsBetween, shiftPeriod } from "@/lib/finance/periods";
import { detectOverdrafts } from "@/lib/finance/queries";
import { clampRatio } from "@/lib/finance/savings";
import { NO_CATEGORY, periodStats, reconcile, sampleDates, sortedDesc, wealthSeries, periodSeries } from "@/lib/finance/stats";
import type { TrendPoint } from "@/components/charts/trend-chart";
import type { FlowPoint } from "@/components/charts/bar-charts";
import type { AppState } from "../session";
import { lookups, plural } from "./common";
import { getCore } from "./core";
import { type TxRowModel, buildTxRows } from "./tx-rows";
import { type WalletRow, walletRows } from "./wallets";

export interface Alert {
  id: string;
  tone: "danger" | "warn" | "info";
  title: string;
  body?: string;
  href?: string;
  actionLabel?: string;
}

export interface SourceRow {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
  remaining: Dec;
  received: Dec;
  spent: Dec;
  saved: Dec;
  rate: Dec | null;
  /** foreign-currency holdings, e.g. "$1,200.00" */
  holdings: { currency: string; amount: Dec }[];
}

export interface CategoryRow {
  id: string | null;
  name: string;
  icon: string;
  color: string;
  amount: Dec;
  share: number;
  href: string;
}

export interface BudgetRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  limit: Dec;
  used: Dec;
  ratio: number;
  state: "ok" | "near" | "over";
}

export interface UpcomingItem {
  id: string;
  kind: "bill" | "income";
  date: ISODate;
  when: string;
  overdue: boolean;
  title: string;
  /** formatted amount */
  amount: string;
  bill?: { billId: string; dueDate: ISODate };
  income?: { streamId: string; dueDate: ISODate; accountId: string | null; amount: string; currency: string };
}

export interface OverviewModel {
  hasAccounts: boolean;
  hasTransactions: boolean;
  rangeText: string;
  total: Dec;
  available: Dec;
  reserved: Dec;
  overReserved: boolean;
  billsDeducted: Dec;
  /** how the total moved over the selected range */
  movement: { saved: Dec; fx: Dec; hasFx: boolean; added: Dec; corrections: Dec; change: Dec };
  trend: TrendPoint[];
  kpi: {
    spent: Dec;
    spentDelta: number | null;
    saved: Dec;
    savedDelta: Dec;
    rate: Dec | null;
    rateDeltaPts: number | null;
    comparedTo: string;
    spentSpark: number[];
    savedSpark: number[];
    income: Dec;
  };
  goal: { id: string; name: string; icon: string; color: string | null; ratio: number; current: Dec; target: Dec; currency: string; done: boolean } | null;
  sources: SourceRow[];
  wallets: WalletRow[];
  flows: FlowPoint[];
  categories: CategoryRow[];
  categoriesTotal: Dec;
  budgets: BudgetRow[];
  upcoming: UpcomingItem[];
  recent: TxRowModel[];
  alerts: Alert[];
}

/** The equally-long window just before `range`, or "the same point of the previous period" for a period-aligned range. */
function comparison(range: DateRange, s: AppState): { range: DateRange; label: string } {
  const first = periodContaining(range.from, s.period);
  if (first.start === range.from && range.to <= first.end) {
    const prev = shiftPeriod(first, -1, s.period);
    const to = minDate(prev.end, addDays(prev.start, diffDays(range.from, range.to)));
    return { range: { from: prev.start, to }, label: s.period.mode === "MONTH" ? "last month" : "last cycle" };
  }
  const length = diffDays(range.from, range.to) + 1;
  return { range: { from: addDays(range.from, -length), to: addDays(range.from, -1) }, label: length === 1 ? "yesterday" : "the previous period" };
}

/** "Oct", or "Jan ’27" at the start of a year / series, so a long axis stays unambiguous. */
function shortLabel(p: Period, index: number, mode: "MONTH" | "CYCLE"): string {
  const { y, m, d } = parseISO(p.start);
  const base = mode === "CYCLE" ? `${d} ${monthNameShort(m)}` : monthNameShort(m);
  return index === 0 || m === 1 ? `${base} ’${String(y).slice(2)}` : base;
}

export function flowPoints(s: AppState, periods: Period[]): FlowPoint[] {
  return periodSeries(s.ledger, periods, s.today).map((pt, i) => ({
    key: pt.period.key,
    label: shortLabel(pt.period, i, s.period.mode),
    title: pt.period.label,
    from: pt.period.start,
    to: pt.period.end < s.today ? pt.period.end : s.today,
    income: pt.stats.income.toNumber(),
    spent: pt.stats.spent.toNumber(),
    net: pt.stats.netSavings.toNumber(),
  }));
}

/** Which periods a chart should show for the selected range. */
export function periodsForRange(range: DateRange, s: AppState): Period[] {
  const first = periodContaining(range.from, s.period);
  const last = periodContaining(range.to, s.period);
  const inRange = periodsBetween(first.start, last.end, s.period);
  if (inRange.length >= 2) return inRange.slice(-12);
  return periodsBetween(shiftPeriod(last, -5, s.period).start, last.end, s.period);
}

export function trendLabel(date: ISODate, stepDays: number): string {
  const { y, m, d } = parseISO(date);
  return stepDays >= 28 ? `${monthNameShort(m)} ’${String(y).slice(2)}` : `${d} ${monthNameShort(m)}`;
}

export function buildOverview(s: AppState): OverviewModel {
  const { ledger, today, fmt: f } = s;
  const lk = lookups(s);
  const core = getCore(s);

  const to = minDate(s.range.to, today);
  const from = s.range.from > to ? to : s.range.from;
  const range: DateRange = { from, to };

  const stats = periodStats(ledger, range);
  const cmp = comparison(range, s);
  const prev = periodStats(ledger, cmp.range);
  const rec = reconcile(ledger, range, { cap: today });

  /* ---- money over time ---- */
  const longRange = diffDays(range.from, range.to) >= 13;
  const earliest = s.firstDate ?? range.from;
  let chartFrom = longRange ? range.from : addDays(range.to, -29);
  if (chartFrom < earliest) chartFrom = earliest;
  if (chartFrom > range.to) chartFrom = range.to;
  const dates = sampleDates({ from: chartFrom, to: range.to }, 48);
  const step = dates.length > 1 ? diffDays(dates[0], dates[1]) : 1;
  const trend: TrendPoint[] = wealthSeries(ledger, dates).map((p) => ({ date: p.date, label: trendLabel(p.date, step), value: p.total.toNumber() }));

  /* ---- stat tiles ---- */
  const spark = core.series.slice(-12);
  const rateDelta = stats.savingsRate && prev.savingsRate ? stats.savingsRate.minus(prev.savingsRate).times(100).toNumber() : null;
  const spentDelta = prev.spent.gt(0) ? stats.spent.minus(prev.spent).div(prev.spent).toNumber() : null;

  /* ---- primary goal ---- */
  const goals = s.data.goals.filter((g) => !g.archived);
  const primary =
    goals.find((g) => g.isPrimary) ??
    [...goals].sort((a, b) => a.priority - b.priority)[0] ??
    null;
  const primaryProgress = primary ? core.progress.find((p) => p.goalId === primary.id) : null;

  /* ---- sources ---- */
  const sources: SourceRow[] = [];
  for (const src of s.data.sources) {
    const bal = core.snap.sources.find((x) => x.sourceId === src.id);
    const remaining = bal?.baseValue ?? ZERO;
    const received = stats.incomeBySource.get(src.id) ?? ZERO;
    const spent = (stats.spentBySource.get(src.id) ?? ZERO).plus(stats.feesBySource.get(src.id) ?? ZERO);
    if (src.isSystem && remaining.isZero() && spent.isZero()) continue;
    if (!src.isSystem && !src.isActive && remaining.isZero() && received.isZero() && spent.isZero()) continue;
    const info = lk.source(src.id);
    sources.push({
      id: src.id,
      name: src.name,
      color: info.color,
      isSystem: src.isSystem,
      remaining,
      received,
      spent,
      saved: received.minus(spent),
      rate: received.gt(0) ? received.minus(spent).div(received) : null,
      holdings: (bal?.holdings ?? []).filter((h) => h.currency !== ledger.base && !h.amount.isZero()).map((h) => ({ currency: h.currency, amount: h.amount })),
    });
  }
  sources.sort((a, b) => Number(a.isSystem) - Number(b.isSystem));

  /* ---- wallets ---- */
  const wallets = walletRows(s, core.snap, core.state, lk);

  /* ---- categories ---- */
  const catEntries = sortedDesc(stats.spentByCategory).filter(([, v]) => v.gt(0));
  const spentGross = catEntries.reduce((a, [, v]) => a.plus(v), ZERO);
  const q = new URLSearchParams({ from: range.from, to: range.to, type: "EXPENSE" });
  const mkCategory = ([id, amount]: [string, Dec]): CategoryRow => {
    const c = lk.category(id === NO_CATEGORY ? null : id);
    return {
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      amount,
      share: spentGross.gt(0) ? amount.div(spentGross).toNumber() : 0,
      href: `/transactions?${q.toString()}&cat=${c.id ?? NO_CATEGORY}`,
    };
  };
  const categories = catEntries.slice(0, 6).map(mkCategory);
  const rest = catEntries.slice(6);
  if (rest.length > 0) {
    const amount = rest.reduce((a, [, v]) => a.plus(v), ZERO);
    categories.push({ id: null, name: `${plural(rest.length, "other category", "other categories")}`, icon: "circle-ellipsis", color: "#A5A8AE", amount, share: amount.div(spentGross).toNumber(), href: `/transactions?${q.toString()}` });
  }

  /* ---- budgets (always for the current period) ---- */
  const budgets: BudgetRow[] = [];
  for (const b of s.data.budgets.filter((x) => x.isActive)) {
    const used = b.categoryId ? (core.currentStats.spentByCategory.get(b.categoryId) ?? ZERO) : core.currentStats.spent;
    const limit = dec(b.amount);
    const ratio = limit.gt(0) ? used.div(limit).toNumber() : 0;
    const c = b.categoryId ? lk.category(b.categoryId) : null;
    budgets.push({
      id: b.id,
      name: c?.name ?? "All spending",
      icon: c?.icon ?? "wallet",
      color: c?.color ?? "#4E8D6E",
      limit,
      used,
      ratio,
      state: ratio >= 1 ? "over" : ratio >= 0.8 ? "near" : "ok",
    });
  }
  budgets.sort((a, b) => b.ratio - a.ratio);

  /* ---- upcoming: bills + expected pay ---- */
  const upcoming: UpcomingItem[] = [];
  for (const o of core.bills.filter((x) => x.dueDate <= addDays(today, 14))) {
    const bill = s.data.recurring.find((r) => r.id === o.billId);
    if (!bill) continue;
    upcoming.push({
      id: `bill-${o.billId}-${o.dueDate}`,
      kind: "bill",
      date: o.dueDate,
      when: formatRelativeDay(o.dueDate, today),
      overdue: o.status === "overdue",
      title: bill.description,
      amount: f.money(o.amount, o.currency),
      bill: { billId: o.billId, dueDate: o.dueDate },
    });
  }
  for (const stream of s.streams.filter((x) => x.isActive)) {
    for (const p of expectedPayments(ledger, stream, { from: addDays(today, -10), to: addDays(today, 14) }, today)) {
      if (p.status === "received") continue;
      const remaining = p.expected && p.receivedNative ? p.expected.minus(p.receivedNative) : p.expected;
      if (!remaining || remaining.lte(0)) continue;
      upcoming.push({
        id: `inc-${stream.id}-${p.dueDate}`,
        kind: "income",
        date: p.dueDate,
        when: formatRelativeDay(p.dueDate, today),
        overdue: p.status === "overdue" || (p.status === "partial" && p.dueDate < today),
        title: p.status === "partial" ? `${stream.name} · rest of pay` : stream.name,
        amount: f.money(remaining, stream.currency),
        income: { streamId: stream.id, dueDate: p.dueDate, accountId: stream.destinationAccountId, amount: remaining.toFixed(), currency: stream.currency },
      });
    }
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === "income" ? -1 : 1));

  /* ---- alerts ---- */
  const alerts: Alert[] = [];
  for (const o of detectOverdrafts(ledger).filter((x) => x.endBalance.isNegative())) {
    const acc = lk.accounts.get(o.accountId);
    alerts.push({
      id: `neg-${o.accountId}`,
      tone: "danger",
      title: `${acc?.name ?? "An account"} is below zero`,
      body: `It holds ${f.money(o.endBalance, acc?.currency ?? ledger.base)}. A missing income, or a correction needed?`,
      href: "/wallets",
      actionLabel: "Review",
    });
  }
  for (const ccy of ledger.missingRates) {
    alerts.push({
      id: `rate-${ccy}`,
      tone: "warn",
      title: `Set a ${ccy} → ${ledger.base} exchange rate`,
      body: `Balances in ${ccy} can't be valued until there is a rate.`,
      href: "/settings#rates",
      actionLabel: "Set rate",
    });
  }
  if (ledger.issues.some((i) => i.code !== "MISSING_RATE" && i.code !== "CURRENCY_MISMATCH")) {
    alerts.push({ id: "issues", tone: "warn", title: "Some entries couldn't be read", body: "They reference an account or income that no longer exists. They are ignored until fixed.", href: "/settings#data", actionLabel: "Details" });
  }
  if (core.avail.overReserved) {
    alerts.push({ id: "over-reserved", tone: "warn", title: "More is reserved than you have", body: "Goals hold more than your savings. Release some on the Savings page.", href: "/savings", actionLabel: "Review" });
  }

  /* ---- recent ---- */
  const recent = buildTxRows(s, ledger.txs.filter((r) => r.tx.date <= today).slice(-7).reverse(), lk);

  return {
    hasAccounts: s.data.accounts.length > 0,
    hasTransactions: s.data.transactions.length > 0,
    rangeText: s.preset === "custom" ? `${formatDateShort(range.from, today)} – ${formatDateShort(range.to, today)}` : "",
    total: core.snap.total,
    available: core.avail.available,
    reserved: core.avail.reserved,
    overReserved: core.avail.overReserved,
    billsDeducted: s.data.settings.deductUpcomingBills ? core.billsTotal : ZERO,
    movement: { saved: rec.netSavings, fx: rec.revaluation.minus(rec.conversionLoss), hasFx: rec.ratesMoved || !rec.conversionLoss.isZero(), added: rec.opening, corrections: rec.adjustments, change: rec.change },
    trend,
    kpi: {
      spent: stats.spent,
      spentDelta,
      saved: stats.netSavings,
      savedDelta: stats.netSavings.minus(prev.netSavings),
      rate: stats.savingsRate,
      rateDeltaPts: rateDelta,
      comparedTo: cmp.label,
      spentSpark: spark.map((p) => p.stats.spent.toNumber()),
      savedSpark: spark.map((p) => p.stats.netSavings.toNumber()),
      income: stats.income,
    },
    goal:
      primary && primaryProgress
        ? {
            id: primary.id,
            name: primary.name,
            icon: primary.icon,
            color: primary.color,
            ratio: clampRatio(primaryProgress.ratio),
            current: primaryProgress.current,
            target: primaryProgress.target,
            currency: primary.currency,
            done: primaryProgress.done,
          }
        : null,
    sources,
    wallets,
    flows: flowPoints(s, periodsForRange(range, s)),
    categories,
    categoriesTotal: spentGross,
    budgets,
    upcoming: upcoming.slice(0, 7),
    recent,
    alerts,
  };
}

