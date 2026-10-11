import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/finance/dates";
import { type Dec, ZERO, dec } from "@/lib/finance/money";
import { replay, snapshotAt, snapshotFromState } from "@/lib/finance/queries";
import { periodStats, reconcile } from "@/lib/finance/stats";
import type { Ledger, LedgerTx } from "@/lib/finance/types";
import { Scenario } from "./helpers";

/** Deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const cents = (r: () => number, maxUnits: number) => Math.max(1, Math.floor(r() * maxUnits * 100));
const fmt = (c: number) => (c / 100).toFixed(2);

interface GenOptions {
  /** only USD + AZN, USD valued at a rate that gives exact products (2) */
  exactRates?: boolean;
  count?: number;
}

function generate(seed: number, opts: GenOptions = {}): Scenario {
  const r = rng(seed);
  const s = new Scenario()
    .account("usdCard", "USD")
    .account("aznCard", "AZN")
    .account("cashUsd", "USD", "CASH")
    .account("cashAzn", "AZN", "CASH")
    .source("A")
    .source("B")
    .source("C");
  if (opts.exactRates) {
    s.rate("USD", "AZN", "2");
  } else {
    s.account("eurCard", "EUR").rate("USD", "AZN", "1.7").rate("EUR", "AZN", "1.9999").rate("USD", "AZN", "1.71", "2026-08-15");
  }
  const accounts = s.accounts.map((a) => a.id);
  const ccyOf = (id: string) => s.accounts.find((a) => a.id === id)!.currency;
  const sources = ["A", "B", "C"];
  const day = (lo: number, hi: number) => addDays("2026-07-01", lo + Math.floor(r() * (hi - lo)));
  const live = (ccy: string, date: string) =>
    ccy === "AZN" ? null : ccy === "USD" ? (opts.exactRates ? "2" : date >= "2026-08-15" ? "1.71" : "1.7") : "1.9999";

  const expenses: LedgerTx[] = [];
  const n = opts.count ?? 70;
  for (let i = 0; i < n; i += 1) {
    const roll = r();
    const date = day(0, 100);
    const withFx = r() < 0.5;
    if (roll < 0.04 || i < 3) {
      const acct = pick(r, accounts);
      s.opening(acct, fmt(cents(r, 3000)), day(0, 5));
    } else if (roll < 0.3) {
      const acct = pick(r, accounts);
      const ccy = ccyOf(acct);
      const rate = live(ccy, date);
      s.income(pick(r, sources), acct, fmt(cents(r, 4000)), date, withFx && rate ? { fx: { [ccy]: rate } } : {});
    } else if (roll < 0.62) {
      const acct = pick(r, accounts);
      const ccy = ccyOf(acct);
      const debitCents = cents(r, 300);
      let extra: Partial<LedgerTx> = { categoryId: pick(r, ["food", "fun", "car"]) };
      if (r() < 0.35) {
        // manual split that sums exactly to the debit
        const n2 = 2 + Math.floor(r() * 2);
        const chosen = [...sources].sort(() => r() - 0.5).slice(0, n2);
        let left = debitCents;
        const alloc: Record<string, string> = {};
        chosen.forEach((id, k) => {
          const c = k === chosen.length - 1 ? left : Math.floor(left * r() * 0.8);
          alloc[id] = fmt(c);
          left -= c;
        });
        extra = { ...extra, ...s.split(alloc) };
      }
      let amount = fmt(debitCents);
      if (r() < 0.2) {
        // priced in another currency than the card
        const priceCcy = ccy === "AZN" ? "USD" : "AZN";
        amount = fmt(cents(r, 200));
        extra = { ...extra, currency: priceCcy, accountAmount: fmt(debitCents) };
      }
      const rate = live(ccy, date);
      const fx: Record<string, string> = {};
      if (withFx) {
        if (rate) fx[ccy] = rate;
        const pr = live(extra.currency ?? ccy, date);
        if (pr && extra.currency) fx[extra.currency] = pr;
      }
      const tx = s.expense(acct, amount, date, { ...extra, ...(Object.keys(fx).length ? { fx } : {}) });
      expenses.push(tx);
    } else if (roll < 0.74) {
      // exchange between different currencies
      const from = pick(r, accounts);
      const to = pick(r, accounts.filter((a) => ccyOf(a) !== ccyOf(from)));
      const amount = cents(r, 500);
      const toAmount = Math.max(1, Math.round(amount * (0.8 + r() * 1.6)));
      s.exchange(from, to, fmt(amount), fmt(toAmount), date, r() < 0.5 ? { feeAmount: fmt(Math.floor(amount * 0.01)) } : {});
    } else if (roll < 0.84) {
      const from = pick(r, accounts);
      const to = pick(r, accounts.filter((a) => a !== from && ccyOf(a) === ccyOf(from)));
      if (to) s.transfer(from, to, fmt(cents(r, 400)), date, r() < 0.3 ? { feeAmount: "0.50" } : {});
    } else if (roll < 0.92 && expenses.length > 0) {
      const original = pick(r, expenses);
      const acct = original.accountId;
      const full = Number(original.accountAmount ?? original.amount);
      const part = Math.max(0.01, Math.round(full * r() * 100) / 100);
      const priceFull = Number(original.amount);
      const pricePart = Math.max(0.01, Math.round(priceFull * (part / full) * 100) / 100);
      s.tx({
        type: "REFUND",
        date: date > original.date ? date : original.date,
        accountId: acct,
        amount: pricePart.toFixed(2),
        currency: original.currency,
        accountAmount: original.accountAmount ? part.toFixed(2) : null,
        refundOfId: original.id,
        categoryId: original.categoryId,
        fx: original.fx ?? null,
      });
    } else {
      const acct = pick(r, accounts);
      s.tx({ type: "ADJUSTMENT", date, accountId: acct, amount: (r() < 0.5 ? "-" : "") + fmt(cents(r, 50)) });
    }
  }
  return s;
}

const sum = (xs: Iterable<Dec>) => [...xs].reduce((a, x) => a.plus(x), ZERO);

describe("ledger invariants over random ledgers", () => {
  const seeds = Array.from({ length: 150 }, (_, i) => 1000 + i * 7);

  it("every issue-free ledger: accounts and sources foot to the same total, in every currency", () => {
    for (const seed of seeds) {
      const ledger = generate(seed).build();
      expect(ledger.issues.filter((i) => i.code !== "CURRENCY_MISMATCH"), `seed ${seed}`).toEqual([]);
      const dates = ["2026-07-10", "2026-08-01", "2026-08-20", "2026-09-15", "2026-10-09"];
      replay(ledger, dates, (date, state) => {
        const snap = snapshotFromState(ledger, state, date);
        expect(sum(snap.accounts.map((a) => a.baseValue)).eq(snap.total), `accounts foot ${seed} ${date}`).toBe(true);
        expect(sum(snap.sources.map((x) => x.baseValue)).eq(snap.total), `sources foot ${seed} ${date}`).toBe(true);
        for (const x of snap.sources) {
          expect(sum(x.holdings.map((h) => h.baseValue)).eq(x.baseValue), `holdings foot ${seed} ${date} ${x.sourceId}`).toBe(true);
        }
        // native-currency conservation: per currency, accounts == sources
        const nativeByAccount = new Map<string, Dec>();
        for (const a of snap.accounts) nativeByAccount.set(a.currency, (nativeByAccount.get(a.currency) ?? ZERO).plus(a.balance));
        const nativeBySource = new Map<string, Dec>();
        for (const x of snap.sources) for (const h of x.holdings) nativeBySource.set(h.currency, (nativeBySource.get(h.currency) ?? ZERO).plus(h.amount));
        for (const [ccy, amount] of nativeByAccount) {
          expect((nativeBySource.get(ccy) ?? ZERO).eq(amount), `native ${ccy} ${seed} ${date}`).toBe(true);
        }
      });
    }
  });

  it("each transaction's postings reconcile to its metrics and to the real account movement", () => {
    for (const seed of seeds) {
      const ledger = generate(seed).build();
      for (const r of ledger.txs) {
        const m = r.metrics;
        const impact = m.openingBase.plus(m.incomeBase).minus(m.expenseBase).minus(m.fxLossBase).minus(m.feeBase).plus(m.adjustmentBase);
        const posted = sum(ledger.postings.filter((p) => p.txId === r.tx.id).map((p) => p.base));
        expect(posted.eq(impact), `base ${seed} ${r.tx.type} ${r.tx.id}`).toBe(true);

        const byAccount = new Map<string, Dec>();
        for (const p of ledger.postings.filter((q) => q.txId === r.tx.id)) byAccount.set(p.accountId, (byAccount.get(p.accountId) ?? ZERO).plus(p.amount));
        if (r.tx.type === "EXPENSE") {
          expect(byAccount.get(r.tx.accountId)!.eq(dec(r.tx.accountAmount ?? r.tx.amount).neg()), `debit ${seed} ${r.tx.id}`).toBe(true);
        }
        if (r.tx.type === "TRANSFER" || r.tx.type === "EXCHANGE") {
          expect(byAccount.get(r.tx.accountId)!.eq(r.out.plus(r.fee).neg()), `out ${seed} ${r.tx.id}`).toBe(true);
          expect(byAccount.get(r.tx.toAccountId!)!.eq(r.into), `in ${seed} ${r.tx.id}`).toBe(true);
        }
        // attribution parts always add up to the principal
        if (r.tx.type === "EXPENSE") expect(sum(r.parts.map((p) => p.amount)).eq(r.out), `parts ${seed} ${r.tx.id}`).toBe(true);
      }
    }
  });

  it("period statistics foot: per-source, per-category and per-account views sum to the totals", () => {
    for (const seed of seeds) {
      const ledger = generate(seed).build();
      const stats = periodStats(ledger, { from: "2026-07-01", to: "2026-12-31" });
      expect(sum(stats.incomeBySource.values()).eq(stats.income), `income ${seed}`).toBe(true);
      expect(sum(stats.spentBySource.values()).eq(stats.spent), `spentBySource ${seed}`).toBe(true);
      expect(sum(stats.spentByCategory.values()).eq(stats.spent), `spentByCategory ${seed}`).toBe(true);
      expect(sum(stats.spentByAccount.values()).eq(stats.spent), `spentByAccount ${seed}`).toBe(true);
      expect(sum(stats.feesBySource.values()).eq(stats.fees), `fees ${seed}`).toBe(true);
      expect(stats.netSavings.eq(stats.income.minus(stats.spent).minus(stats.fees))).toBe(true);
      expect(sum(stats.netSavingsBySource.values()).eq(stats.netSavings), `net ${seed}`).toBe(true);
    }
  });

  it("is independent of the order the rows are supplied in (back-dating & edits are safe)", () => {
    for (const seed of seeds.slice(0, 60)) {
      const s = generate(seed);
      const forward = s.build();
      const r = rng(seed);
      s.txs.sort(() => r() - 0.5);
      const shuffled = s.build();
      const sig = (l: Ledger) => l.postings.map((p) => `${p.txId}|${p.accountId}|${p.sourceId}|${p.amount.toFixed(2)}|${p.base.toFixed(2)}`).join("\n");
      expect(sig(shuffled), `seed ${seed}`).toBe(sig(forward));
    }
  });
});

describe("wealth reconciliation", () => {
  it("with constant rates, wealth changes ONLY by recorded flows (no phantom FX savings)", () => {
    for (let k = 0; k < 120; k += 1) {
      const seed = 5000 + k * 13;
      const ledger = generate(seed, { exactRates: true }).build();
      const r = rng(seed);
      const a = addDays("2026-07-01", Math.floor(r() * 60));
      const b = addDays(a, 1 + Math.floor(r() * 60));
      const rec = reconcile(ledger, { from: a, to: b }, { cap: b });
      expect(rec.revaluation.isZero(), `seed ${seed} ${a}..${b} reval=${rec.revaluation.toFixed(4)}`).toBe(true);
      expect(rec.ratesMoved).toBe(false);
      const explained = rec.opening.plus(rec.income).minus(rec.spent).minus(rec.fees).minus(rec.conversionLoss).plus(rec.adjustments);
      expect(rec.change.eq(explained)).toBe(true);
    }
  });

  it("a rate move on money already held is revaluation only: it changes wealth but not savings", () => {
    const s = new Scenario().account("usd", "USD").source("A").rate("USD", "AZN", "1.70", "2026-01-01");
    s.income("A", "usd", "1000.00", "2026-10-01", { fx: { USD: "1.70" } });
    s.rate("USD", "AZN", "1.75", "2026-10-05");
    s.rate("USD", "AZN", "1.65", "2026-10-08");
    const ledger = s.build();
    const wealth = (d: string) => snapshotAt(ledger, d).total.toFixed(2);
    expect(wealth("2026-10-04")).toBe("1700.00");
    expect(wealth("2026-10-05")).toBe("1750.00");
    expect(wealth("2026-10-08")).toBe("1650.00");
    const rec = reconcile(ledger, { from: "2026-10-01", to: "2026-10-31" }, { cap: "2026-10-31" });
    expect(rec.netSavings.toFixed(2)).toBe("1700.00"); // the salary, valued when it arrived
    expect(rec.endWealth.toFixed(2)).toBe("1650.00");
    expect(rec.revaluation.toFixed(2)).toBe("-50.00"); // 1000 USD * (1.65 - 1.70)
    const mid = reconcile(ledger, { from: "2026-10-05", to: "2026-10-05" }, { cap: "2026-10-31" });
    expect(mid.netSavings.toFixed(2)).toBe("0.00");
    expect(mid.revaluation.toFixed(2)).toBe("50.00");
  });
});
