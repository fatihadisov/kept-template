import { type ISODate, addDays, addMonths, eachDay, endOfMonth, isISODate, monthKey, parseISO, startOfMonth, startOfWeek } from "@/lib/finance/dates";
import { type TxFilter, filterTransactions } from "@/lib/finance/filters";
import { type Dec, ZERO } from "@/lib/finance/money";
import type { DateRange } from "@/lib/finance/periods";
import type { ResolvedTx, TxType } from "@/lib/finance/types";
import { NO_CATEGORY } from "@/lib/finance/stats";
import type { AppState } from "../session";
import { lookups } from "./common";
import { type TxRowModel, buildTxRows } from "./tx-rows";

export type RawParams = Record<string, string | string[] | undefined>;

const TYPES: TxType[] = ["EXPENSE", "INCOME", "REFUND", "TRANSFER", "EXCHANGE", "OPENING", "ADJUSTMENT"];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);

export interface TxQuery {
  filter: TxFilter;
  view: "list" | "calendar";
  limit: number;
  /** calendar month shown, YYYY-MM */
  month: string | null;
  /** the dates came from the URL (a drill-down), not the global date filter */
  explicitDates: boolean;
}

export function parseTxParams(sp: RawParams, s: AppState): TxQuery {
  const from = first(sp.from);
  const to = first(sp.to);
  const explicitDates = Boolean(from && to && isISODate(from) && isISODate(to) && from <= to);
  const range: DateRange = explicitDates ? { from: from as string, to: to as string } : s.range;
  const types = list(sp.type).filter((t): t is TxType => (TYPES as string[]).includes(t));
  const limit = Math.min(1000, Math.max(30, Number(first(sp.limit)) || 80));
  const month = first(sp.month);
  return {
    filter: {
      from: range.from,
      to: range.to,
      types: types.length ? types : undefined,
      accountIds: list(sp.acc),
      sourceIds: list(sp.src),
      categoryIds: list(sp.cat),
      currencies: list(sp.ccy),
      min: first(sp.min) || undefined,
      max: first(sp.max) || undefined,
      search: first(sp.q) || undefined,
      tags: list(sp.tag),
    },
    view: first(sp.view) === "calendar" ? "calendar" : "list",
    limit,
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
    explicitDates,
  };
}

/** Everything that is narrowing the list, for the "active filters" summary. */
export function activeFilterCount(f: TxFilter): number {
  return (
    (f.types?.length ? 1 : 0) +
    (f.accountIds?.length ? 1 : 0) +
    (f.sourceIds?.length ? 1 : 0) +
    (f.categoryIds?.length ? 1 : 0) +
    (f.currencies?.length ? 1 : 0) +
    (f.min || f.max ? 1 : 0) +
    (f.tags?.length ? 1 : 0)
  );
}

export interface DayGroup {
  date: ISODate;
  rows: TxRowModel[];
  spent: Dec;
  income: Dec;
}

export interface CalendarCell {
  date: ISODate;
  inMonth: boolean;
  spent: Dec;
  income: Dec;
  count: number;
  intensity: number;
}

export interface TransactionsModel {
  total: number;
  shown: number;
  income: Dec;
  spent: Dec;
  groups: DayGroup[];
  hasMore: boolean;
  calendar: { month: string; label: string; prev: string; next: string; weeks: CalendarCell[][]; monthSpent: Dec; maxSpent: Dec } | null;
  filteredRows: ResolvedTx[];
}

export function runFilter(s: AppState, q: TxQuery): ResolvedTx[] {
  const lk = lookups(s);
  return filterTransactions(
    s.ledger,
    q.filter,
    {
      accountName: (id) => lk.accountName(id),
      categoryName: (id) => (id === NO_CATEGORY ? "Uncategorised" : lk.category(id).name),
      sourceName: (id) => lk.source(id).name,
    },
  );
}

export function buildTransactions(s: AppState, q: TxQuery): TransactionsModel {
  const lk = lookups(s);
  const rows = runFilter(s, q);

  let income = ZERO;
  let spent = ZERO;
  for (const r of rows) {
    income = income.plus(r.metrics.incomeBase);
    spent = spent.plus(r.metrics.expenseBase);
  }

  const visible = rows.slice(0, q.limit);
  const models = buildTxRows(s, visible, lk);
  const groups: DayGroup[] = [];
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    let g = groups[groups.length - 1];
    if (!g || g.date !== model.date) {
      g = { date: model.date, rows: [], spent: ZERO, income: ZERO };
      groups.push(g);
    }
    g.rows.push(model);
    g.spent = g.spent.plus(visible[i].metrics.expenseBase);
    g.income = g.income.plus(visible[i].metrics.incomeBase);
  }

  let calendar: TransactionsModel["calendar"] = null;
  if (q.view === "calendar") {
    const anchor: ISODate = q.month ? `${q.month}-01` : startOfMonth(q.filter.to && q.filter.to < s.today ? q.filter.to : s.today);
    const month = monthKey(anchor);
    const first = startOfMonth(anchor);
    const last = endOfMonth(anchor);
    const byDay = new Map<ISODate, { spent: Dec; income: Dec; count: number }>();
    for (const r of rows) {
      if (r.tx.date < first || r.tx.date > last) continue;
      const d = byDay.get(r.tx.date) ?? { spent: ZERO, income: ZERO, count: 0 };
      d.spent = d.spent.plus(r.metrics.expenseBase);
      d.income = d.income.plus(r.metrics.incomeBase);
      d.count += 1;
      byDay.set(r.tx.date, d);
    }
    const start = startOfWeek(first, s.data.settings.weekStartsOn);
    const end = addDays(startOfWeek(last, s.data.settings.weekStartsOn), 6);
    const maxSpent = [...byDay.values()].reduce((m, d) => (d.spent.gt(m) ? d.spent : m), ZERO);
    const cells: CalendarCell[] = eachDay(start, end).map((date) => {
      const d = byDay.get(date);
      return {
        date,
        inMonth: date >= first && date <= last,
        spent: d?.spent ?? ZERO,
        income: d?.income ?? ZERO,
        count: d?.count ?? 0,
        intensity: d && maxSpent.gt(0) && d.spent.gt(0) ? d.spent.div(maxSpent).toNumber() : 0,
      };
    });
    const weeks: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const { y, m } = parseISO(first);
    calendar = {
      month,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" }),
      prev: monthKey(addMonths(first, -1)),
      next: monthKey(addMonths(first, 1)),
      weeks,
      monthSpent: [...byDay.values()].reduce((a, d) => a.plus(d.spent), ZERO),
      maxSpent,
    };
  }

  return { total: rows.length, shown: visible.length, income, spent, groups, hasMore: rows.length > visible.length, calendar, filteredRows: rows };
}

export const weekdayHeaders = (weekStartsOn: number): string[] => {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 7 }, (_, i) => names[(weekStartsOn + i) % 7]);
};

