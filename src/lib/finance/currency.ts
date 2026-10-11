import { type Dec, round } from "./money";

export type CurrencyCode = string;

/** Currencies offered in pickers. Any other 3-letter ISO code can still be typed in. */
export const COMMON_CURRENCIES: readonly CurrencyCode[] = [
  "AZN",
  "USD",
  "EUR",
  "GBP",
  "TRY",
  "RUB",
  "GEL",
  "AED",
  "KZT",
  "UAH",
  "CAD",
  "CHF",
  "JPY",
  "CNY",
];

const decimalsCache = new Map<string, number>();

/** Minor-unit digits for a currency (2 for AZN/USD, 0 for JPY, 3 for KWD) straight from Intl. */
export function decimalsOf(code: CurrencyCode): number {
  const cached = decimalsCache.get(code);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  decimalsCache.set(code, digits);
  return digits;
}

/** Round to the currency's minor unit (the app-wide HALF_UP rule). */
export function roundMoney(value: Dec, code: CurrencyCode): Dec {
  return round(value, decimalsOf(code));
}

const symbolCache = new Map<string, string>();

export function currencySymbol(code: CurrencyCode): string {
  const cached = symbolCache.get(code);
  if (cached) return cached;
  let symbol: string = code;
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    symbol = parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    symbol = code;
  }
  symbolCache.set(code, symbol);
  return symbol;
}

export function currencyName(code: CurrencyCode): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}
