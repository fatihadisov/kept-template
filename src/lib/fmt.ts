import { formatCompact, formatDelta, formatMoney, formatNumber, formatPercent, moneyParts, type MoneyOptions, type Numeric } from "./finance/format";
import { dec, formatRate } from "./finance/money";

/**
 * Formatting bound to the user's locale and reporting currency. Cheap to create, so server pages and
 * client components each build their own from the two plain strings (functions can't cross the boundary).
 */
export function makeFmt(locale: string, base: string) {
  return {
    locale,
    base,
    /** amount in any currency (defaults to the reporting currency) */
    money: (v: Numeric, ccy: string = base, o: MoneyOptions = {}) => formatMoney(v, ccy, { locale, ...o }),
    /** amount in the reporting currency */
    inBase: (v: Numeric, o: MoneyOptions = {}) => formatMoney(v, base, { locale, ...o }),
    /** "+₼12.00" / "−₼3.50"; zero has no sign */
    delta: (v: Numeric, ccy: string = base) => formatDelta(v, ccy, { locale }),
    pct: (r: Numeric | null | undefined, decimals = 0, sign = false) => formatPercent(r, decimals, { locale, sign }),
    num: (v: Numeric, decimals = 0) => formatNumber(v, decimals, { locale }),
    compact: (v: Numeric) => formatCompact(v, { locale }),
    parts: (v: Numeric, ccy: string = base, o: MoneyOptions = {}) => moneyParts(v, ccy, { locale, ...o }),
    rate: (v: Numeric) => formatRate(dec(v as string)),
    /** a change in percentage points, e.g. "1 pt", "15 pts" (takes the change as a ratio-less number of points) */
    points: (pts: number) => {
      const n = Math.round(Math.abs(pts));
      return `${n} ${n === 1 ? "pt" : "pts"}`;
    },
  };
}

export type Fmt = ReturnType<typeof makeFmt>;
