import type { CurrencyCode } from "./currency";
import { decimalsOf } from "./currency";
import { roundToTotal } from "./distribute";
import type { ISODate } from "./dates";
import { type Dec, ONE, ZERO, round } from "./money";
import type { Ledger, Posting } from "./types";

/** Running balances while walking the ledger forwards. */
export interface State {
  /** account -> balance in the account's currency */
  balances: Map<string, Dec>;
  /** account -> source -> balance in the account's currency (the attribution matrix) */
  cells: Map<string, Map<string, Dec>>;
}

export function emptyState(): State {
  return { balances: new Map(), cells: new Map() };
}

export function applyPosting(state: State, p: Posting): void {
  state.balances.set(p.accountId, (state.balances.get(p.accountId) ?? ZERO).plus(p.amount));
  let row = state.cells.get(p.accountId);
  if (!row) {
    row = new Map();
    state.cells.set(p.accountId, row);
  }
  row.set(p.sourceId, (row.get(p.sourceId) ?? ZERO).plus(p.amount));
}

/**
 * Walk the ledger once and call `visit` at each requested date (ascending) with the state as of the
 * END of that day. The state object is reused between calls: copy what you need.
 */
export function replay(ledger: Ledger, dates: readonly ISODate[], visit: (date: ISODate, state: State) => void): void {
  const state = emptyState();
  let i = 0;
  const { postings } = ledger;
  for (const date of dates) {
    while (i < postings.length && postings[i].date <= date) {
      applyPosting(state, postings[i]);
      i += 1;
    }
    visit(date, state);
  }
}

export function stateAt(ledger: Ledger, date: ISODate): State {
  const state = emptyState();
  for (const p of ledger.postings) {
    if (p.date > date) break;
    applyPosting(state, p);
  }
  return state;
}

/** Rate of `currency` into the base on `date` for valuing balances. Missing rates value at 0. */
function valuationRate(ledger: Ledger, currency: CurrencyCode, date: ISODate): Dec {
  if (currency === ledger.base) return ONE;
  const r = ledger.rates.toBase(currency, date);
  if (!r) {
    ledger.missingRates.add(currency);
    return ZERO;
  }
  return r;
}

export interface AccountBalance {
  accountId: string;
  currency: CurrencyCode;
  balance: Dec;
  /** valuation rate used (1 base = ... ) */
  rate: Dec;
  baseValue: Dec;
}

export interface Holding {
  currency: CurrencyCode;
  amount: Dec;
  baseValue: Dec;
}

export interface SourceBalance {
  sourceId: string;
  baseValue: Dec;
  holdings: Holding[];
}

export interface Snapshot {
  date: ISODate;
  accounts: AccountBalance[];
  sources: SourceBalance[];
  /** grand total in the base currency; accounts and sources both foot to it exactly */
  total: Dec;
  byCurrency: Holding[];
}

/**
 * Value a state at `date`: every account's balance converted at the rate in effect on that date.
 * Rows are rounded so that accounts foot to the total AND sources foot to the same total.
 */
export function snapshotFromState(ledger: Ledger, state: State, date: ISODate): Snapshot {
  const baseDec = ledger.baseDecimals;
  const rateCache = new Map<CurrencyCode, Dec>();
  const rateOf = (ccy: CurrencyCode) => {
    let r = rateCache.get(ccy);
    if (!r) {
      r = valuationRate(ledger, ccy, date);
      rateCache.set(ccy, r);
    }
    return r;
  };

  const accounts: AccountBalance[] = [];
  for (const account of ledger.accounts.values()) {
    const balance = state.balances.get(account.id) ?? ZERO;
    const rate = rateOf(account.currency);
    accounts.push({
      accountId: account.id,
      currency: account.currency,
      balance,
      rate,
      baseValue: round(balance.times(rate), baseDec),
    });
  }
  const total = accounts.reduce((acc, a) => acc.plus(a.baseValue), ZERO);

  // sources: exact values per source, rounded so they foot to `total`
  const sourceIds = [...ledger.sources.keys()];
  const exact = sourceIds.map((sourceId) => {
    let value = ZERO;
    for (const account of ledger.accounts.values()) {
      const cell = state.cells.get(account.id)?.get(sourceId);
      if (cell) value = value.plus(cell.times(rateOf(account.currency)));
    }
    return value;
  });
  const rounded = roundToTotal(exact, total, baseDec);

  const sources: SourceBalance[] = sourceIds.map((sourceId, i) => {
    const byCcy = new Map<CurrencyCode, Dec>();
    for (const account of ledger.accounts.values()) {
      const cell = state.cells.get(account.id)?.get(sourceId);
      if (cell && !cell.isZero()) byCcy.set(account.currency, (byCcy.get(account.currency) ?? ZERO).plus(cell));
    }
    const ccys = [...byCcy.keys()].sort();
    const exactHoldings = ccys.map((c) => (byCcy.get(c) as Dec).times(rateOf(c)));
    const roundedHoldings = roundToTotal(exactHoldings, rounded[i], baseDec);
    return {
      sourceId,
      baseValue: rounded[i],
      holdings: ccys.map((currency, k) => ({ currency, amount: byCcy.get(currency) as Dec, baseValue: roundedHoldings[k] })),
    };
  });

  const ccyTotals = new Map<CurrencyCode, { amount: Dec; base: Dec }>();
  for (const a of accounts) {
    const prev = ccyTotals.get(a.currency) ?? { amount: ZERO, base: ZERO };
    ccyTotals.set(a.currency, { amount: prev.amount.plus(a.balance), base: prev.base.plus(a.baseValue) });
  }
  const byCurrency: Holding[] = [...ccyTotals.entries()]
    .map(([currency, v]) => ({ currency, amount: v.amount, baseValue: v.base }))
    .sort((a, b) => b.baseValue.comparedTo(a.baseValue));

  return { date, accounts, sources, total, byCurrency };
}

export function snapshotAt(ledger: Ledger, date: ISODate): Snapshot {
  return snapshotFromState(ledger, stateAt(ledger, date), date);
}

export interface Overdraft {
  accountId: string;
  firstDate: ISODate;
  lowest: Dec;
  lowestDate: ISODate;
  /** balance after the last posting */
  endBalance: Dec;
}

/**
 * Accounts whose balance is below zero at the END of any day. (Intra-day ordering is ignored so a
 * salary and a purchase recorded on the same date never raise a false alarm.)
 */
export function detectOverdrafts(ledger: Ledger): Overdraft[] {
  const balances = new Map<string, Dec>();
  const found = new Map<string, Overdraft>();
  const { postings } = ledger;
  let i = 0;
  while (i < postings.length) {
    const date = postings[i].date;
    const touched = new Set<string>();
    while (i < postings.length && postings[i].date === date) {
      const p = postings[i];
      balances.set(p.accountId, (balances.get(p.accountId) ?? ZERO).plus(p.amount));
      touched.add(p.accountId);
      i += 1;
    }
    for (const accountId of touched) {
      const balance = balances.get(accountId) as Dec;
      if (balance.isNegative()) {
        const prev = found.get(accountId);
        if (!prev) {
          found.set(accountId, { accountId, firstDate: date, lowest: balance, lowestDate: date, endBalance: balance });
        } else if (balance.lt(prev.lowest)) {
          prev.lowest = balance;
          prev.lowestDate = date;
        }
      }
    }
  }
  for (const o of found.values()) o.endBalance = balances.get(o.accountId) ?? ZERO;
  return [...found.values()];
}

/** Minor-unit rounding for an account balance, in its own currency. */
export function roundBalance(value: Dec, currency: CurrencyCode): Dec {
  return round(value, decimalsOf(currency));
}
