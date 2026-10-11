import { describe, expect, it } from "vitest";
import { dec, toStr } from "@/lib/finance/money";
import { detectOverdrafts, snapshotAt } from "@/lib/finance/queries";
import { CALENDAR_MONTHS, periodsBetween } from "@/lib/finance/periods";
import { periodSeries, periodStats, reconcile } from "@/lib/finance/stats";
import type { Snapshot } from "@/lib/finance/queries";
import { Scenario, standard } from "./helpers";

const money = (v: { toFixed(dp?: number): string }) => v.toFixed(2);
const bal = (snap: Snapshot, accountId: string) => money(snap.accounts.find((a) => a.accountId === accountId)!.balance);
const val = (snap: Snapshot, accountId: string) => money(snap.accounts.find((a) => a.accountId === accountId)!.baseValue);
const src = (snap: Snapshot, sourceId: string) => money(snap.sources.find((s) => s.sourceId === sourceId)!.baseValue);

describe("1. two independent salaries arrive in different accounts", () => {
  const s = standard();
  s.income("A", "usdCard", "1000.00", "2026-10-01");
  s.income("B", "aznCard", "2000.00", "2026-10-05");
  const ledger = s.build();
  const snap = snapshotAt(ledger, "2026-10-09");

  it("keeps account balances in their own currencies", () => {
    expect(bal(snap, "usdCard")).toBe("1000.00");
    expect(bal(snap, "aznCard")).toBe("2000.00");
    expect(val(snap, "usdCard")).toBe("1700.00");
  });

  it("tracks each salary independently", () => {
    expect(src(snap, "A")).toBe("1700.00");
    expect(src(snap, "B")).toBe("2000.00");
    expect(money(snap.total)).toBe("3700.00");
    const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
    expect(money(stats.income)).toBe("3700.00");
    expect(money(stats.incomeBySource.get("A")!)).toBe("1700.00");
    expect(money(stats.incomeBySource.get("B")!)).toBe("2000.00");
  });

  it("accounts and sources always foot to the same grand total", () => {
    const accountsTotal = snap.accounts.reduce((a, x) => a.plus(x.baseValue), dec(0));
    const sourcesTotal = snap.sources.reduce((a, x) => a.plus(x.baseValue), dec(0));
    expect(accountsTotal.eq(snap.total)).toBe(true);
    expect(sourcesTotal.eq(snap.total)).toBe(true);
  });
});

describe("2. expenses reduce both the wallet and the attributed income balance", () => {
  it("AUTO attribution follows the money in the paying account", () => {
    const s = standard();
    s.income("A", "usdCard", "1000.00", "2026-10-01");
    s.income("B", "aznCard", "2000.00", "2026-10-05");
    s.expense("aznCard", "300.00", "2026-10-06", { categoryId: "food" });
    const ledger = s.build();
    const snap = snapshotAt(ledger, "2026-10-09");
    expect(bal(snap, "aznCard")).toBe("1700.00");
    expect(src(snap, "B")).toBe("1700.00");
    expect(src(snap, "A")).toBe("1700.00"); // untouched
    const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
    expect(money(stats.spentBySource.get("B")!)).toBe("300.00");
    expect(stats.spentBySource.has("A")).toBe(false);
  });

  it("MANUAL attribution can charge a different salary than the card's funds", () => {
    const s = standard();
    s.income("A", "usdCard", "1000.00", "2026-10-01");
    s.income("B", "aznCard", "2000.00", "2026-10-05");
    s.expense("aznCard", "300.00", "2026-10-06", s.split({ A: "200.00", B: "100.00" }));
    const snap = snapshotAt(s.build(), "2026-10-09");
    expect(bal(snap, "aznCard")).toBe("1700.00"); // the card is debited exactly 300
    expect(src(snap, "A")).toBe("1500.00"); // 1700 - 200
    expect(src(snap, "B")).toBe("1900.00"); // 2000 - 100
    expect(money(snap.total)).toBe("3400.00");
  });
});

describe("3-5. converting USD to AZN cash with a custom rate", () => {
  const s = standard();
  s.income("A", "usdCard", "1000.00", "2026-10-01");
  // bank gave 169 AZN for 100 USD (market 1.70) and charged 0.50 USD commission separately
  s.exchange("usdCard", "cashAzn", "100.00", "169.00", "2026-10-07", { feeAmount: "0.50", fx: { USD: "1.70" } });
  s.expense("cashAzn", "20.00", "2026-10-08", { categoryId: "coffee" });
  const ledger = s.build();
  const snap = snapshotAt(ledger, "2026-10-09");
  const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });

  it("debits the USD card by amount + fee and credits the AZN cash with what was received", () => {
    expect(bal(snap, "usdCard")).toBe("899.50");
    expect(bal(snap, "cashAzn")).toBe("149.00"); // 169 received - 20 spent
  });

  it("4. a cash expense reduces the physical cash balance and keeps the original source", () => {
    expect(stats.spentBySource.get("A")!.toFixed(2)).toBe("20.00");
    expect(stats.spentBySource.has("B")).toBe(false);
  });

  it("5. the conversion itself is not an expense; its costs are reported separately", () => {
    expect(money(stats.spent)).toBe("20.00"); // only the coffee
    expect(stats.spentByCategory.get("coffee")!.toFixed(2)).toBe("20.00");
    expect(money(stats.fees)).toBe("0.85"); // 0.50 USD at 1.70
    expect(money(stats.conversionLoss)).toBe("1.00"); // spread vs 1.70: 170 given, 169 received
    expect(money(stats.netSavings)).toBe("1679.15"); // 1700 income - 20 spent - 0.85 fee
  });

  it("total wealth only fell by the fee and the spread (and the 20 spent)", () => {
    // 899.5 USD * 1.7 = 1529.15 + 149 cash = 1678.15
    expect(money(snap.total)).toBe("1678.15");
    const rec = reconcile(ledger, { from: "2026-10-01", to: "2026-10-31" }, { cap: "2026-10-09" });
    expect(money(rec.change)).toBe("1678.15");
    expect(money(rec.revaluation)).toBe("0.00");
    expect(rec.ratesMoved).toBe(false);
  });
});

describe("AUTO attribution keeps the original income source through conversions and transfers", () => {
  it("cash bought with A's USD is A's money; mixed cash is split pro rata", () => {
    const s = standard();
    s.income("A", "usdCard", "1000.00", "2026-10-01");
    s.income("B", "aznCard", "2000.00", "2026-10-01");
    s.exchange("usdCard", "cashAzn", "100.00", "170.00", "2026-10-02"); // 170 AZN of A's money
    s.transfer("aznCard", "cashAzn", "30.00", "2026-10-03"); // 30 AZN of B's money
    s.expense("cashAzn", "100.00", "2026-10-04"); // 100 out of 200 in cash: 170:30
    const ledger = s.build();
    const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
    expect(money(stats.spentBySource.get("A")!)).toBe("85.00");
    expect(money(stats.spentBySource.get("B")!)).toBe("15.00");
    const snap = snapshotAt(ledger, "2026-10-09");
    expect(bal(snap, "cashAzn")).toBe("100.00");
  });
});

describe("6. an internal transfer does not increase total wealth", () => {
  it("leaves the total unchanged and keeps the funding source", () => {
    const s = standard();
    s.income("B", "aznCard", "2000.00", "2026-10-01");
    const before = snapshotAt(s.build(), "2026-10-02");
    s.transfer("aznCard", "cashAzn", "500.00", "2026-10-03");
    const ledger = s.build();
    const after = snapshotAt(ledger, "2026-10-04");
    expect(after.total.eq(before.total)).toBe(true);
    expect(bal(after, "aznCard")).toBe("1500.00");
    expect(bal(after, "cashAzn")).toBe("500.00");
    expect(src(after, "B")).toBe("2000.00");
    const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
    expect(money(stats.spent)).toBe("0.00");
    expect(money(stats.income)).toBe("2000.00");
  });

  it("a transfer fee is a cost, never extra wealth", () => {
    const s = standard();
    s.income("B", "aznCard", "2000.00", "2026-10-01");
    s.transfer("aznCard", "cashAzn", "500.00", "2026-10-03", { feeAmount: "1.50" });
    const ledger = s.build();
    const snap = snapshotAt(ledger, "2026-10-04");
    expect(money(snap.total)).toBe("1998.50");
    expect(bal(snap, "aznCard")).toBe("1498.50");
    expect(money(periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" }).fees)).toBe("1.50");
  });
});

describe("7-8. exchange rates: history is frozen, current valuation follows the rate", () => {
  const build = () => {
    const s = standard();
    s.income("A", "usdCard", "1000.00", "2026-10-01", { fx: { USD: "1.70" } });
    s.exchange("usdCard", "cashAzn", "100.00", "169.00", "2026-10-02", { fx: { USD: "1.70" } });
    // the user changes today's default rate on Oct 10
    s.rate("USD", "AZN", "1.80", "2026-10-10");
    return s.build();
  };

  it("7. changing the default rate does not alter stored transactions", () => {
    const ledger = build();
    const income = ledger.txs.find((t) => t.tx.type === "INCOME")!;
    const exch = ledger.txs.find((t) => t.tx.type === "EXCHANGE")!;
    expect(money(income.metrics.incomeBase)).toBe("1700.00");
    expect(money(exch.metrics.fxLossBase)).toBe("1.00");
    const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
    expect(money(stats.income)).toBe("1700.00");
    // and the balance as it stood before the change is untouched
    expect(money(snapshotAt(ledger, "2026-10-09").total)).toBe("1699.00"); // 900 USD * 1.70 + 169 AZN
    expect(money(snapshotAt(ledger, "2026-10-09").accounts.find((a) => a.accountId === "usdCard")!.baseValue)).toBe("1530.00");
  });

  it("an un-frozen transaction also keeps the rate that was effective on its own date", () => {
    const s = standard();
    s.income("A", "usdCard", "1000.00", "2026-10-01"); // no fx snapshot
    s.rate("USD", "AZN", "1.80", "2026-10-10");
    const l = s.build();
    expect(money(l.txs[0].metrics.incomeBase)).toBe("1700.00");
  });

  it("8. the current AZN equivalent of USD balances follows the valuation rate", () => {
    const ledger = build();
    const before = snapshotAt(ledger, "2026-10-09");
    const after = snapshotAt(ledger, "2026-10-10");
    // 899... usdCard holds 900 USD after the exchange: 900 * 1.7 vs 900 * 1.8
    expect(bal(before, "usdCard")).toBe("900.00");
    expect(val(before, "usdCard")).toBe("1530.00");
    expect(val(after, "usdCard")).toBe("1620.00");
    expect(after.total.gt(before.total)).toBe(true);
  });

  it("the change shows up as revaluation, never as income or savings", () => {
    const ledger = build();
    const rec = reconcile(ledger, { from: "2026-10-10", to: "2026-10-10" }, { cap: "2026-10-10" });
    expect(money(rec.netSavings)).toBe("0.00");
    expect(money(rec.income)).toBe("0.00");
    expect(money(rec.change)).toBe("90.00"); // 900 USD * 0.10
    expect(money(rec.revaluation)).toBe("90.00");
    expect(rec.ratesMoved).toBe(true);
  });
});

describe("9. previous savings can be entered without recording fictional salary", () => {
  it("opening balances are existing funds, not income", () => {
    const s = standard();
    s.opening("aznCard", "5000.00", "2026-09-01");
    s.opening("usdCard", "1000.00", "2026-09-01");
    const ledger = s.build();
    const snap = snapshotAt(ledger, "2026-09-02");
    expect(money(snap.total)).toBe("6700.00");
    expect(src(snap, ledger.openingSourceId)).toBe("6700.00");
    expect(src(snap, "A")).toBe("0.00");
    const stats = periodStats(ledger, { from: "2026-09-01", to: "2026-09-30" });
    expect(money(stats.income)).toBe("0.00");
    expect(money(stats.opening)).toBe("6700.00");
    expect(money(stats.netSavings)).toBe("0.00");
  });
});

describe("11. back-dated entries recalculate history accurately", () => {
  it("a back-dated expense changes later balances but not earlier ones", () => {
    const s = standard();
    s.income("B", "aznCard", "2000.00", "2026-10-01");
    s.expense("aznCard", "100.00", "2026-10-06");
    const sBefore = s.build();
    expect(bal(snapshotAt(sBefore, "2026-10-03"), "aznCard")).toBe("2000.00");
    // entered later (createdAt is later) but dated 2 Oct
    s.expense("aznCard", "250.00", "2026-10-02");
    const l = s.build();
    expect(bal(snapshotAt(l, "2026-10-01"), "aznCard")).toBe("2000.00");
    expect(bal(snapshotAt(l, "2026-10-02"), "aznCard")).toBe("1750.00");
    expect(bal(snapshotAt(l, "2026-10-03"), "aznCard")).toBe("1750.00");
    expect(bal(snapshotAt(l, "2026-10-09"), "aznCard")).toBe("1650.00");
  });

  it("the ledger does not depend on the order the rows arrive in", () => {
    const s = standard();
    s.opening("aznCard", "1000.00", "2026-09-01");
    s.income("A", "usdCard", "1000.00", "2026-10-01");
    s.income("B", "aznCard", "2000.00", "2026-10-03");
    s.exchange("usdCard", "cashAzn", "100.00", "169.00", "2026-10-04");
    s.expense("cashAzn", "30.00", "2026-10-05");
    s.expense("aznCard", "500.00", "2026-10-06");
    const forward = s.build();
    s.txs.reverse();
    const reversed = s.build();
    const sig = (l: typeof forward) => l.postings.map((p) => `${p.txId}|${p.accountId}|${p.sourceId}|${p.amount.toFixed(2)}|${p.base.toFixed(2)}`);
    expect(sig(reversed)).toEqual(sig(forward));
  });
});

describe("12-13. monthly savings are not total savings, and unspent money carries forward", () => {
  const s = standard();
  s.opening("cashAzn", "4000.00", "2026-08-31"); // previous savings
  s.income("B", "aznCard", "3000.00", "2026-09-05");
  s.expense("aznCard", "2000.00", "2026-09-10");
  s.income("B", "aznCard", "3000.00", "2026-10-05");
  s.expense("aznCard", "2500.00", "2026-10-12");
  const ledger = s.build();
  const periods = periodsBetween("2026-09-01", "2026-10-31", CALENDAR_MONTHS);
  const [sep, oct] = periodSeries(ledger, periods, "2026-10-31");

  it("monthly net savings only counts that month", () => {
    expect(money(sep.stats.netSavings)).toBe("1000.00");
    expect(money(oct.stats.netSavings)).toBe("500.00");
    expect(money(oct.stats.savingsRate!.times(100))).toBe("16.67");
  });

  it("total savings is the accumulated amount, including previous savings", () => {
    expect(money(oct.closing.total)).toBe("5500.00"); // 4000 + 1000 + 500
  });

  it("the remainder of September is carried into October per source", () => {
    expect(src(sep.closing, "B")).toBe("1000.00");
    expect(src(oct.carriedIn, "B")).toBe("1000.00");
    expect(src(oct.closing, "B")).toBe("1500.00");
    expect(src(oct.closing, ledger.openingSourceId)).toBe("4000.00");
  });
});

describe("14. split expenses reconcile exactly with the real account debit", () => {
  it("a 300 purchase split 200/100 debits exactly 300", () => {
    const s = standard();
    s.income("A", "aznCard", "1000.00", "2026-10-01");
    s.income("B", "aznCard", "1000.00", "2026-10-01");
    s.expense("aznCard", "300.00", "2026-10-02", s.split({ A: "200.00", B: "100.00" }));
    const ledger = s.build();
    const debit = ledger.postings.filter((p) => p.txType === "EXPENSE").reduce((a, p) => a.plus(p.amount), dec(0));
    expect(money(debit)).toBe("-300.00");
    expect(bal(snapshotAt(ledger, "2026-10-03"), "aznCard")).toBe("1700.00");
  });

  it("awkward splits (thirds, sub-cent shares, foreign currency) still sum to the cent", () => {
    const s = standard();
    s.source("C");
    s.income("A", "usdCard", "5000.00", "2026-10-01");
    s.expense("usdCard", "100.01", "2026-10-02", s.split({ A: "33.33", B: "33.33", C: "33.33" }));
    s.expense("usdCard", "77.77", "2026-10-03", s.split({ A: "1", B: "1", C: "1" }));
    const ledger = s.build();
    for (const r of ledger.txs.filter((t) => t.tx.type === "EXPENSE")) {
      const postingsSum = ledger.postings.filter((p) => p.txId === r.tx.id).reduce((a, p) => a.plus(p.amount), dec(0));
      expect(postingsSum.eq(dec(r.tx.amount).neg())).toBe(true);
      const baseSum = ledger.postings.filter((p) => p.txId === r.tx.id).reduce((a, p) => a.plus(p.base), dec(0));
      expect(baseSum.eq(r.metrics.expenseBase.plus(r.metrics.fxLossBase).neg())).toBe(true);
      const attributed = r.parts.reduce((a, p) => a.plus(p.amount), dec(0));
      expect(attributed.eq(dec(r.tx.amount))).toBe(true);
    }
    const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
    const bySource = [...stats.spentBySource.values()].reduce((a, v) => a.plus(v), dec(0));
    expect(bySource.eq(stats.spent)).toBe(true);
  });
});

describe("refunds reverse expenses and are not income", () => {
  it("reduces spending and restores the original attribution", () => {
    const s = standard();
    s.income("A", "aznCard", "1000.00", "2026-10-01");
    s.income("B", "aznCard", "1000.00", "2026-10-01");
    const original = s.expense("aznCard", "300.00", "2026-10-02", { categoryId: "shop", ...s.split({ A: "200.00", B: "100.00" }) });
    s.tx({ type: "REFUND", date: "2026-10-05", accountId: "aznCard", amount: "50.00", refundOfId: original.id, categoryId: "shop" });
    const ledger = s.build();
    const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
    expect(money(stats.income)).toBe("2000.00"); // the refund is NOT salary income
    expect(money(stats.spent)).toBe("250.00");
    expect(money(stats.refunds)).toBe("50.00");
    expect(stats.spentByCategory.get("shop")!.toFixed(2)).toBe("250.00");
    expect(money(stats.spentBySource.get("A")!)).toBe("166.67"); // 200 - 33.33
    expect(money(stats.spentBySource.get("B")!)).toBe("83.33"); // 100 - 16.67
    expect(bal(snapshotAt(ledger, "2026-10-06"), "aznCard")).toBe("1750.00");
  });
});

describe("foreign-currency purchases", () => {
  it("a USD price paid from an AZN card: cost is what was charged vs the rate-implied value", () => {
    const s = standard();
    s.income("B", "aznCard", "1000.00", "2026-10-01");
    // priced 50 USD, the bank debited 86.00 AZN; market value 85.00 -> 1.00 lost to the bank's rate
    s.expense("aznCard", "50.00", "2026-10-02", { currency: "USD", accountAmount: "86.00", fx: { USD: "1.70" } });
    const ledger = s.build();
    const r = ledger.txs.find((t) => t.tx.type === "EXPENSE")!;
    expect(money(r.metrics.expenseBase)).toBe("85.00");
    expect(money(r.metrics.fxLossBase)).toBe("1.00");
    expect(bal(snapshotAt(ledger, "2026-10-03"), "aznCard")).toBe("914.00");
    const rec = reconcile(ledger, { from: "2026-10-01", to: "2026-10-31" }, { cap: "2026-10-31" });
    expect(money(rec.change)).toBe("914.00");
    expect(money(rec.revaluation)).toBe("0.00");
  });

  it("an AZN price paid from a USD card", () => {
    const s = standard();
    s.income("A", "usdCard", "100.00", "2026-10-01", { fx: { USD: "1.70" } });
    s.expense("usdCard", "85.00", "2026-10-02", { currency: "AZN", accountAmount: "50.50", fx: { USD: "1.70" } });
    const ledger = s.build();
    const r = ledger.txs.find((t) => t.tx.type === "EXPENSE")!;
    expect(money(r.metrics.expenseBase)).toBe("85.00");
    expect(money(r.metrics.fxLossBase)).toBe("0.85"); // 50.50 * 1.70 = 85.85
    expect(bal(snapshotAt(ledger, "2026-10-03"), "usdCard")).toBe("49.50");
  });
});

describe("overdraft detection", () => {
  it("flags an account that goes negative at the end of a day", () => {
    const s = standard();
    s.income("B", "aznCard", "100.00", "2026-10-01");
    s.expense("aznCard", "150.00", "2026-10-02");
    const found = detectOverdrafts(s.build());
    expect(found).toHaveLength(1);
    expect(found[0].accountId).toBe("aznCard");
    expect(found[0].firstDate).toBe("2026-10-02");
    expect(money(found[0].lowest)).toBe("-50.00");
  });

  it("does not flag a same-day purchase that is covered by that day's salary", () => {
    const s = standard();
    s.expense("aznCard", "150.00", "2026-10-02", { time: "09:00" });
    s.income("B", "aznCard", "500.00", "2026-10-02", { time: "18:00" });
    expect(detectOverdrafts(s.build())).toHaveLength(0);
  });
});

describe("integrity", () => {
  it("skips (and reports) transactions that reference missing accounts instead of crashing", () => {
    const s = standard();
    s.income("A", "ghost", "100", "2026-10-01");
    const ledger = s.build();
    expect(ledger.txs).toHaveLength(0);
    expect(ledger.issues[0].code).toBe("UNKNOWN_ACCOUNT");
  });

  it("reports currencies that have no exchange rate instead of silently pricing them", () => {
    const s = new Scenario().account("eur", "EUR").source("A");
    s.income("A", "eur", "100", "2026-10-01");
    const ledger = s.build();
    expect([...ledger.missingRates]).toEqual(["EUR"]);
    expect(toStr(snapshotAt(ledger, "2026-10-02").total, 2)).toBe("0.00");
  });
});
