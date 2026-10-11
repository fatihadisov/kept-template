import { type CurrencyCode, decimalsOf, roundMoney } from "./currency";
import { distribute } from "./distribute";
import { type Dec, ONE, ZERO, dec, decOrNull, round } from "./money";
import { RateBook } from "./rates";
import type {
  Ledger,
  LedgerAccount,
  LedgerInput,
  LedgerIssue,
  LedgerSource,
  LedgerTx,
  Part,
  Posting,
  PostingRole,
  ResolvedTx,
  TxMetrics,
} from "./types";

/** Id of the synthetic "Existing funds" source used when the caller does not supply one. */
export const OPENING_SOURCE_FALLBACK_ID = "__existing_funds__";

interface Weight {
  sourceId: string;
  weight: Dec;
}

/** Ledger order: by date, then time (untimed first), then creation order, then id. */
export function sortTransactions<T extends Pick<LedgerTx, "date" | "time" | "createdAt" | "id">>(txs: readonly T[]): T[] {
  return [...txs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ta = a.time ?? "";
    const tb = b.time ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

const zeroMetrics = (): TxMetrics => ({
  incomeBase: ZERO,
  openingBase: ZERO,
  expenseBase: ZERO,
  fxLossBase: ZERO,
  feeBase: ZERO,
  adjustmentBase: ZERO,
  principalBase: ZERO,
});

/**
 * Builds the ledger from raw transactions.
 *
 * The model has two independent axes, and every posting carries both:
 *   - WHERE the money is  -> accountId (a card, a wallet of cash...)
 *   - WHOSE money it is   -> sourceId  (Income A, Income B, "Existing funds"...)
 *
 * Account balance = sum of postings on that account. Source balance = sum of postings of that
 * source. Both views always add up to the same total, so nothing can be counted twice, and moving
 * money between accounts (transfers, conversions) keeps its source attribution.
 *
 * Attribution rules ("AUTO" = the money follows itself):
 *   - an expense / transfer / exchange made from an account is attributed to the sources that
 *     currently make up that account's balance, pro rata
 *   - MANUAL transactions use their stored allocations instead (a 200/100 split of a 300 purchase)
 *   - a refund reverses the attribution of the expense it refunds
 *
 * Because attribution is re-derived on every build, edits, deletions and back-dated entries can
 * never leave stale numbers behind.
 */
export function buildLedger(input: LedgerInput): Ledger {
  const base = input.baseCurrency;
  const baseDecimals = decimalsOf(base);
  const rates = new RateBook(input.rates, base);

  const accounts = new Map<string, LedgerAccount>(input.accounts.map((a) => [a.id, a]));
  const sources = new Map<string, LedgerSource>(input.sources.map((s) => [s.id, s]));

  let openingSource = input.sources.find((s) => s.isSystem && s.kind === "OPENING");
  if (!openingSource) {
    openingSource = {
      id: OPENING_SOURCE_FALLBACK_ID,
      name: "Existing funds",
      kind: "OPENING",
      isSystem: true,
      isActive: true,
      sortOrder: -1,
    };
    sources.set(openingSource.id, openingSource);
  }
  const openingSourceId = openingSource.id;

  const realSources = [...sources.values()].filter((s) => !s.isSystem).sort((a, b) => a.sortOrder - b.sortOrder);
  const defaultSourceId =
    realSources.find((s) => s.isActive && s.kind === "SALARY")?.id ?? realSources.find((s) => s.isActive)?.id ?? openingSourceId;

  const sourceOrder = new Map<string, number>();
  [...sources.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1))
    .forEach((s, i) => sourceOrder.set(s.id, i));

  const issues: LedgerIssue[] = [];
  const missingRates = new Set<CurrencyCode>();
  const resolved: ResolvedTx[] = [];
  const byId = new Map<string, ResolvedTx>();
  const postings: Posting[] = [];

  /** running attribution matrix: account -> source -> balance (account currency) */
  const cells = new Map<string, Map<string, Dec>>();
  let seq = 0;

  const issue = (txId: string | null, code: LedgerIssue["code"], message: string) => issues.push({ txId, code, message });

  /** valuation rate of `ccy` into base for this transaction: frozen snapshot first, else the rate book */
  function rateFor(tx: LedgerTx, ccy: CurrencyCode): Dec {
    if (ccy === base) return ONE;
    const frozen = decOrNull(tx.fx?.[ccy]);
    if (frozen && frozen.gt(0)) return frozen;
    const live = rates.toBase(ccy, tx.date);
    if (live) return live;
    missingRates.add(ccy);
    issue(tx.id, "MISSING_RATE", `No exchange rate configured for ${ccy}`);
    return ZERO;
  }

  const baseValue = (amount: Dec, rate: Dec): Dec => round(amount.times(rate), baseDecimals);

  function autoWeights(accountId: string): Weight[] {
    const row = cells.get(accountId);
    const weights: Weight[] = [];
    if (row) {
      for (const [sourceId, value] of row) {
        if (value.gt(0)) weights.push({ sourceId, weight: value });
      }
    }
    if (weights.length === 0) return [{ sourceId: defaultSourceId, weight: ONE }];
    weights.sort((a, b) => (sourceOrder.get(a.sourceId) ?? 0) - (sourceOrder.get(b.sourceId) ?? 0));
    return weights;
  }

  function manualWeights(tx: LedgerTx): Weight[] | null {
    if (tx.allocationMode !== "MANUAL") return null;
    const out: Weight[] = [];
    for (const a of tx.allocations) {
      if (!sources.has(a.sourceId)) {
        issue(tx.id, "UNKNOWN_SOURCE", `Allocation references an unknown income source`);
        continue;
      }
      const amount = decOrNull(a.amount);
      if (!amount || amount.lte(0)) continue;
      out.push({ sourceId: a.sourceId, weight: amount });
    }
    out.sort((a, b) => (sourceOrder.get(a.sourceId) ?? 0) - (sourceOrder.get(b.sourceId) ?? 0));
    return out.length > 0 ? out : null;
  }

  function toParts(total: Dec, weights: Weight[], decimals: number): Part[] {
    const amounts = distribute(total, weights.map((w) => w.weight), decimals);
    const parts: Part[] = [];
    amounts.forEach((amount, i) => {
      if (!amount.isZero()) parts.push({ sourceId: weights[i].sourceId, amount });
    });
    return parts;
  }

  /** Turn attributed parts into postings, splitting the leg's base value exactly across them. */
  function leg(
    tx: LedgerTx,
    accountId: string,
    currency: CurrencyCode,
    role: PostingRole,
    sign: 1 | -1,
    parts: Part[],
    totalBase: Dec,
  ): Posting[] {
    if (parts.length === 0) return [];
    const bases = distribute(totalBase.abs(), parts.map((p) => p.amount.abs()), baseDecimals);
    return parts.map((part, i) => ({
      seq: 0,
      txId: tx.id,
      txType: tx.type,
      date: tx.date,
      accountId,
      sourceId: part.sourceId,
      currency,
      amount: sign === 1 ? part.amount : part.amount.neg(),
      base: sign === 1 ? bases[i] : bases[i].neg(),
      role,
    }));
  }

  function push(tx: LedgerTx, drafts: Posting[], rtx: Omit<ResolvedTx, "tx" | "seq">) {
    const entry: ResolvedTx = { tx, seq: resolved.length, ...rtx };
    for (const draft of drafts) {
      draft.seq = seq;
      seq += 1;
      postings.push(draft);
      let row = cells.get(draft.accountId);
      if (!row) {
        row = new Map();
        cells.set(draft.accountId, row);
      }
      row.set(draft.sourceId, (row.get(draft.sourceId) ?? ZERO).plus(draft.amount));
    }
    resolved.push(entry);
    byId.set(tx.id, entry);
  }

  for (const tx of sortTransactions(input.transactions)) {
    const account = accounts.get(tx.accountId);
    if (!account) {
      issue(tx.id, "UNKNOWN_ACCOUNT", `Transaction references an account that no longer exists`);
      continue;
    }
    const acctCcy = account.currency;
    const amountRaw = decOrNull(tx.amount);
    if (!amountRaw) {
      issue(tx.id, "BAD_AMOUNT", `Amount "${tx.amount}" is not a number`);
      continue;
    }
    const metrics = zeroMetrics();

    switch (tx.type) {
      case "INCOME":
      case "OPENING": {
        const amount = roundMoney(amountRaw, acctCcy);
        let sourceId = tx.type === "OPENING" ? openingSourceId : (tx.incomeSourceId ?? defaultSourceId);
        if (!sources.has(sourceId)) {
          issue(tx.id, "UNKNOWN_SOURCE", `Income references an unknown source`);
          sourceId = defaultSourceId;
        }
        if (tx.currency !== acctCcy) issue(tx.id, "CURRENCY_MISMATCH", `Receipt currency ${tx.currency} differs from account currency ${acctCcy}`);
        const value = baseValue(amount, rateFor(tx, acctCcy));
        if (tx.type === "INCOME") metrics.incomeBase = value;
        else metrics.openingBase = value;
        metrics.principalBase = value.abs();
        const parts: Part[] = amount.isZero() ? [] : [{ sourceId, amount: amount.abs() }];
        push(tx, leg(tx, account.id, acctCcy, "MAIN", amount.isNegative() ? -1 : 1, parts, value), {
          parts,
          metrics,
          accountCurrency: acctCcy,
          out: ZERO,
          into: amount,
          fee: ZERO,
        });
        break;
      }

      case "EXPENSE": {
        let debit: Dec;
        if (tx.accountAmount != null && tx.accountAmount !== "") {
          debit = roundMoney(dec(tx.accountAmount), acctCcy);
        } else if (tx.currency === acctCcy) {
          debit = roundMoney(amountRaw, acctCcy);
        } else {
          issue(tx.id, "CURRENCY_MISMATCH", `Expense in ${tx.currency} paid from a ${acctCcy} account has no account amount`);
          const r = rates.rate(tx.currency, acctCcy, tx.date, { accountId: account.id });
          debit = roundMoney(r ? amountRaw.times(r.rate) : amountRaw, acctCcy);
        }
        const price = roundMoney(amountRaw, tx.currency);
        const weights = manualWeights(tx) ?? autoWeights(account.id);
        const parts = toParts(debit, weights, decimalsOf(acctCcy));
        const cost = baseValue(price, rateFor(tx, tx.currency));
        const debitBase = baseValue(debit, rateFor(tx, acctCcy));
        metrics.expenseBase = cost;
        metrics.fxLossBase = debitBase.minus(cost);
        metrics.principalBase = cost;
        push(tx, leg(tx, account.id, acctCcy, "MAIN", -1, parts, debitBase), {
          parts,
          metrics,
          accountCurrency: acctCcy,
          out: debit,
          into: ZERO,
          fee: ZERO,
        });
        break;
      }

      case "REFUND": {
        let credit: Dec;
        if (tx.accountAmount != null && tx.accountAmount !== "") {
          credit = roundMoney(dec(tx.accountAmount), acctCcy);
        } else if (tx.currency === acctCcy) {
          credit = roundMoney(amountRaw, acctCcy);
        } else {
          issue(tx.id, "CURRENCY_MISMATCH", `Refund in ${tx.currency} into a ${acctCcy} account has no account amount`);
          const r = rates.rate(tx.currency, acctCcy, tx.date, { accountId: account.id });
          credit = roundMoney(r ? amountRaw.times(r.rate) : amountRaw, acctCcy);
        }
        const price = roundMoney(amountRaw, tx.currency);
        let weights = manualWeights(tx);
        if (!weights) {
          const original = tx.refundOfId ? byId.get(tx.refundOfId) : undefined;
          if (original && original.parts.length > 0) {
            weights = original.parts.map((p) => ({ sourceId: p.sourceId, weight: p.amount }));
          } else {
            weights = [{ sourceId: defaultSourceId, weight: ONE }];
          }
        }
        const parts = toParts(credit, weights, decimalsOf(acctCcy));
        const cost = baseValue(price, rateFor(tx, tx.currency));
        const creditBase = baseValue(credit, rateFor(tx, acctCcy));
        metrics.expenseBase = cost.neg();
        metrics.fxLossBase = creditBase.minus(cost).neg();
        metrics.principalBase = cost;
        push(tx, leg(tx, account.id, acctCcy, "MAIN", 1, parts, creditBase), {
          parts,
          metrics,
          accountCurrency: acctCcy,
          out: ZERO,
          into: credit,
          fee: ZERO,
        });
        break;
      }

      case "TRANSFER":
      case "EXCHANGE": {
        const toAccount = tx.toAccountId ? accounts.get(tx.toAccountId) : undefined;
        if (!toAccount) {
          issue(tx.id, "UNKNOWN_ACCOUNT", `Transfer destination account no longer exists`);
          break;
        }
        const toCcy = toAccount.currency;
        const out = roundMoney(amountRaw, acctCcy);
        const fee = roundMoney(dec(tx.feeAmount), acctCcy);
        let into: Dec;
        if (tx.toAmount != null && tx.toAmount !== "") {
          into = roundMoney(dec(tx.toAmount), toCcy);
        } else if (acctCcy === toCcy) {
          into = out;
        } else {
          issue(tx.id, "CURRENCY_MISMATCH", `Conversion ${acctCcy}→${toCcy} has no received amount`);
          const r = rates.rate(acctCcy, toCcy, tx.date, { accountId: account.id });
          into = roundMoney(r ? out.times(r.rate) : out, toCcy);
        }
        const weights = manualWeights(tx) ?? autoWeights(account.id);
        const outParts = toParts(out, weights, decimalsOf(acctCcy));
        const feeParts = toParts(fee, weights, decimalsOf(acctCcy));
        const inParts = toParts(into, weights, decimalsOf(toCcy));

        const fromRate = rateFor(tx, acctCcy);
        const given = baseValue(out, fromRate);
        const feeBase = baseValue(fee, fromRate);
        const received = baseValue(into, rateFor(tx, toCcy));
        metrics.fxLossBase = given.minus(received);
        metrics.feeBase = feeBase;
        metrics.principalBase = given;

        const drafts = [
          ...leg(tx, account.id, acctCcy, "OUT", -1, outParts, given),
          ...leg(tx, account.id, acctCcy, "FEE", -1, feeParts, feeBase),
          ...leg(tx, toAccount.id, toCcy, "IN", 1, inParts, received),
        ];
        push(tx, drafts, {
          parts: outParts,
          metrics,
          accountCurrency: acctCcy,
          toCurrency: toCcy,
          out,
          into,
          fee,
        });
        break;
      }

      case "ADJUSTMENT": {
        const delta = roundMoney(amountRaw, acctCcy);
        const positive = delta.gte(0);
        const weights = manualWeights(tx) ?? (positive ? [{ sourceId: openingSourceId, weight: ONE }] : autoWeights(account.id));
        const parts = toParts(delta.abs(), weights, decimalsOf(acctCcy));
        const value = baseValue(delta, rateFor(tx, acctCcy));
        metrics.adjustmentBase = value;
        metrics.principalBase = value.abs();
        push(tx, leg(tx, account.id, acctCcy, "MAIN", positive ? 1 : -1, parts, value), {
          parts: positive ? parts : parts.map((p) => ({ ...p, amount: p.amount.neg() })),
          metrics,
          accountCurrency: acctCcy,
          out: positive ? ZERO : delta.abs(),
          into: positive ? delta : ZERO,
          fee: ZERO,
        });
        break;
      }
    }
  }

  return {
    base,
    baseDecimals,
    accounts,
    sources,
    openingSourceId,
    defaultSourceId,
    rateRows: input.rates,
    rates,
    txs: resolved,
    byId,
    postings,
    issues,
    missingRates,
  };
}
