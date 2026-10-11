import { type ISODate, addDays, diffDays, eachDay, endOfMonth, minDate } from "./dates";
import { distribute } from "./distribute";
import { type Dec, ZERO } from "./money";
import type { Period } from "./periods";
import { type Snapshot, replay, snapshotFromState } from "./queries";
import type { Ledger, Part, ResolvedTx } from "./types";

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

/** Key used in category maps for expenses with no category. */
export const NO_CATEGORY = "__none__";

function add(map: Map<string, Dec>, key: string, value: Dec): void {
  map.set(key, (map.get(key) ?? ZERO).plus(value));
}

/** Transactions whose date falls in [from, to] (ledger order). Uses binary search on the sorted list. */
export function txsInRange(ledger: Ledger, range: DateRange): ResolvedTx[] {
  const list = ledger.txs;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].tx.date < range.from) lo = mid + 1;
    else hi = mid;
  }
  const out: ResolvedTx[] = [];
  for (let i = lo; i < list.length && list[i].tx.date <= range.to; i += 1) out.push(list[i]);
  return out;
}

export interface PeriodStats {
  range: DateRange;
  /** salary / bonus / side income received (excludes opening balances and refunds) */
  income: Dec;
  incomeBySource: Map<string, Dec>;
  /** genuine expenses net of refunds */
  spent: Dec;
  grossExpenses: Dec;
  refunds: Dec;
  spentBySource: Map<string, Dec>;
  spentByCategory: Map<string, Dec>;
  spentByAccount: Map<string, Dec>;
  /** separately charged transfer / conversion commissions */
  fees: Dec;
  feesBySource: Map<string, Dec>;
  /** realised exchange-rate cost (embedded spread etc.): positive = lost, negative = gained */
  conversionLoss: Dec;
  /** existing funds introduced as opening balances (NOT income) */
  opening: Dec;
  /** reconciliation corrections */
  adjustments: Dec;
  /** income - spent - fees. The "automatic savings" of the period. */
  netSavings: Dec;
  netSavingsBySource: Map<string, Dec>;
  /** netSavings / income, or null when there was no income */
  savingsRate: Dec | null;
  incomeCount: number;
  expenseCount: number;
}

function emptyStats(range: DateRange): PeriodStats {
  return {
    range,
    income: ZERO,
    incomeBySource: new Map(),
    spent: ZERO,
    grossExpenses: ZERO,
    refunds: ZERO,
    spentBySource: new Map(),
    spentByCategory: new Map(),
    spentByAccount: new Map(),
    fees: ZERO,
    feesBySource: new Map(),
    conversionLoss: ZERO,
    opening: ZERO,
    adjustments: ZERO,
    netSavings: ZERO,
    netSavingsBySource: new Map(),
    savingsRate: null,
    incomeCount: 0,
    expenseCount: 0,
  };
}

/** Split `total` (signed) across the attribution parts, exactly. */
function splitByParts(total: Dec, parts: readonly Part[], decimals: number): { sourceId: string; amount: Dec }[] {
  if (total.isZero() || parts.length === 0) return [];
  const amounts = distribute(total, parts.map((p) => p.amount.abs()), decimals);
  return parts.map((p, i) => ({ sourceId: p.sourceId, amount: amounts[i] }));
}

export function periodStats(ledger: Ledger, range: DateRange): PeriodStats {
  const s = emptyStats(range);
  const bd = ledger.baseDecimals;

  for (const r of txsInRange(ledger, range)) {
    const { tx, metrics: m, parts } = r;
    switch (tx.type) {
      case "INCOME": {
        s.income = s.income.plus(m.incomeBase);
        s.incomeCount += 1;
        add(s.incomeBySource, parts[0]?.sourceId ?? ledger.defaultSourceId, m.incomeBase);
        break;
      }
      case "OPENING":
        s.opening = s.opening.plus(m.openingBase);
        break;
      case "EXPENSE":
      case "REFUND": {
        s.spent = s.spent.plus(m.expenseBase);
        if (tx.type === "EXPENSE") {
          s.grossExpenses = s.grossExpenses.plus(m.expenseBase);
          s.expenseCount += 1;
        } else {
          s.refunds = s.refunds.plus(m.expenseBase.neg());
        }
        add(s.spentByCategory, tx.categoryId ?? NO_CATEGORY, m.expenseBase);
        add(s.spentByAccount, tx.accountId, m.expenseBase);
        for (const piece of splitByParts(m.expenseBase, parts, bd)) add(s.spentBySource, piece.sourceId, piece.amount);
        s.conversionLoss = s.conversionLoss.plus(m.fxLossBase);
        break;
      }
      case "TRANSFER":
      case "EXCHANGE": {
        s.fees = s.fees.plus(m.feeBase);
        for (const piece of splitByParts(m.feeBase, parts, bd)) add(s.feesBySource, piece.sourceId, piece.amount);
        s.conversionLoss = s.conversionLoss.plus(m.fxLossBase);
        break;
      }
      case "ADJUSTMENT":
        s.adjustments = s.adjustments.plus(m.adjustmentBase);
        break;
    }
  }

  s.netSavings = s.income.minus(s.spent).minus(s.fees);
  const ids = new Set<string>([...s.incomeBySource.keys(), ...s.spentBySource.keys(), ...s.feesBySource.keys()]);
  for (const id of ids) {
    s.netSavingsBySource.set(
      id,
      (s.incomeBySource.get(id) ?? ZERO).minus(s.spentBySource.get(id) ?? ZERO).minus(s.feesBySource.get(id) ?? ZERO),
    );
  }
  s.savingsRate = s.income.gt(0) ? s.netSavings.div(s.income) : null;
  return s;
}

/* ------------------------------------------------------------------ */
/* Wealth reconciliation                                                */
/* ------------------------------------------------------------------ */

export interface Reconciliation {
  range: DateRange;
  startWealth: Dec;
  endWealth: Dec;
  change: Dec;
  opening: Dec;
  income: Dec;
  spent: Dec;
  fees: Dec;
  conversionLoss: Dec;
  adjustments: Dec;
  /** income - spent - fees: the savings the user actually generated */
  netSavings: Dec;
  /** what is left of the change once every flow is explained: re-pricing at new exchange rates */
  revaluation: Dec;
  /** false when no rate moved in the period, i.e. `revaluation` is only cent rounding */
  ratesMoved: boolean;
  start: Snapshot;
  end: Snapshot;
}

/**
 * Explains the change in total wealth over a range:
 *
 *   change = existing funds added + income − spent − fees − conversion loss + corrections + revaluation
 *
 * The first terms are valued at each transaction's frozen rates. `revaluation` is the effect of
 * exchange rates moving on money held, so a rate change can never masquerade as savings.
 */
export function reconcile(ledger: Ledger, range: DateRange, opts?: { cap?: ISODate }): Reconciliation {
  const to = opts?.cap ? minDate(range.to, opts.cap) : range.to;
  const effective: DateRange = { from: range.from, to };
  const startDate = addDays(range.from, -1);

  let start!: Snapshot;
  let end!: Snapshot;
  replay(ledger, [startDate, to], (date, state) => {
    const snap = snapshotFromState(ledger, state, date);
    if (date === startDate && !start) start = snap;
    else end = snap;
  });
  // replay emits startDate then `to`; when to < startDate (empty range) both calls collapse
  if (!end) end = start;

  const stats = periodStats(ledger, effective);
  const change = end.total.minus(start.total);
  const explained = stats.opening
    .plus(stats.income)
    .minus(stats.spent)
    .minus(stats.fees)
    .minus(stats.conversionLoss)
    .plus(stats.adjustments);
  const revaluation = change.minus(explained);

  let ratesMoved = false;
  const heldCurrencies = new Set([...ledger.accounts.values()].map((a) => a.currency));
  for (const ccy of heldCurrencies) {
    if (ccy === ledger.base) continue;
    const a = ledger.rates.toBase(ccy, startDate);
    const b = ledger.rates.toBase(ccy, to);
    if (a && b && !a.eq(b)) ratesMoved = true;
  }
  if (!ratesMoved) {
    for (const r of txsInRange(ledger, effective)) {
      for (const [ccy, frozen] of Object.entries(r.tx.fx ?? {})) {
        const live = ledger.rates.toBase(ccy, to);
        if (live && !live.eq(frozen)) ratesMoved = true;
      }
    }
  }

  return {
    range: effective,
    startWealth: start.total,
    endWealth: end.total,
    change,
    opening: stats.opening,
    income: stats.income,
    spent: stats.spent,
    fees: stats.fees,
    conversionLoss: stats.conversionLoss,
    adjustments: stats.adjustments,
    netSavings: stats.netSavings,
    revaluation,
    ratesMoved,
    start,
    end,
  };
}

/* ------------------------------------------------------------------ */
/* Series                                                               */
/* ------------------------------------------------------------------ */

export interface PeriodPoint {
  period: Period;
  stats: PeriodStats;
  /** stock at the end of the period (or `cap` for the current one), valued at that day's rates */
  closing: Snapshot;
  /** stock at the end of the previous period, i.e. what was carried forward in */
  carriedIn: Snapshot;
}

/** One data point per period: flows from that period, stocks at its start and end. */
export function periodSeries(ledger: Ledger, periods: readonly Period[], cap: ISODate): PeriodPoint[] {
  if (periods.length === 0) return [];
  const dates: ISODate[] = [];
  for (const p of periods) {
    dates.push(addDays(p.start, -1));
    dates.push(minDate(p.end, cap));
  }
  const uniqueSorted = [...new Set(dates)].sort();
  const snaps = new Map<ISODate, Snapshot>();
  replay(ledger, uniqueSorted, (date, state) => snaps.set(date, snapshotFromState(ledger, state, date)));

  return periods.map((period) => {
    const endDate = minDate(period.end, cap);
    const stats = periodStats(ledger, { from: period.start, to: endDate });
    return {
      period,
      stats,
      closing: snaps.get(endDate) as Snapshot,
      carriedIn: snaps.get(addDays(period.start, -1)) as Snapshot,
    };
  });
}

export interface WealthPoint {
  date: ISODate;
  total: Dec;
  bySource: Map<string, Dec>;
}

export function wealthSeries(ledger: Ledger, dates: readonly ISODate[]): WealthPoint[] {
  const out: WealthPoint[] = [];
  replay(ledger, dates, (date, state) => {
    const snap = snapshotFromState(ledger, state, date);
    out.push({ date, total: snap.total, bySource: new Map(snap.sources.map((s) => [s.sourceId, s.baseValue])) });
  });
  return out;
}

/** Pick chart sample dates in [from, to]: daily, weekly or monthly depending on length, always ending on `to`. */
export function sampleDates(range: DateRange, maxPoints = 60): ISODate[] {
  const days = diffDays(range.from, range.to) + 1;
  if (days <= 0) return [range.to];
  if (days <= maxPoints) return eachDay(range.from, range.to);
  const out: ISODate[] = [];
  if (days <= maxPoints * 7) {
    for (let d = range.from; d < range.to; d = addDays(d, 7)) out.push(d);
  } else {
    let d = endOfMonth(range.from);
    while (d < range.to) {
      out.push(d);
      d = endOfMonth(addDays(d, 1));
    }
  }
  if (out[out.length - 1] !== range.to) out.push(range.to);
  return out;
}

export interface SavingsPoint {
  date: ISODate;
  /** net savings generated from `range.from` up to this date */
  cumulative: Dec;
}

/** Cumulative (income − spent − fees) since the start of the range, sampled at `dates`. */
export function cumulativeSavingsSeries(ledger: Ledger, range: DateRange, dates: readonly ISODate[]): SavingsPoint[] {
  const out: SavingsPoint[] = [];
  const list = txsInRange(ledger, { from: range.from, to: dates[dates.length - 1] ?? range.to });
  let i = 0;
  let cum = ZERO;
  for (const date of dates) {
    while (i < list.length && list[i].tx.date <= date) {
      const m = list[i].metrics;
      cum = cum.plus(m.incomeBase).minus(m.expenseBase).minus(m.feeBase);
      i += 1;
    }
    out.push({ date, cumulative: cum });
  }
  return out;
}

export interface DayTotals {
  date: ISODate;
  spent: Dec;
  income: Dec;
  count: number;
}

/** Per-day activity for the calendar view. */
export function dailyTotals(ledger: Ledger, range: DateRange): Map<ISODate, DayTotals> {
  const out = new Map<ISODate, DayTotals>();
  for (const r of txsInRange(ledger, range)) {
    const { tx, metrics: m } = r;
    if (tx.type !== "INCOME" && tx.type !== "EXPENSE" && tx.type !== "REFUND") continue;
    let day = out.get(tx.date);
    if (!day) {
      day = { date: tx.date, spent: ZERO, income: ZERO, count: 0 };
      out.set(tx.date, day);
    }
    day.spent = day.spent.plus(m.expenseBase);
    day.income = day.income.plus(m.incomeBase);
    day.count += 1;
  }
  return out;
}

/** Sorted [key, value] pairs, largest first. */
export function sortedDesc(map: Map<string, Dec>): [string, Dec][] {
  return [...map.entries()].sort((a, b) => b[1].comparedTo(a[1]));
}
