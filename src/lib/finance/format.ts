import { currencySymbol, decimalsOf } from "./currency";
import { type Dec, D } from "./money";

/**
 * Display formatting. Values are formatted from decimal STRINGS (Intl.NumberFormat v3 keeps full
 * precision), so what is shown is exactly what is stored — no float round-trip.
 */
export type Numeric = Dec | string | number;

export const DEFAULT_LOCALE = "en-US";

const cache = new Map<string, Intl.NumberFormat>();
function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

function asString(value: Numeric): string {
  if (typeof value === "string") return value === "" ? "0" : value;
  if (typeof value === "number") return String(value);
  return value.toFixed();
}

export interface MoneyOptions {
  locale?: string;
  /** "always" shows + on positives, "exceptZero" hides sign on zero. Default "auto" (only negatives). */
  sign?: "auto" | "always" | "exceptZero" | "never";
  /** override decimals (default: the currency's minor unit) */
  decimals?: number;
  /** "symbol" ₼12.00 (default) | "code" 12.00 AZN | "none" 12.00 */
  display?: "symbol" | "code" | "none";
}

function baseOptions(currency: string, o: MoneyOptions): Intl.NumberFormatOptions {
  const decimals = o.decimals ?? decimalsOf(currency);
  const signDisplay = o.sign === "always" ? "always" : o.sign === "exceptZero" ? "exceptZero" : o.sign === "never" ? "never" : "auto";
  if (o.display === "none") {
    return { minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay };
  }
  return {
    style: "currency",
    currency,
    currencyDisplay: o.display === "code" ? "code" : "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay,
  };
}

export function formatMoney(value: Numeric, currency: string, o: MoneyOptions = {}): string {
  const locale = o.locale ?? DEFAULT_LOCALE;
  const opts = baseOptions(currency, o);
  const text = formatter(locale, opts).format(asString(value) as unknown as number);
  if (o.display === "none") return text;
  return o.display === "code" ? text.replace(/ /g, " ") : text;
}

/** "1,234.56 AZN" — for places where the symbol could be ambiguous (e.g. lists mixing currencies). */
export function formatMoneyCode(value: Numeric, currency: string, o: MoneyOptions = {}): string {
  const locale = o.locale ?? DEFAULT_LOCALE;
  const number = formatter(locale, baseOptions(currency, { ...o, display: "none" })).format(asString(value) as unknown as number);
  return `${number} ${currency}`;
}

export interface MoneyParts {
  sign: string;
  symbol: string;
  integer: string;
  decimal: string;
  fraction: string;
  currency: string;
  /** symbol is placed after the number in this locale/currency */
  symbolAfter: boolean;
}

/** Pieces for typographic hierarchy (big integer part, quiet decimals). */
export function moneyParts(value: Numeric, currency: string, o: MoneyOptions = {}): MoneyParts {
  const locale = o.locale ?? DEFAULT_LOCALE;
  const parts = formatter(locale, baseOptions(currency, o)).formatToParts(asString(value) as unknown as number);
  const out: MoneyParts = { sign: "", symbol: currencySymbol(currency), integer: "", decimal: "", fraction: "", currency, symbolAfter: false };
  let seenNumber = false;
  for (const p of parts) {
    switch (p.type) {
      case "minusSign":
      case "plusSign":
        out.sign = p.value;
        break;
      case "currency":
        out.symbol = p.value;
        out.symbolAfter = seenNumber;
        break;
      case "integer":
      case "group":
        out.integer += p.value;
        seenNumber = true;
        break;
      case "decimal":
        out.decimal = p.value;
        break;
      case "fraction":
        out.fraction += p.value;
        break;
      default:
        break;
    }
  }
  return out;
}

/** 12400 -> "12.4K", for chart axes. */
export function formatCompact(value: Numeric, o: { locale?: string } = {}): string {
  const n = Number(asString(value));
  if (!Number.isFinite(n)) return "0";
  return formatter(o.locale ?? DEFAULT_LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatNumber(value: Numeric, decimals = 0, o: { locale?: string } = {}): string {
  return formatter(o.locale ?? DEFAULT_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    asString(value) as unknown as number,
  );
}

/** ratio 0.1667 -> "16.7%" (decimals default 0) */
export function formatPercent(ratio: Numeric | null | undefined, decimals = 0, o: { locale?: string; sign?: boolean } = {}): string {
  if (ratio === null || ratio === undefined) return "—";
  const pct = new D(asString(ratio)).times(100);
  return `${o.sign && pct.gt(0) ? "+" : ""}${formatNumber(pct.toFixed(decimals), decimals, o)}%`;
}

/** Signed amount for deltas: "+₼12.00" / "−₼3.50". */
export function formatDelta(value: Numeric, currency: string, o: MoneyOptions = {}): string {
  return formatMoney(value, currency, { ...o, sign: "exceptZero" });
}
