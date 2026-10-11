import type { CurrencyCode } from "./currency";
import { type ISODate, addDays, diffDays } from "./dates";
import { type Dec, ZERO, dec, decOrNull } from "./money";
import { type Schedule, occurrencesBetween } from "./recurrence";
import type { DateRange } from "./stats";
import type { Ledger, ResolvedTx } from "./types";

/** An income stream together with its parsed schedule (built from the stored configuration). */
export interface IncomeStream {
  id: string;
  name: string;
  kind: string;
  currency: CurrencyCode;
  expectedAmount: string | null;
  schedule: Schedule;
  destinationAccountId: string | null;
  isActive: boolean;
}

export type PaymentStatus = "received" | "partial" | "overdue" | "upcoming";

/** One scheduled pay date of a stream and what has actually arrived against it. */
export interface ExpectedPayment {
  streamId: string;
  dueDate: ISODate;
  /** expected amount in the stream's currency (null = amount not configured) */
  expected: Dec | null;
  expectedBase: Dec | null;
  /** money that actually arrived against this occurrence */
  receivedBase: Dec;
  /** Σ of the receipts in the stream's currency; null if some receipt landed in another currency */
  receivedNative: Dec | null;
  /** received − expected: in the stream's currency when comparable, otherwise in the base currency */
  variance: Dec | null;
  varianceIsBase: boolean;
  payments: ResolvedTx[];
  status: PaymentStatus;
  /** the first receipt arrived after the due date */
  late: boolean;
  firstReceivedOn: ISODate | null;
}

function paymentsFor(ledger: Ledger, streamId: string): ResolvedTx[] {
  return ledger.txs.filter((r) => r.tx.type === "INCOME" && r.tx.incomeSourceId === streamId);
}

export function expectedPayments(
  ledger: Ledger,
  stream: IncomeStream,
  range: DateRange,
  today: ISODate,
  all: ResolvedTx[] = paymentsFor(ledger, stream.id),
): ExpectedPayment[] {
  const out: ExpectedPayment[] = [];
  for (const dueDate of occurrencesBetween(stream.schedule, range.from, range.to)) {
    const payments = all.filter((r) => r.tx.expectedDate === dueDate);

    // Prefer the amount that was expected when the receipt was recorded; else the stream's amount.
    const snapshot = payments.map((r) => decOrNull(r.tx.expectedAmount)).find((v) => v !== null) ?? null;
    const expected = snapshot ?? decOrNull(stream.expectedAmount);
    const rate = stream.currency === ledger.base ? dec(1) : (ledger.rates.toBase(stream.currency, dueDate) ?? ZERO);
    const expectedBase = expected ? expected.times(rate) : null;

    let receivedBase = ZERO;
    let receivedNative: Dec | null = ZERO;
    for (const p of payments) {
      receivedBase = receivedBase.plus(p.metrics.incomeBase);
      if (p.accountCurrency === stream.currency && receivedNative) receivedNative = receivedNative.plus(p.into);
      else receivedNative = null;
    }

    let status: PaymentStatus;
    let variance: Dec | null = null;
    let varianceIsBase = false;
    if (payments.length > 0) {
      if (expected === null) {
        status = "received";
      } else if (receivedNative) {
        variance = receivedNative.minus(expected);
        status = variance.gte(0) ? "received" : "partial";
      } else {
        variance = receivedBase.minus(expectedBase as Dec);
        varianceIsBase = true;
        status = variance.gte(0) ? "received" : "partial";
      }
    } else {
      status = dueDate < today ? "overdue" : "upcoming";
    }

    const firstReceivedOn = payments.length ? payments.map((p) => p.tx.date).sort()[0] : null;
    out.push({
      streamId: stream.id,
      dueDate,
      expected,
      expectedBase,
      receivedBase,
      receivedNative,
      variance,
      varianceIsBase,
      payments,
      status,
      late: firstReceivedOn !== null && firstReceivedOn > dueDate,
      firstReceivedOn,
    });
  }
  return out;
}

/** Receipts that are not tied to any scheduled date: bonuses, side income, one-offs. */
export function unscheduledPayments(ledger: Ledger, stream: IncomeStream, range: DateRange): ResolvedTx[] {
  const scheduled = new Set(occurrencesBetween(stream.schedule, "2000-01-01", addDays(range.to, 400)));
  return paymentsFor(ledger, stream.id).filter(
    (r) => r.tx.date >= range.from && r.tx.date <= range.to && (!r.tx.expectedDate || !scheduled.has(r.tx.expectedDate)),
  );
}

/**
 * Which scheduled payment does a receipt dated `paymentDate` most plausibly settle?
 * The nearest not-yet-fully-received occurrence, looking back up to 35 days (late pay) and ahead by
 * up to half of the schedule's own interval, at most 14 days (early pay: weekends, holidays).
 */
export function suggestExpectedDate(
  ledger: Ledger,
  stream: IncomeStream,
  paymentDate: ISODate,
  today: ISODate,
  ignoreTxId?: string,
): ISODate | null {
  const around = occurrencesBetween(stream.schedule, addDays(paymentDate, -70), addDays(paymentDate, 70));
  let gap = Infinity;
  for (let i = 1; i < around.length; i++) gap = Math.min(gap, diffDays(around[i - 1], around[i]));
  const ahead = Number.isFinite(gap) ? Math.min(14, Math.max(3, Math.floor(gap / 2))) : 5;

  const range = { from: addDays(paymentDate, -35), to: addDays(paymentDate, ahead) };
  const all = paymentsFor(ledger, stream.id).filter((r) => r.tx.id !== ignoreTxId);
  const candidates = expectedPayments(ledger, stream, range, today, all).filter((p) => p.status !== "received");
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const da = Math.abs(diffDays(a.dueDate, paymentDate));
    const db = Math.abs(diffDays(b.dueDate, paymentDate));
    return da - db || (a.dueDate < b.dueDate ? -1 : 1);
  });
  return candidates[0].dueDate;
}

export interface StreamSummary {
  streamId: string;
  /** next occurrence that is not yet fully received (may be in the past = overdue) */
  next: ExpectedPayment | null;
  lastPayment: ResolvedTx | null;
  receivedInRange: Dec;
  paymentCount: number;
}

export function summarizeStream(ledger: Ledger, stream: IncomeStream, range: DateRange, today: ISODate): StreamSummary {
  const all = paymentsFor(ledger, stream.id);
  const inRange = all.filter((r) => r.tx.date >= range.from && r.tx.date <= range.to);
  const horizon = expectedPayments(ledger, stream, { from: addDays(today, -45), to: addDays(today, 120) }, today, all);
  const next = horizon.find((p) => p.status !== "received") ?? null;
  const last = all.length ? all[all.length - 1] : null;
  return {
    streamId: stream.id,
    next,
    lastPayment: last,
    receivedInRange: inRange.reduce((acc, r) => acc.plus(r.metrics.incomeBase), ZERO),
    paymentCount: inRange.length,
  };
}
