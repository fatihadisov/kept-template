import type { AccountView, CategoryView, SourceView } from "@/lib/app-types";
import { decimalsOf } from "@/lib/finance/currency";
import { type ISODate, todayIn } from "@/lib/finance/dates";
import { buildLedger } from "@/lib/finance/ledger";
import { type Dec, dec, round } from "@/lib/finance/money";
import type { Ledger } from "@/lib/finance/types";
import { ZodError } from "zod";
import { fieldErrors } from "@/lib/validation";
import type { Tx } from "../db";
import { ValidationError } from "../errors";
import { type AppData, ledgerInputOf, loadAppData } from "../load";

/** A consistent, in-memory view of the whole database for one operation. */
export interface Ctx {
  data: AppData;
  ledger: Ledger;
  base: string;
  today: ISODate;
  accounts: Map<string, AccountView>;
  sources: Map<string, SourceView>;
  categories: Map<string, CategoryView>;
}

export function ctxFrom(data: AppData, now: Date = new Date()): Ctx {
  return {
    data,
    ledger: buildLedger(ledgerInputOf(data)),
    base: data.settings.baseCurrency,
    today: todayIn(data.settings.timezone, now),
    accounts: new Map(data.accounts.map((a) => [a.id, a])),
    sources: new Map(data.sources.map((s) => [s.id, s])),
    categories: new Map(data.categories.map((c) => [c.id, c])),
  };
}

export async function makeCtx(db: Tx, now: Date = new Date()): Promise<Ctx> {
  return ctxFrom(await loadAppData(db), now);
}

/** Rebuild the ledger after the in-memory data changed (used by bulk operations like seeding). */
export function refreshLedger(ctx: Ctx): void {
  ctx.ledger = buildLedger(ledgerInputOf(ctx.data));
}

export function fail(field: string, message: string): never {
  throw new ValidationError(message, { [field]: message });
}

/** Run a Zod schema and surface problems as a ValidationError with per-field messages. */
export function parseInput<T>(schema: { parse: (v: unknown) => T }, raw: unknown): T {
  try {
    return schema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = fieldErrors(error);
      throw new ValidationError(Object.values(errors)[0] ?? "Invalid input", errors);
    }
    throw error;
  }
}

/**
 * Validate that `value` has no more decimals than the currency allows and return it as a Decimal.
 * ("10.555 USD" is rejected rather than silently rounded.)
 */
export function money(value: string, currency: string, field: string): Dec {
  const d = dec(value);
  const max = decimalsOf(currency);
  if ((d.decimalPlaces() ?? 0) > max) {
    fail(field, max === 0 ? `${currency} has no decimals` : `${currency} allows at most ${max} decimal places`);
  }
  return d;
}

/** Fixed-decimals string for storage. */
export function moneyStr(value: Dec, currency: string): string {
  return round(value, decimalsOf(currency)).toFixed(decimalsOf(currency));
}

/** Rates are stored to 10 decimal places (>= 6 are always preserved), trailing zeros trimmed. */
export function rateStr(value: Dec): string {
  return round(value, 10).toFixed();
}
