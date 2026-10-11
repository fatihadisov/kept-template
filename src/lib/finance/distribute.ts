import { type Dec, D, ZERO, round } from "./money";

/**
 * Largest-remainder apportionment.
 *
 * Splits `total` into `weights.length` parts proportional to `weights`, each rounded to `decimals`
 * places, such that the parts sum EXACTLY to `total` (rounded to `decimals`). This is what makes a
 * 300 AZN purchase split 200/100 across two salaries — or 100 USD split 33.33/33.33/33.34 —
 * reconcile to the cent with the real account debit.
 *
 * - Negative totals are handled by splitting the absolute value and restoring the sign.
 * - Negative weights are treated as 0.
 * - If every weight is 0 the whole amount goes to the first part.
 * - Ties on the fractional remainder are resolved in favour of the earlier part (deterministic).
 */
export function distribute(total: Dec, weights: readonly Dec[], decimals: number): Dec[] {
  const n = weights.length;
  if (n === 0) return [];
  const negative = total.isNegative();
  const absTotal = round(total.abs(), decimals);
  const unit = new D(10).pow(-decimals);
  const totalUnits = absTotal.div(unit); // an integer

  const w = weights.map((x) => (x.isNegative() ? ZERO : x));
  const weightSum = w.reduce((acc, x) => acc.plus(x), ZERO);

  if (weightSum.isZero()) {
    const out = weights.map(() => ZERO);
    out[0] = negative ? absTotal.neg() : absTotal;
    return out;
  }

  const exact = w.map((x) => totalUnits.times(x).div(weightSum));
  const floors = exact.map((x) => x.floor());
  const assigned = floors.reduce((acc, x) => acc.plus(x), ZERO);
  let remainder = totalUnits.minus(assigned).toNumber(); // 0 <= remainder < n

  const order = exact
    .map((x, index) => ({ index, frac: x.minus(x.floor()) }))
    .sort((a, b) => {
      const c = b.frac.comparedTo(a.frac);
      return c !== 0 ? c : a.index - b.index;
    });

  const extra = new Array<number>(n).fill(0);
  for (const { index } of order) {
    if (remainder <= 0) break;
    // a zero-weight part never receives a leftover unit
    if (w[index].isZero()) continue;
    extra[index] = 1;
    remainder -= 1;
  }

  return floors.map((f, i) => {
    const part = f.plus(extra[i]).times(unit);
    return negative ? part.neg() : part;
  });
}

/**
 * Round `values` to `decimals` places so that the rounded values sum EXACTLY to `total`
 * (itself already rounded). Used so that, e.g., per-source balances always foot to the grand total.
 * The largest rounding errors absorb the leftover units; ties resolve to the earlier index.
 */
export function roundToTotal(values: readonly Dec[], total: Dec, decimals: number): Dec[] {
  if (values.length === 0) return [];
  const unit = new D(10).pow(-decimals);
  const rounded = values.map((v) => round(v, decimals));
  let diffUnits = round(total, decimals)
    .minus(rounded.reduce((acc, v) => acc.plus(v), ZERO))
    .div(unit)
    .toNumber();
  if (diffUnits === 0) return rounded;

  const errors = values.map((v, i) => ({ i, err: v.minus(rounded[i]) }));
  const out = [...rounded];
  if (diffUnits > 0) {
    errors.sort((a, b) => b.err.comparedTo(a.err) || a.i - b.i);
  } else {
    errors.sort((a, b) => a.err.comparedTo(b.err) || a.i - b.i);
  }
  const step = diffUnits > 0 ? unit : unit.neg();
  let cursor = 0;
  while (diffUnits !== 0) {
    const target = errors[cursor % errors.length].i;
    out[target] = out[target].plus(step);
    diffUnits += diffUnits > 0 ? -1 : 1;
    cursor += 1;
  }
  return out;
}
