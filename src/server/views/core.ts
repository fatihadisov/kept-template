import { cache } from "react";
import { ONE, ZERO, type Dec } from "@/lib/finance/money";
import { type Period, periodContaining, periodsBetween, shiftPeriod } from "@/lib/finance/periods";
import { type Snapshot, type State, snapshotFromState, stateAt } from "@/lib/finance/queries";
import {
  type AvailableToSpend,
  type GoalProgress,
  availableToSpend,
  averageMonthlySavings,
  goalsProgress,
  reservedTotalBase,
} from "@/lib/finance/savings";
import { type BillOccurrence, sumBase, upcomingBills } from "@/lib/finance/forecast";
import { type PeriodPoint, type PeriodStats, periodSeries, periodStats } from "@/lib/finance/stats";
import type { AppState } from "../session";
import { goalsOf } from "../load";

export interface Core {
  /** attribution matrix as of today */
  state: State;
  /** balances and per-source stock as of today, valued at today's rates */
  snap: Snapshot;
  toBase: (currency: string) => Dec;
  progress: GoalProgress[];
  reserved: Dec;
  bills: BillOccurrence[];
  billsTotal: Dec;
  avail: AvailableToSpend;
  currentPeriod: Period;
  /** last 12 periods ending with the current one */
  series: PeriodPoint[];
  avgMonthlySavings: Dec;
  currentStats: PeriodStats;
}

function compute(s: AppState): Core {
  const { ledger, today } = s;
  const state = stateAt(ledger, today);
  const snap = snapshotFromState(ledger, state, today);
  const toBase = (ccy: string): Dec => (ccy === ledger.base ? ONE : (ledger.rates.toBase(ccy, today) ?? ZERO));

  const goals = goalsOf(s.data);
  const reserved = reservedTotalBase(goals, toBase);
  const bills = upcomingBills(ledger, s.bills, today, s.data.settings.upcomingBillsDays);
  const billsTotal = sumBase(bills);
  const avail = availableToSpend(snap.total, reserved, s.data.settings.deductUpcomingBills ? billsTotal : ZERO);

  const currentPeriod = periodContaining(today, s.period);
  const first = shiftPeriod(currentPeriod, -11, s.period);
  const series = periodSeries(ledger, periodsBetween(first.start, currentPeriod.end, s.period), today);
  const avgMonthlySavings = averageMonthlySavings(series, today, 3);

  const progress = goalsProgress(goals, { today, toBase, liquidBase: snap.total, avgMonthlySavingsBase: avgMonthlySavings });

  return {
    state,
    snap,
    toBase,
    progress,
    reserved,
    bills,
    billsTotal,
    avail,
    currentPeriod,
    series,
    avgMonthlySavings,
    currentStats: periodStats(ledger, { from: currentPeriod.start, to: today }),
  };
}

/** Savings, reservations and trends as of today — computed once per request and shared by every page. */
export const getCore = cache((s: AppState): Core => compute(s));
