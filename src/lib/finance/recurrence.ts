import { type ISODate, addDays, daysInMonth, diffDays, formatISO, parseISO, weekday } from "./dates";

/**
 * A repeating schedule. Used for expected salary dates and for recurring bills.
 *
 *  - MONTHLY  : on the given day(s) of every `interval`-th month (semi-monthly = two days).
 *               Days beyond a short month's length clamp to its last day (31 -> Feb 28).
 *  - WEEKLY   : every `interval` weeks on `weekday` (bi-weekly = interval 2).
 *  - YEARLY   : every `interval` years on the start date's month & day.
 *  - ONCE     : a single date.
 *  - NONE     : irregular / unscheduled.
 *
 * `after` (optional) drops every occurrence on or before that date without moving the rhythm, which
 * a later `start` would do for bi-weekly pay: "everything up to here is already accounted for".
 */
export type Schedule =
  | { type: "MONTHLY"; days: number[]; interval?: number; start: ISODate; end?: ISODate | null; after?: ISODate | null }
  | { type: "WEEKLY"; weekday?: number; interval?: number; start: ISODate; end?: ISODate | null; after?: ISODate | null }
  | { type: "YEARLY"; interval?: number; start: ISODate; end?: ISODate | null; after?: ISODate | null }
  | { type: "ONCE"; start: ISODate; after?: ISODate | null }
  | { type: "NONE" };

/** Far enough in the past to behave as "no start constraint" for plain monthly schedules. */
export const EPOCH: ISODate = "2000-01-01";

function monthIndex(date: ISODate): number {
  const { y, m } = parseISO(date);
  return y * 12 + (m - 1);
}

function clampDay(y: number, m: number, day: number): ISODate {
  return formatISO(y, m, Math.min(Math.max(1, day), daysInMonth(y, m)));
}

/** Every occurrence date in [from, to], ascending. */
export function occurrencesBetween(schedule: Schedule, from: ISODate, to: ISODate): ISODate[] {
  if (schedule.type === "NONE") return [];
  if (schedule.after && schedule.after >= from) from = addDays(schedule.after, 1);
  if (from > to) return [];
  const out: ISODate[] = [];

  switch (schedule.type) {
    case "ONCE": {
      if (schedule.start >= from && schedule.start <= to) out.push(schedule.start);
      return out;
    }

    case "MONTHLY": {
      const interval = Math.max(1, schedule.interval ?? 1);
      const days = [...new Set(schedule.days.length ? schedule.days : [parseISO(schedule.start).d])].sort((a, b) => a - b);
      const startMonth = monthIndex(schedule.start);
      const firstMonth = Math.max(monthIndex(from), startMonth);
      // align to the interval grid anchored on the start month
      let k = Math.ceil((firstMonth - startMonth) / interval);
      for (; ; k += 1) {
        const idx = startMonth + k * interval;
        const y = Math.floor(idx / 12);
        const m = (idx % 12) + 1;
        if (formatISO(y, m, 1) > to) break;
        for (const day of days) {
          const date = clampDay(y, m, day);
          if (date < schedule.start || date < from || date > to) continue;
          if (schedule.end && date > schedule.end) return out;
          out.push(date);
        }
      }
      return out;
    }

    case "WEEKLY": {
      const interval = Math.max(1, schedule.interval ?? 1);
      let first = schedule.start;
      if (schedule.weekday !== undefined) {
        first = addDays(first, (schedule.weekday - weekday(first) + 7) % 7);
      }
      const step = 7 * interval;
      let date = first;
      if (date < from) {
        const jumps = Math.ceil(diffDays(date, from) / step);
        date = addDays(date, jumps * step);
      }
      for (; date <= to; date = addDays(date, step)) {
        if (schedule.end && date > schedule.end) break;
        out.push(date);
      }
      return out;
    }

    case "YEARLY": {
      const interval = Math.max(1, schedule.interval ?? 1);
      const { y: sy, m, d } = parseISO(schedule.start);
      for (let y = sy; formatISO(y, 1, 1) <= to; y += interval) {
        const date = clampDay(y, m, d);
        if (date < schedule.start || date < from || date > to) continue;
        if (schedule.end && date > schedule.end) break;
        out.push(date);
      }
      return out;
    }
  }
}

/** First occurrence strictly after `after`, searching up to `horizonDays` ahead. */
export function nextOccurrence(schedule: Schedule, after: ISODate, horizonDays = 800): ISODate | null {
  const list = occurrencesBetween(schedule, addDays(after, 1), addDays(after, horizonDays));
  return list[0] ?? null;
}

/** First occurrence on or after `from`. */
export function nextOccurrenceOnOrAfter(schedule: Schedule, from: ISODate, horizonDays = 800): ISODate | null {
  return occurrencesBetween(schedule, from, addDays(from, horizonDays))[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Mapping from stored configuration to a Schedule                      */
/* ------------------------------------------------------------------ */

export type IncomeScheduleType = "MONTHLY" | "SEMI_MONTHLY" | "BIWEEKLY" | "WEEKLY" | "ONCE" | "NONE";

export interface IncomeScheduleConfig {
  scheduleType: IncomeScheduleType | string;
  scheduleDays: number[];
  scheduleAnchor?: ISODate | null;
  scheduleEnd?: ISODate | null;
}

export function incomeSchedule(cfg: IncomeScheduleConfig): Schedule {
  const end = cfg.scheduleEnd ?? null;
  const anchor = cfg.scheduleAnchor ?? null;
  switch (cfg.scheduleType) {
    case "MONTHLY":
      return { type: "MONTHLY", days: cfg.scheduleDays.slice(0, 1), start: anchor ?? EPOCH, end };
    case "SEMI_MONTHLY":
      return { type: "MONTHLY", days: cfg.scheduleDays.slice(0, 2), start: anchor ?? EPOCH, end };
    case "BIWEEKLY":
      return anchor ? { type: "WEEKLY", interval: 2, start: anchor, end } : { type: "NONE" };
    case "WEEKLY":
      return { type: "WEEKLY", interval: 1, weekday: cfg.scheduleDays[0] ?? (anchor ? weekday(anchor) : 5), start: anchor ?? EPOCH, end };
    case "ONCE":
      return anchor ? { type: "ONCE", start: anchor } : { type: "NONE" };
    default:
      return { type: "NONE" };
  }
}

export type RecurringFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurringConfig {
  frequency: RecurringFrequency | string;
  interval: number;
  dayOfMonth?: number | null;
  startDate: ISODate;
  endDate?: ISODate | null;
}

export function recurringSchedule(cfg: RecurringConfig): Schedule {
  const end = cfg.endDate ?? null;
  const interval = Math.max(1, cfg.interval || 1);
  switch (cfg.frequency) {
    case "WEEKLY":
      return { type: "WEEKLY", interval, start: cfg.startDate, end };
    case "YEARLY":
      return { type: "YEARLY", interval, start: cfg.startDate, end };
    case "MONTHLY":
    default:
      return { type: "MONTHLY", days: [cfg.dayOfMonth ?? parseISO(cfg.startDate).d], interval, start: cfg.startDate, end };
  }
}

/** Human description: "Monthly on the 5th", "Every 2 weeks on Friday"... */
export function describeSchedule(schedule: Schedule): string {
  const ord = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  switch (schedule.type) {
    case "MONTHLY": {
      const every = schedule.interval && schedule.interval > 1 ? `Every ${schedule.interval} months` : "Monthly";
      const days = schedule.days.length ? schedule.days : [parseISO(schedule.start).d];
      if (days.length === 2 && (schedule.interval ?? 1) === 1) return `Twice a month · ${ord(days[0])} & ${ord(days[1])}`;
      return `${every} on the ${days.map(ord).join(" & ")}`;
    }
    case "WEEKLY": {
      const day = schedule.weekday ?? weekday(schedule.start);
      const every = schedule.interval && schedule.interval > 1 ? `Every ${schedule.interval} weeks` : "Weekly";
      return `${every} on ${names[day]}`;
    }
    case "YEARLY":
      return schedule.interval && schedule.interval > 1 ? `Every ${schedule.interval} years` : "Yearly";
    case "ONCE":
      return "One time";
    default:
      return "Irregular";
  }
}

/** Convenience: occurrences in the next `days` days (inclusive of today). */
export function upcoming(schedule: Schedule, today: ISODate, days: number): ISODate[] {
  return occurrencesBetween(schedule, today, addDays(today, days));
}
