import type { ISODate } from "./dates";
import { decOrNull } from "./money";
import { NO_CATEGORY } from "./stats";
import type { Ledger, ResolvedTx, TxType } from "./types";

export interface TxFilter {
  from?: ISODate;
  to?: ISODate;
  types?: TxType[];
  /** matches the paying/receiving account or a transfer's destination */
  accountIds?: string[];
  /** matches the income source of a receipt or any source a payment was attributed to */
  sourceIds?: string[];
  /** category ids; use NO_CATEGORY for uncategorised */
  categoryIds?: string[];
  currencies?: string[];
  /** with exactly one currency selected, compared in that currency; otherwise in the base currency */
  min?: string;
  max?: string;
  search?: string;
  tags?: string[];
}

export interface FilterLookups {
  accountName: (id: string) => string;
  categoryName: (id: string) => string;
  sourceName: (id: string) => string;
}

function haystack(r: ResolvedTx, lookups: FilterLookups): string {
  const t = r.tx;
  const bits = [
    t.description,
    t.notes,
    t.amount,
    t.accountAmount,
    t.toAmount,
    t.currency,
    lookups.accountName(t.accountId),
    t.toAccountId ? lookups.accountName(t.toAccountId) : "",
    t.categoryId ? lookups.categoryName(t.categoryId) : "",
    t.incomeSourceId ? lookups.sourceName(t.incomeSourceId) : "",
    ...(t.tags ?? []),
    t.type,
  ];
  return bits.filter(Boolean).join(" ").toLowerCase();
}

/** Newest first. Filters are AND-ed; each list filter is an OR within itself. */
export function filterTransactions(ledger: Ledger, f: TxFilter, lookups: FilterLookups): ResolvedTx[] {
  const query = f.search?.trim().toLowerCase() ?? "";
  const terms = query ? query.split(/\s+/) : [];
  const min = decOrNull(f.min);
  const max = decOrNull(f.max);
  const singleCurrency = f.currencies && f.currencies.length === 1 ? f.currencies[0] : null;

  const out = ledger.txs.filter((r) => {
    const t = r.tx;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.types && f.types.length && !f.types.includes(t.type)) return false;
    if (f.accountIds && f.accountIds.length) {
      if (!f.accountIds.includes(t.accountId) && !(t.toAccountId && f.accountIds.includes(t.toAccountId))) return false;
    }
    if (f.sourceIds && f.sourceIds.length) {
      const hit =
        (t.incomeSourceId && f.sourceIds.includes(t.incomeSourceId)) || r.parts.some((p) => f.sourceIds?.includes(p.sourceId));
      if (!hit) return false;
    }
    if (f.categoryIds && f.categoryIds.length) {
      if (!f.categoryIds.includes(t.categoryId ?? NO_CATEGORY)) return false;
    }
    if (f.currencies && f.currencies.length) {
      const toCcy = r.toCurrency;
      if (!f.currencies.includes(t.currency) && !f.currencies.includes(r.accountCurrency) && !(toCcy && f.currencies.includes(toCcy))) {
        return false;
      }
    }
    if (min || max) {
      const value = singleCurrency && singleCurrency === t.currency ? decOrNull(t.amount)?.abs() : r.metrics.principalBase;
      if (!value) return false;
      if (min && value.lt(min)) return false;
      if (max && value.gt(max)) return false;
    }
    if (f.tags && f.tags.length) {
      const have = t.tags ?? [];
      if (!f.tags.some((tag) => have.includes(tag))) return false;
    }
    if (terms.length) {
      const text = haystack(r, lookups);
      if (!terms.every((term) => text.includes(term))) return false;
    }
    return true;
  });
  return out.reverse();
}
