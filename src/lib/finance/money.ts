import Decimal from "decimal.js";

/**
 * All money maths in the app goes through this decimal type — never JS numbers.
 *
 * Rounding rule (documented once, used everywhere): amounts are rounded to the currency's minor
 * unit with ROUND_HALF_UP (commercial rounding) and ONLY at the boundary where a stored/displayed
 * amount is produced. Intermediate results keep 60 significant digits.
 */
export const D = Decimal.clone({
  precision: 60,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -60,
  toExpPos: 60,
});

export type Dec = InstanceType<typeof D>;
export type DecLike = string | number | Dec | null | undefined;

export const ZERO: Dec = new D(0);
export const ONE: Dec = new D(1);

/** Coerce anything numeric-ish into a Decimal. null / undefined / "" become 0. */
export function dec(value: DecLike): Dec {
  if (value === null || value === undefined || value === "") return ZERO;
  if (D.isDecimal(value)) return value as Dec;
  return new D(value as string | number);
}

/** Like `dec` but returns null for null / undefined / "" / unparsable values. */
export function decOrNull(value: DecLike): Dec | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return D.isDecimal(value) ? (value as Dec) : new D(value as string | number);
  } catch {
    return null;
  }
}

export function round(value: Dec, decimals: number): Dec {
  return value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

export function sum(values: Iterable<Dec>): Dec {
  let total: Dec = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}

/** Plain-string form with no exponent. With `decimals`, always exactly that many places. */
export function toStr(value: Dec, decimals?: number): string {
  if (decimals === undefined) return value.toFixed();
  return value.toFixed(decimals, Decimal.ROUND_HALF_UP);
}

export const isZero = (v: Dec) => v.isZero();
export const isPos = (v: Dec) => v.gt(0);
export const isNeg = (v: Dec) => v.lt(0);

export function maxDec(a: Dec, b: Dec): Dec {
  return a.gte(b) ? a : b;
}
export function minDec(a: Dec, b: Dec): Dec {
  return a.lte(b) ? a : b;
}

/**
 * Parse a number the way a person types it. Accepts "1,234.56", "1 234,56", "12,5", "1.234.567",
 * "-3", ".5". Returns null when it is not a number.
 *
 * Disambiguation: if both "," and "." appear, the right-most one is the decimal separator. If only
 * one kind appears once and is followed by 1–2 digits it is a decimal separator ("12,50" -> 12.50);
 * followed by exactly 3 digits it is a thousands separator ("1,234" -> 1234).
 */
export function parseAmountInput(input: string | null | undefined): Dec | null {
  if (input === null || input === undefined) return null;
  let s = input.replace(/[\s  ']/g, "");
  if (s === "") return null;
  let sign = "";
  if (s.startsWith("-") || s.startsWith("−")) {
    sign = "-";
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandsSep = decimalSep === "." ? "," : ".";
    normalized = s.split(thousandsSep).join("");
    if (decimalSep === ",") normalized = normalized.replace(",", ".");
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? "." : ",";
    const parts = s.split(sep);
    if (parts.length > 2) {
      // 1.234.567 -> thousands separators
      if (!parts.slice(1).every((p) => p.length === 3)) return null;
      normalized = parts.join("");
    } else {
      const frac = parts[1] ?? "";
      if (sep === "," && frac.length === 3 && parts[0].length >= 1 && parts[0].length <= 3 && parts[0] !== "0") {
        normalized = parts.join(""); // 1,234 -> 1234
      } else {
        normalized = `${parts[0] || "0"}.${frac}`;
      }
    }
  } else {
    normalized = s;
  }
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === "." || normalized === "") return null;
  try {
    return new D(sign + normalized);
  } catch {
    return null;
  }
}

/** Render a rate without noise: keep at least `minDp` places, at most `maxDp`, trim the rest. */
export function formatRate(rate: Dec, minDp = 2, maxDp = 6): string {
  const fixed = rate.toFixed(maxDp, Decimal.ROUND_HALF_UP);
  const [int, frac = ""] = fixed.split(".");
  let trimmed = frac.replace(/0+$/, "");
  if (trimmed.length < minDp) trimmed = trimmed.padEnd(minDp, "0");
  return trimmed.length ? `${int}.${trimmed}` : int;
}
