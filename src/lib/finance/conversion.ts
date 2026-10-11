import { type CurrencyCode, decimalsOf, roundMoney } from "./currency";
import { type Dec, ZERO, dec, round } from "./money";

/**
 * Currency-conversion maths. A rate always reads "1 FROM = rate TO".
 *
 * The EFFECTIVE rate is simply received ÷ given: whatever spread the bank embedded in its rate is
 * already inside that number, so it is never ALSO counted as a fee. Fees are only the separate,
 * explicit commissions (fixed and/or percentage) that are charged on top.
 */

/** Rates are kept at 8 decimal places when derived from two amounts. */
export const DERIVED_RATE_DECIMALS = 8;

export function effectiveRate(given: Dec, received: Dec): Dec | null {
  if (given.isZero()) return null;
  return round(received.div(given), DERIVED_RATE_DECIMALS);
}

/** Amount received for `given` at `rate`, rounded to the destination currency's minor unit. */
export function receivedAt(given: Dec, rate: Dec, toCurrency: CurrencyCode): Dec {
  return roundMoney(given.times(rate), toCurrency);
}

/** Amount that must be given to receive `received` at `rate`. */
export function givenFor(received: Dec, rate: Dec, fromCurrency: CurrencyCode): Dec {
  if (rate.isZero()) return ZERO;
  return roundMoney(received.div(rate), fromCurrency);
}

export interface FeeInput {
  amount: Dec;
  /** fixed fee in the origin currency */
  fixed?: Dec | string | null;
  /** percentage of `amount`, e.g. 0.5 means 0.5 % */
  percent?: Dec | string | null;
  currency: CurrencyCode;
}

/** fixed + amount × percent/100, rounded to the origin currency's minor unit. */
export function computeFee({ amount, fixed, percent, currency }: FeeInput): Dec {
  const f = dec(fixed as string | null | undefined);
  const p = dec(percent as string | null | undefined);
  return round(f.plus(amount.times(p).div(100)), decimalsOf(currency));
}

/**
 * How much worse than a benchmark rate a conversion was, in the destination currency.
 * Positive = you received less than the benchmark would have given (the cost of the spread).
 */
export function spreadVsBenchmark(given: Dec, received: Dec, benchmarkRate: Dec, toCurrency: CurrencyCode): Dec {
  return roundMoney(given.times(benchmarkRate).minus(received), toCurrency);
}

/** Spread as a percentage of the benchmark value, e.g. 0.59 for 0.59 %. */
export function spreadPercent(given: Dec, received: Dec, benchmarkRate: Dec): Dec | null {
  const benchmark = given.times(benchmarkRate);
  if (benchmark.isZero()) return null;
  return round(benchmark.minus(received).div(benchmark).times(100), 4);
}
