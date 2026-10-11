/**
 * Calendar-date utilities.
 *
 * Dates are plain "YYYY-MM-DD" strings in the user's timezone. They sort lexicographically, never
 * shift because of UTC conversion, and are compared/added using UTC arithmetic on the calendar
 * fields only. The ONLY place a timezone matters is `todayIn()`, which asks "what is today's date
 * on the wall clock in Asia/Baku (or whichever zone is configured)?".
 */

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const match = ISO_RE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function parseISO(value: ISODate): YMD {
  const match = ISO_RE.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function formatISO(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toMs(date: ISODate): number {
  const { y, m, d } = parseISO(date);
  return Date.UTC(y, m - 1, d);
}

function fromMs(ms: number): ISODate {
  const dt = new Date(ms);
  return formatISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromMs(toMs(date) + days * MS_PER_DAY);
}

/** Add calendar months, clamping the day to the target month's length (Jan 31 + 1m = Feb 28/29). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { y, m, d } = parseISO(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12 + 12) % 12 + 1;
  return formatISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addYears(date: ISODate, years: number): ISODate {
  return addMonths(date, years * 12);
}

/** Signed number of days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toMs(b) - toMs(a)) / MS_PER_DAY);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const minDate = (a: ISODate, b: ISODate): ISODate => (a <= b ? a : b);
export const maxDate = (a: ISODate, b: ISODate): ISODate => (a >= b ? a : b);

export function startOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  return formatISO(y, m, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  return formatISO(y, m, daysInMonth(y, m));
}

export function startOfYear(date: ISODate): ISODate {
  return formatISO(parseISO(date).y, 1, 1);
}

export function endOfYear(date: ISODate): ISODate {
  return formatISO(parseISO(date).y, 12, 31);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: ISODate): number {
  return new Date(toMs(date)).getUTCDay();
}

/** weekStartsOn: 0 = Sunday, 1 = Monday */
export function startOfWeek(date: ISODate, weekStartsOn = 1): ISODate {
  const delta = (weekday(date) - weekStartsOn + 7) % 7;
  return addDays(date, -delta);
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

/** First day of the month a "YYYY-MM" key refers to. */
export function monthKeyToDate(key: string): ISODate {
  return `${key}-01`;
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** First day of each calendar month touched by [from, to]. */
export function eachMonthStart(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = startOfMonth(from); d <= to; d = addMonths(d, 1)) out.push(d);
  return out;
}

/** Today's calendar date on the wall clock of `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Current wall-clock time "HH:mm" in `timeZone`. */
export function timeNowIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const monthNameShort = (m: number) => MONTHS_SHORT[m - 1];
export const monthNameLong = (m: number) => MONTHS_LONG[m - 1];
export const weekdayNameShort = (w: number) => WEEKDAYS_SHORT[w];
export const weekdayNameLong = (w: number) => WEEKDAYS_LONG[w];

/** "9 Oct" or, when the year differs from `relativeTo`'s year, "9 Oct 2025". */
export function formatDateShort(date: ISODate, relativeTo?: ISODate): string {
  const { y, m, d } = parseISO(date);
  const showYear = relativeTo ? parseISO(relativeTo).y !== y : false;
  return `${d} ${MONTHS_SHORT[m - 1]}${showYear ? ` ${y}` : ""}`;
}

export function formatDateLong(date: ISODate): string {
  const { y, m, d } = parseISO(date);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "Oct 2026" */
export function formatMonthYear(date: ISODate): string {
  const { y, m } = parseISO(date);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "Today", "Yesterday", "Tomorrow", otherwise "Mon 5 Oct". */
export function formatRelativeDay(date: ISODate, today: ISODate): string {
  const delta = diffDays(today, date);
  if (delta === 0) return "Today";
  if (delta === -1) return "Yesterday";
  if (delta === 1) return "Tomorrow";
  const { y, m, d } = parseISO(date);
  const wd = WEEKDAYS_SHORT[weekday(date)];
  const showYear = y !== parseISO(today).y;
  return `${wd} ${d} ${MONTHS_SHORT[m - 1]}${showYear ? ` ${y}` : ""}`;
}

/** "today", "tomorrow", "in 5 days", "3 days ago": for sentences. */
export function relativeDays(date: ISODate, today: ISODate): string {
  const n = diffDays(today, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
