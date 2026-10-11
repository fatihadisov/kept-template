import type { CurrencyCode } from "./currency";
import { type ISODate, addDays, diffDays } from "./dates";
import { type IncomeStream, expectedPayments } from "./income";
import { type Dec, ZERO, dec, round } from "./money";
import { type Period, type PeriodConfig, periodContaining, shiftPeriod } from "./periods";
import { snapshotAt } from "./queries";
import { type Schedule, occurrencesBetween } from "./recurrence";
import type { PeriodPoint } from "./stats";
import type { Ledger } from "./types";

/** A recurring bill / subscription template (parsed). Nothing here ever touches a balance. */
export interface RecurringBill {
  id: string;
  description: string;
  amount: string;
  currency: CurrencyCode;
  accountId: string;
  categoryId: string | null;
  schedule: Schedule;
  isActive: boolean;
  skippedDates: ISODate[];
}

export type BillStatus = "paid" | "upcoming" | "overdue" | "skipped";

export interface BillOccurrence {
  billId: string;
  dueDate: ISODate;
  amount: Dec;
  currency: CurrencyCode;
  /** valued at today's rate while unpaid, at the recorded value once paid */
  amountBase: Dec;
  status: BillStatus;
  paidTxId: string | null;
}

/**
 * How long past its due date an unrecorded payment is still assumed to be on its way. Older ones are
 * treated as forgotten rather than pending, so a new user never inherits ghost income or bills.
 */
export const INCOME_GRACE_DAYS = 10;
export const BILL_GRACE_DAYS = 7;

function rateNow(ledger: Ledger, currency: CurrencyCode, date: ISODate): Dec {
  if (currency === ledger.base) return dec(1);
  return ledger.rates.toBase(currency, date) ?? ZERO;
}

/** Occurrences of a bill in [from, to] with their paid / overdue state. */
export function billOccurrences(
  ledger: Ledger,
  bill: RecurringBill,
  range: { from: ISODate; to: ISODate },
  today: ISODate,
): BillOccurrence[] {
  const paid = new Map<string, string>();
  const paidBase = new Map<string, Dec>();
  for (const r of ledger.txs) {
    if (r.tx.type === "EXPENSE" && r.tx.recurringId === bill.id && r.tx.dueDate) {
      paid.set(r.tx.dueDate, r.tx.id);
      paidBase.set(r.tx.dueDate, r.metrics.expenseBase);
    }
  }
  const skipped = new Set(bill.skippedDates);
  const amount = dec(bill.amount);
  return occurrencesBetween(bill.schedule, range.from, range.to).map((dueDate) => {
    const paidTxId = paid.get(dueDate) ?? null;
    let status: BillStatus;
    if (paidTxId) status = "paid";
    else if (skipped.has(dueDate)) status = "skipped";
    else status = dueDate < today ? "overdue" : "upcoming";
    return {
      billId: bill.id,
      dueDate,
      amount,
      currency: bill.currency,
      amountBase: paidBase.get(dueDate) ?? round(amount.times(rateNow(ledger, bill.currency, today)), ledger.baseDecimals),
      status,
      paidTxId,
    };
  });
}

/** Unpaid bills due within `days` of today (plus anything overdue by up to a week), in the base currency. */
export function upcomingBills(ledger: Ledger, bills: readonly RecurringBill[], today: ISODate, days: number): BillOccurrence[] {
  const out: BillOccurrence[] = [];
  for (const bill of bills.filter((b) => b.isActive)) {
    for (const o of billOccurrences(ledger, bill, { from: addDays(today, -BILL_GRACE_DAYS), to: addDays(today, days) }, today)) {
      if (o.status === "upcoming" || o.status === "overdue") out.push(o);
    }
  }
  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

export const sumBase = (xs: readonly BillOccurrence[]) => xs.reduce((acc, o) => acc.plus(o.amountBase), ZERO);

/* ------------------------------------------------------------------ */
/* Forecast                                                             */
/* ------------------------------------------------------------------ */

export interface ForecastEvent {
  date: ISODate;
  kind: "INCOME" | "BILL";
  label: string;
  amountBase: Dec;
  refId: string;
  overdue: boolean;
}

export interface ForecastMonth {
  period: Period;
  income: Dec;
  bills: Dec;
  variable: Dec;
  net: Dec;
  /** projected total money at the end of the period */
  endBalance: Dec;
  events: ForecastEvent[];
}

export interface Forecast {
  /** money actually owned today: the only non-projected number */
  startBalance: Dec;
  months: ForecastMonth[];
  assumptions: {
    variableMonthly: Dec;
    streams: number;
    bills: number;
  };
}

export interface ForecastInput {
  ledger: Ledger;
  today: ISODate;
  months: number;
  streams: readonly IncomeStream[];
  bills: readonly RecurringBill[];
  /** assumed discretionary spending per month, base currency */
  variableMonthly: Dec;
  period: PeriodConfig;
}

/**
 * Projects total money forward. Expected salaries and unpaid bills are placed on their due dates;
 * discretionary spending is spread evenly. Everything after `startBalance` is a projection — expected
 * pay is NEVER treated as money already owned.
 */
export function buildForecast(input: ForecastInput): Forecast {
  const { ledger, today, streams, bills, period } = input;
  const startBalance = snapshotAt(ledger, today).total;

  const first = periodContaining(today, period);
  const periods: Period[] = [first];
  for (let i = 1; i < input.months; i += 1) periods.push(shiftPeriod(first, i, period));
  const horizonEnd = periods[periods.length - 1].end;

  const events: ForecastEvent[] = [];

  for (const stream of streams.filter((s) => s.isActive)) {
    const rows = expectedPayments(ledger, stream, { from: addDays(today, -INCOME_GRACE_DAYS), to: horizonEnd }, today);
    for (const row of rows) {
      if (row.status === "received" || row.expected === null) continue;
      const rate = rateNow(ledger, stream.currency, today);
      const receivedInStreamCurrency = row.receivedNative ?? (rate.isZero() ? ZERO : row.receivedBase.div(rate));
      const remaining = row.expected.minus(receivedInStreamCurrency);
      if (remaining.lte(0)) continue;
      const overdue = row.dueDate < today;
      events.push({
        date: overdue ? today : row.dueDate,
        kind: "INCOME",
        label: stream.name,
        amountBase: round(remaining.times(rate), ledger.baseDecimals),
        refId: stream.id,
        overdue,
      });
    }
  }

  for (const bill of bills.filter((b) => b.isActive)) {
    for (const o of billOccurrences(ledger, bill, { from: addDays(today, -BILL_GRACE_DAYS), to: horizonEnd }, today)) {
      if (o.status !== "upcoming" && o.status !== "overdue") continue;
      events.push({
        date: o.dueDate < today ? today : o.dueDate,
        kind: "BILL",
        label: bill.description,
        amountBase: o.amountBase,
        refId: bill.id,
        overdue: o.status === "overdue",
      });
    }
  }
  // Entries already recorded with a FUTURE date (e.g. a bill paid ahead of time) are not in today's
  // balance yet, so they must show up as scheduled movements rather than vanish.
  for (const r of ledger.txs) {
    const { tx, metrics } = r;
    if (tx.date <= today || tx.date > horizonEnd) continue;
    if (tx.type === "INCOME") {
      events.push({ date: tx.date, kind: "INCOME", label: tx.description || "Scheduled income", amountBase: metrics.incomeBase, refId: tx.id, overdue: false });
    } else if (tx.type === "REFUND") {
      events.push({ date: tx.date, kind: "INCOME", label: tx.description || "Scheduled refund", amountBase: metrics.expenseBase.neg().plus(metrics.fxLossBase.neg()), refId: tx.id, overdue: false });
    } else if (tx.type === "EXPENSE") {
      events.push({ date: tx.date, kind: "BILL", label: tx.description || "Scheduled payment", amountBase: metrics.expenseBase.plus(metrics.fxLossBase), refId: tx.id, overdue: false });
    }
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let balance = startBalance;
  const months = periods.map((p, index): ForecastMonth => {
    const inPeriod = events.filter((e) => e.date >= p.start && e.date <= p.end);
    const income = inPeriod.filter((e) => e.kind === "INCOME").reduce((acc, e) => acc.plus(e.amountBase), ZERO);
    const billTotal = inPeriod.filter((e) => e.kind === "BILL").reduce((acc, e) => acc.plus(e.amountBase), ZERO);
    let variable = input.variableMonthly;
    if (index === 0) {
      const length = diffDays(p.start, p.end) + 1;
      const left = diffDays(today, p.end) + 1;
      variable = round(input.variableMonthly.times(Math.max(0, left)).div(length), ledger.baseDecimals);
    }
    const net = income.minus(billTotal).minus(variable);
    balance = balance.plus(net);
    return { period: p, income, bills: billTotal, variable, net, endBalance: balance, events: inPeriod };
  });

  return {
    startBalance,
    months,
    assumptions: {
      variableMonthly: input.variableMonthly,
      streams: streams.filter((s) => s.isActive).length,
      bills: bills.filter((b) => b.isActive).length,
    },
  };
}

/**
 * A sensible default for discretionary spending: what you typically spend per completed period
 * minus the part that recurring bills already explain.
 */
export function estimateVariableSpending(points: readonly PeriodPoint[], today: ISODate, billsMonthlyBase: Dec, n = 3): Dec {
  const completed = points.filter((p) => p.period.end < today && (p.stats.spent.gt(0) || p.stats.income.gt(0))).slice(-n);
  if (completed.length === 0) return ZERO;
  const avgSpent = completed.reduce((acc, p) => acc.plus(p.stats.spent), ZERO).div(completed.length);
  const v = avgSpent.minus(billsMonthlyBase);
  return v.gt(0) ? round(v, 2) : ZERO;
}
