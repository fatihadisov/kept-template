import { type ISODate, addDays, diffDays, formatRelativeDay } from "@/lib/finance/dates";
import { type ExpectedPayment, expectedPayments, summarizeStream, unscheduledPayments } from "@/lib/finance/income";
import { type Dec, ZERO } from "@/lib/finance/money";
import { describeSchedule } from "@/lib/finance/recurrence";
import { periodStats } from "@/lib/finance/stats";
import type { SourceView } from "@/lib/app-types";
import type { LedgerTx } from "@/lib/finance/types";
import type { AppState } from "../session";
import { lookups } from "./common";
import { getCore } from "./core";
import { type TxRowModel, buildTxRows } from "./tx-rows";

export interface OccurrenceRow {
  dueDate: ISODate;
  when: string;
  status: ExpectedPayment["status"];
  late: boolean;
  lateDays: number;
  earlyDays: number;
  expected: Dec | null;
  received: Dec | null;
  variance: Dec | null;
  currency: string;
  payments: { id: string; date: string; amount: string; currency: string; tx: LedgerTx }[];
}

export interface StreamCard {
  source: SourceView;
  color: string;
  scheduleText: string;
  destination: string | null;
  next: OccurrenceRow | null;
  occurrences: OccurrenceRow[];
  extras: TxRowModel[];
  rangeReceived: Dec;
  rangeSpent: Dec;
  remaining: Dec;
  lastPaid: { date: string; amount: string; currency: string } | null;
}

export interface IncomeModel {
  streams: StreamCard[];
  receipts: TxRowModel[];
  hasStreams: boolean;
}

function toRow(p: ExpectedPayment, s: AppState, currency: string): OccurrenceRow {
  const first = p.firstReceivedOn;
  return {
    dueDate: p.dueDate,
    when: formatRelativeDay(p.dueDate, s.today),
    status: p.status,
    late: p.late,
    lateDays: p.late && first ? diffDays(p.dueDate, first) : 0,
    earlyDays: first && first < p.dueDate ? diffDays(first, p.dueDate) : 0,
    expected: p.expected,
    received: p.receivedNative ?? p.receivedBase,
    variance: p.variance,
    currency: p.receivedNative ? currency : s.ledger.base,
    payments: p.payments.map((r) => ({ id: r.tx.id, date: r.tx.date, amount: r.tx.amount, currency: r.accountCurrency, tx: r.tx })),
  };
}

export function buildIncome(s: AppState): IncomeModel {
  const lk = lookups(s);
  const core = getCore(s);
  const today = s.today;
  const to = s.range.to < today ? s.range.to : today;
  const range = { from: s.range.from > to ? to : s.range.from, to };
  const stats = periodStats(s.ledger, range);

  const streams: StreamCard[] = [];
  for (const stream of s.streams) {
    const source = s.data.sources.find((x) => x.id === stream.id) as SourceView;
    const sum = summarizeStream(s.ledger, stream, range, today);
    const horizon = expectedPayments(s.ledger, stream, { from: addDays(today, -190), to: addDays(today, 70) }, today);
    const past = horizon.filter((p) => p.dueDate <= today || p.payments.length > 0);
    const occurrences = [...past].reverse().slice(0, 6).map((p) => toRow(p, s, stream.currency));
    const next = sum.next ? toRow(sum.next, s, stream.currency) : null;
    const remaining = core.snap.sources.find((x) => x.sourceId === stream.id)?.baseValue ?? ZERO;
    const last = sum.lastPayment;
    streams.push({
      source,
      color: lk.source(stream.id).color,
      scheduleText: stream.schedule.type === "NONE" ? "No fixed schedule" : describeSchedule(stream.schedule),
      destination: stream.destinationAccountId ? lk.accountName(stream.destinationAccountId) : null,
      next,
      occurrences,
      extras: buildTxRows(s, unscheduledPayments(s.ledger, stream, { from: addDays(today, -190), to: today }).slice(-3).reverse(), lk),
      rangeReceived: stats.incomeBySource.get(stream.id) ?? ZERO,
      rangeSpent: (stats.spentBySource.get(stream.id) ?? ZERO).plus(stats.feesBySource.get(stream.id) ?? ZERO),
      remaining,
      lastPaid: last ? { date: last.tx.date, amount: last.tx.amount, currency: last.accountCurrency } : null,
    });
  }

  const receipts = buildTxRows(s, s.ledger.txs.filter((r) => r.tx.type === "INCOME").slice(-40).reverse(), lk);
  return { streams, receipts, hasStreams: streams.length > 0 };
}

