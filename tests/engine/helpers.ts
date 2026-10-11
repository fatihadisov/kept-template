import { buildLedger } from "@/lib/finance/ledger";
import type { RateRow } from "@/lib/finance/rates";
import type { Ledger, LedgerAccount, LedgerSource, LedgerTx, TxType } from "@/lib/finance/types";

/** Tiny fluent builder so scenario tests read like the user stories they verify. */
export class Scenario {
  base = "AZN";
  accounts: LedgerAccount[] = [];
  sources: LedgerSource[] = [];
  txs: LedgerTx[] = [];
  rates: RateRow[] = [];
  private n = 0;

  account(id: string, currency: string, type = "CARD") {
    this.accounts.push({ id, name: id, type, currency, archived: false, sortOrder: this.accounts.length });
    return this;
  }

  source(id: string, kind = "SALARY") {
    this.sources.push({ id, name: id, kind, isSystem: false, isActive: true, sortOrder: this.sources.length });
    return this;
  }

  /** Global valuation / conversion rate: 1 `from` = `rate` `to`. */
  rate(from: string, to: string, rate: string, effectiveFrom = "2026-01-01", accountId: string | null = null) {
    this.rates.push({ from, to, rate, effectiveFrom, accountId });
    return this;
  }

  tx(partial: Partial<LedgerTx> & { type: TxType; date: string; accountId: string; amount: string }) {
    this.n += 1;
    const account = this.accounts.find((a) => a.id === partial.accountId);
    const tx: LedgerTx = {
      id: partial.id ?? `t${String(this.n).padStart(3, "0")}`,
      createdAt: partial.createdAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, this.n)).toISOString(),
      currency: partial.currency ?? account?.currency ?? this.base,
      allocationMode: "AUTO",
      allocations: [],
      ...partial,
    };
    this.txs.push(tx);
    return tx;
  }

  opening(accountId: string, amount: string, date: string) {
    return this.tx({ type: "OPENING", date, accountId, amount, subtype: "EXISTING_FUNDS" });
  }

  income(sourceId: string, accountId: string, amount: string, date: string, extra: Partial<LedgerTx> = {}) {
    return this.tx({ type: "INCOME", date, accountId, amount, incomeSourceId: sourceId, ...extra });
  }

  expense(accountId: string, amount: string, date: string, extra: Partial<LedgerTx> = {}) {
    return this.tx({ type: "EXPENSE", date, accountId, amount, ...extra });
  }

  /** Manual split, amounts in the paying account's currency. */
  split(parts: Record<string, string>) {
    return {
      allocationMode: "MANUAL" as const,
      allocations: Object.entries(parts).map(([sourceId, amount]) => ({ sourceId, amount })),
    };
  }

  transfer(from: string, to: string, amount: string, date: string, extra: Partial<LedgerTx> = {}) {
    return this.tx({ type: "TRANSFER", date, accountId: from, toAccountId: to, amount, toAmount: amount, ...extra });
  }

  exchange(from: string, to: string, amount: string, toAmount: string, date: string, extra: Partial<LedgerTx> = {}) {
    return this.tx({ type: "EXCHANGE", date, accountId: from, toAccountId: to, amount, toAmount, ...extra });
  }

  build(): Ledger {
    return buildLedger({
      baseCurrency: this.base,
      accounts: this.accounts,
      sources: this.sources,
      transactions: this.txs,
      rates: this.rates,
    });
  }
}

/** Standard fixture used by most scenarios: two salaries, USD + AZN cards, USD + AZN cash. */
export function standard() {
  return new Scenario()
    .account("usdCard", "USD")
    .account("aznCard", "AZN")
    .account("cashUsd", "USD", "CASH")
    .account("cashAzn", "AZN", "CASH")
    .source("A")
    .source("B")
    .rate("USD", "AZN", "1.70")
    .rate("AZN", "USD", "0.58");
}
