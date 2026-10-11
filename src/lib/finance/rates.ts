import type { CurrencyCode } from "./currency";
import type { ISODate } from "./dates";
import { type Dec, ONE, dec } from "./money";

/**
 * One configured rate: 1 `from` = `rate` `to`, effective from a date.
 * accountId = null/undefined is a global rate, otherwise that card's own preferred rate.
 */
export interface RateRow {
  from: CurrencyCode;
  to: CurrencyCode;
  /** decimal string; 6+ decimal places are preserved */
  rate: string;
  effectiveFrom: ISODate;
  accountId?: string | null;
}

export type RateSource = "identity" | "account" | "global" | "inverse" | "cross";

export interface ResolvedRate {
  rate: Dec;
  source: RateSource;
}

interface IndexedRate {
  effectiveFrom: ISODate;
  rate: Dec;
  order: number;
}

/**
 * Effective-dated exchange rates.
 *
 * Lookup order for `rate(from, to, date, {accountId})`:
 *   1. identity (same currency)
 *   2. the account's own preferred rate (direct, then inverse)
 *   3. the global rate (direct, then inverse)
 *   4. a cross rate through the base currency (USD→EUR = USD→AZN × AZN→EUR)
 *
 * Within one pair, the row with the latest `effectiveFrom <= date` wins. For dates earlier than the
 * first configured row the earliest row is used, so back-dated entries still get a sensible rate.
 */
export class RateBook {
  private readonly index = new Map<string, IndexedRate[]>();

  constructor(
    rows: readonly RateRow[],
    readonly base: CurrencyCode,
  ) {
    rows.forEach((row, order) => {
      const key = RateBook.key(row.accountId ?? null, row.from, row.to);
      const list = this.index.get(key) ?? [];
      list.push({ effectiveFrom: row.effectiveFrom, rate: dec(row.rate), order });
      this.index.set(key, list);
    });
    for (const list of this.index.values()) {
      list.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? a.order - b.order : a.effectiveFrom < b.effectiveFrom ? -1 : 1));
    }
  }

  private static key(accountId: string | null, from: CurrencyCode, to: CurrencyCode): string {
    return `${accountId ?? "*"}|${from}|${to}`;
  }

  private direct(accountId: string | null, from: CurrencyCode, to: CurrencyCode, date: ISODate): Dec | null {
    const list = this.index.get(RateBook.key(accountId, from, to));
    if (!list || list.length === 0) return null;
    let chosen: IndexedRate | null = null;
    for (const row of list) {
      if (row.effectiveFrom <= date) chosen = row;
      else break;
    }
    return (chosen ?? list[0]).rate;
  }

  private bothWays(accountId: string | null, from: CurrencyCode, to: CurrencyCode, date: ISODate): Dec | null {
    const d = this.direct(accountId, from, to, date);
    if (d && d.gt(0)) return d;
    const inv = this.direct(accountId, to, from, date);
    if (inv && inv.gt(0)) return ONE.div(inv);
    return null;
  }

  rate(from: CurrencyCode, to: CurrencyCode, date: ISODate, opts?: { accountId?: string | null }): ResolvedRate | null {
    if (from === to) return { rate: ONE, source: "identity" };

    if (opts?.accountId) {
      const direct = this.direct(opts.accountId, from, to, date);
      if (direct && direct.gt(0)) return { rate: direct, source: "account" };
      const inverse = this.direct(opts.accountId, to, from, date);
      if (inverse && inverse.gt(0)) return { rate: ONE.div(inverse), source: "account" };
    }

    const global = this.direct(null, from, to, date);
    if (global && global.gt(0)) return { rate: global, source: "global" };
    const globalInverse = this.direct(null, to, from, date);
    if (globalInverse && globalInverse.gt(0)) return { rate: ONE.div(globalInverse), source: "inverse" };

    if (from !== this.base && to !== this.base) {
      const a = this.bothWays(null, from, this.base, date);
      const b = this.bothWays(null, this.base, to, date);
      if (a && b) return { rate: a.times(b), source: "cross" };
    }
    return null;
  }

  /** Value of 1 unit of `currency` in the base currency on `date` (global rates only). */
  toBase(currency: CurrencyCode, date: ISODate): Dec | null {
    if (currency === this.base) return ONE;
    return this.rate(currency, this.base, date)?.rate ?? null;
  }

  /** Every currency this book can price against the base. */
  pricedCurrencies(): Set<CurrencyCode> {
    const out = new Set<CurrencyCode>([this.base]);
    for (const key of this.index.keys()) {
      const [acct, from, to] = key.split("|");
      if (acct !== "*") continue;
      if (to === this.base) out.add(from);
      if (from === this.base) out.add(to);
    }
    return out;
  }

  /** Latest global row for a pair (used by the settings screen). */
  latestGlobal(from: CurrencyCode, to: CurrencyCode): { rate: Dec; effectiveFrom: ISODate } | null {
    const list = this.index.get(RateBook.key(null, from, to));
    if (!list || list.length === 0) return null;
    const last = list[list.length - 1];
    return { rate: last.rate, effectiveFrom: last.effectiveFrom };
  }
}
