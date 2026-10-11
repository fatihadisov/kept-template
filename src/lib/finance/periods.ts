import {
  type ISODate,
  addDays,
  addMonths,
  addYears,
  daysInMonth,
  endOfMonth,
  endOfYear,
  formatDateShort,
  formatISO,
  formatMonthYear,
  monthKey,
  parseISO,
  startOfMonth,
  startOfYear,
} from "./dates";

/**
 * Reporting periods.
 *  - MONTH: calendar months.
 *  - CYCLE: salary payment cycles. A cycle starts on `cycleStartDay` of a month (clamped to short
 *    months) and runs until the day before the next cycle starts. With startDay = 1 it is identical
 *    to MONTH.
 */
export type PeriodMode = "MONTH" | "CYCLE";

export interface PeriodConfig {
  mode: PeriodMode;
  cycleStartDay: number;
}

export interface Period {
  /** Stable key: start date of the period (YYYY-MM-DD). */
  key: ISODate;
  start: ISODate;
  end: ISODate;
  label: string;
}

export const CALENDAR_MONTHS: PeriodConfig = { mode: "MONTH", cycleStartDay: 1 };

function clampedDay(y: number, m: number, day: number): ISODate {
  return formatISO(y, m, Math.min(day, daysInMonth(y, m)));
}

export function periodContaining(date: ISODate, cfg: PeriodConfig): Period {
  if (cfg.mode === "MONTH" || cfg.cycleStartDay <= 1) {
    const start = startOfMonth(date);
    return { key: start, start, end: endOfMonth(date), label: formatMonthYear(start) };
  }
  const { y, m } = parseISO(date);
  let start = clampedDay(y, m, cfg.cycleStartDay);
  if (date < start) {
    const prev = addMonths(startOfMonth(date), -1);
    const p = parseISO(prev);
    start = clampedDay(p.y, p.m, cfg.cycleStartDay);
  }
  const nextMonth = addMonths(startOfMonth(start), 1);
  const n = parseISO(nextMonth);
  const end = addDays(clampedDay(n.y, n.m, cfg.cycleStartDay), -1);
  return { key: start, start, end, label: `${formatDateShort(start)} – ${formatDateShort(end)}` };
}

export function shiftPeriod(period: Period, delta: number, cfg: PeriodConfig): Period {
  // move to a day safely inside the neighbouring period, then resolve it
  const anchor = delta >= 0 ? period.end : period.start;
  let probe = anchor;
  const step = delta >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(delta); i += 1) {
    const current = periodContaining(probe, cfg);
    probe = step > 0 ? addDays(current.end, 1) : addDays(current.start, -1);
  }
  return periodContaining(probe, cfg);
}

/** Every period that overlaps [from, to], oldest first. */
export function periodsBetween(from: ISODate, to: ISODate, cfg: PeriodConfig): Period[] {
  const out: Period[] = [];
  let p = periodContaining(from, cfg);
  while (p.start <= to) {
    out.push(p);
    p = periodContaining(addDays(p.end, 1), cfg);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Quick ranges for the global date picker                              */
/* ------------------------------------------------------------------ */

export type RangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "last3m"
  | "last6m"
  | "thisYear"
  | "lastYear"
  | "all"
  | "custom";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "last3m", label: "Last 3 months" },
  { id: "last6m", label: "Last 6 months" },
  { id: "thisYear", label: "This year" },
  { id: "lastYear", label: "Last year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom range" },
];

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export interface RangeContext {
  today: ISODate;
  period: PeriodConfig;
  /** Earliest date with data; used for "All time". Falls back to the start of this year. */
  firstDate?: ISODate | null;
  custom?: DateRange | null;
}

export function isRangePreset(value: string): value is RangePreset {
  return RANGE_PRESETS.some((p) => p.id === value);
}

export function resolveRange(preset: RangePreset, ctx: RangeContext): DateRange {
  const { today, period } = ctx;
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "thisMonth": {
      const p = periodContaining(today, period);
      return { from: p.start, to: p.end };
    }
    case "lastMonth": {
      const p = shiftPeriod(periodContaining(today, period), -1, period);
      return { from: p.start, to: p.end };
    }
    case "last3m":
      return { from: addDays(addMonths(today, -3), 1), to: today };
    case "last6m":
      return { from: addDays(addMonths(today, -6), 1), to: today };
    case "thisYear":
      return { from: startOfYear(today), to: endOfYear(today) };
    case "lastYear": {
      const d = addYears(today, -1);
      return { from: startOfYear(d), to: endOfYear(d) };
    }
    case "all":
      return { from: ctx.firstDate && ctx.firstDate <= today ? ctx.firstDate : startOfYear(today), to: today };
    case "custom": {
      const c = ctx.custom;
      if (c && c.from <= c.to) return c;
      const p = periodContaining(today, period);
      return { from: p.start, to: p.end };
    }
  }
}

export function describeRange(range: DateRange, today: ISODate): string {
  if (range.from === range.to) return formatDateShort(range.from, today);
  const sameMonthWhole =
    range.from === startOfMonth(range.from) && range.to === endOfMonth(range.from) && monthKey(range.from) === monthKey(range.to);
  if (sameMonthWhole) return formatMonthYear(range.from);
  return `${formatDateShort(range.from, today)} – ${formatDateShort(range.to, today)}`;
}

/** The range of equal length immediately before `range` (for "vs previous period" comparisons). */
export function previousRange(range: DateRange, cfg: PeriodConfig): DateRange {
  const startsAtPeriodStart = periodContaining(range.from, cfg).start === range.from;
  const endsAtPeriodEnd = periodContaining(range.to, cfg).end === range.to;
  if (startsAtPeriodStart && endsAtPeriodEnd) {
    const first = periodContaining(range.from, cfg);
    const last = periodContaining(range.to, cfg);
    let count = 1;
    let probe = first;
    while (probe.key !== last.key) {
      probe = periodContaining(addDays(probe.end, 1), cfg);
      count += 1;
    }
    const prevStart = shiftPeriod(first, -count, cfg);
    const prevEnd = shiftPeriod(last, -count, cfg);
    return { from: prevStart.start, to: prevEnd.end };
  }
  const length = Math.round(
    (Date.UTC(...ymd(range.to)) - Date.UTC(...ymd(range.from))) / 86_400_000,
  ) + 1;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

function ymd(date: ISODate): [number, number, number] {
  const { y, m, d } = parseISO(date);
  return [y, m - 1, d];
}
