import { cookies } from "next/headers";
import { cache } from "react";
import { type ISODate, todayIn } from "@/lib/finance/dates";
import { buildLedger } from "@/lib/finance/ledger";
import { type DateRange, type PeriodConfig, type RangePreset, isRangePreset, resolveRange } from "@/lib/finance/periods";
import type { IncomeStream } from "@/lib/finance/income";
import type { RecurringBill } from "@/lib/finance/forecast";
import { isISODate } from "@/lib/finance/dates";
import type { Ledger } from "@/lib/finance/types";
import { type Fmt, makeFmt } from "@/lib/fmt";
import { requireSession } from "./auth";
import { type Db, type DbMode, openMode, usesPostgres } from "./db";
import { type AppData, billsOf, ledgerInputOf, loadAppData, streamsOf } from "./load";
import { isEmpty, seedDemo } from "./services/demo";

export const MODE_COOKIE = "kept_mode";
export const RANGE_COOKIE = "kept_range";

export async function getMode(): Promise<DbMode> {
  if (usesPostgres()) return "real"; // the hosted copy has no demo database
  const v = (await cookies()).get(MODE_COOKIE)?.value;
  return v === "demo" ? "demo" : "real";
}

const seeding = ((globalThis as unknown as { __keptSeeding?: Map<string, Promise<void>> }).__keptSeeding ??= new Map());

/** The database for the current visitor: the real one, or the separate demo file (filled on first use). */
export async function currentDb(): Promise<Db> {
  await requireSession(); // nothing is read or written without a valid session (when a password is set)
  const mode = await getMode();
  const db = await openMode(mode);
  if (mode === "demo" && (await isEmpty(db))) {
    let pending = seeding.get("demo");
    if (!pending) {
      pending = seedDemo(db).finally(() => seeding.delete("demo"));
      seeding.set("demo", pending);
    }
    await pending;
  }
  return db;
}

export interface RangeSelection {
  preset: RangePreset;
  range: DateRange;
}

export function parseRangeCookie(value: string | undefined, ctx: { today: ISODate; period: PeriodConfig; firstDate: ISODate | null }): RangeSelection {
  let preset: RangePreset = "thisMonth";
  let custom: DateRange | null = null;
  if (value) {
    const [p, from, to] = value.split(":");
    if (p === "custom" && from && to && isISODate(from) && isISODate(to) && from <= to) {
      preset = "custom";
      custom = { from, to };
    } else if (isRangePreset(p) && p !== "custom") {
      preset = p;
    }
  }
  return { preset, range: resolveRange(preset, { ...ctx, custom }) };
}

export interface AppState {
  mode: DbMode;
  db: Db;
  data: AppData;
  ledger: Ledger;
  today: ISODate;
  fmt: Fmt;
  period: PeriodConfig;
  firstDate: ISODate | null;
  preset: RangePreset;
  range: DateRange;
  streams: IncomeStream[];
  bills: RecurringBill[];
}

/** Everything a page needs, loaded once per request (React `cache` dedupes across layout + page). */
export const getState = cache(async (): Promise<AppState> => {
  const mode = await getMode();
  const db = await currentDb();
  const data = await loadAppData(db);
  const ledger = buildLedger(ledgerInputOf(data));
  const today = todayIn(data.settings.timezone);
  const period: PeriodConfig = { mode: data.settings.reportingMode, cycleStartDay: data.settings.cycleStartDay };
  const firstDate = ledger.txs[0]?.tx.date ?? null;
  const store = await cookies();
  const { preset, range } = parseRangeCookie(store.get(RANGE_COOKIE)?.value, { today, period, firstDate });
  return {
    mode,
    db,
    data,
    ledger,
    today,
    fmt: makeFmt(data.settings.locale, data.settings.baseCurrency),
    period,
    firstDate,
    preset,
    range,
    streams: streamsOf(data),
    bills: billsOf(data),
  };
});
