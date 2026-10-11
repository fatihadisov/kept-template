import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { NeedsConfirmation, ValidationError } from "@/server/errors";
import { loadAppData } from "@/server/load";
import { createAccount, deleteAccount, setAccountArchived, updateAccount } from "@/server/services/accounts";
import { exportBackup, restoreBackup } from "@/server/services/backup";
import { createCategory, deleteCategory, setCategoryArchived } from "@/server/services/catalog";
import { allocateToGoal, createGoal, setGoalArchived } from "@/server/services/goals";
import { createIncomeSource, deleteIncomeSource } from "@/server/services/income";
import { addRate } from "@/server/services/rates";
import { createRecurring, markRecurringPaid, skipOccurrence } from "@/server/services/recurring";
import { setStrategy, updateSettings } from "@/server/services/settings";
import {
  createTransaction,
  deleteTransaction,
  duplicateTransaction,
  updateTransaction,
} from "@/server/services/transactions";
import { expectedPayments } from "@/lib/finance/income";
import { buildLedger } from "@/lib/finance/ledger";
import { ledgerInputOf, streamsOf } from "@/server/load";
import { snapshotAt } from "@/lib/finance/queries";
import { periodStats } from "@/lib/finance/stats";
import { balanceOf, onPostgres, seedBasics, snapshot, sourceValue, tempDb, type TempDb } from "./helpers";

let t: TempDb;
beforeAll(async () => {
  t = await tempDb("services");
});
afterAll(async () => {
  await t.dispose();
});

describe("a fresh database", () => {
  it("is migrated and seeded with settings, the 'Existing funds' source and 12 default categories", async () => {
    const data = await loadAppData(t.db);
    expect(data.settings.baseCurrency).toBe("AZN");
    expect(data.settings.timezone).toBe("Asia/Baku");
    expect(data.settings.activeStrategy).toBe("SAVE_ALL"); // the default strategy
    expect(data.sources.filter((s) => s.isSystem).map((s) => s.name)).toEqual(["Existing funds"]);
    expect(data.categories.map((c) => c.name)).toEqual([
      "Food & Groceries",
      "Restaurants & Cafes",
      "Transport",
      "Car & Maintenance",
      "Shopping",
      "Entertainment",
      "Travel",
      "Rent & Utilities",
      "Health & Fitness",
      "Subscriptions",
      "Family & Gifts",
      "Other",
    ]);
  });

  // reads the SQLite file directly; the Postgres runner records the same thing and is covered by the other tests
  it.skipIf(onPostgres)("records every migration in Prisma's own table, so the Prisma CLI accepts the database", () => {
    const raw = new Database(t.file as string, { readonly: true });
    const rows = raw.prepare("SELECT migration_name, checksum, finished_at FROM _prisma_migrations").all() as { migration_name: string; checksum: string; finished_at: string }[];
    raw.close();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].migration_name).toMatch(/_init$/);
    expect(rows[0].checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].finished_at).toBeTruthy();
  });
});

describe("accounts and opening balances", () => {
  it("a starting balance is existing funds, not income", async () => {
    const local = await tempDb("opening");
    try {
      await addRate(local.db, { from: "USD", to: "AZN", rate: "1.7", effectiveFrom: "2026-01-01" });
      const usd = await createAccount(local.db, { name: "USD card", type: "CARD", currency: "USD", openingBalance: "1,000.50", openingDate: "2026-06-01", openingKind: "PREVIOUS_SAVINGS" });
      const { data, ledger, snap } = await snapshot(local.db, "2026-10-09");
      const opening = data.transactions.filter((x) => x.type === "OPENING");
      expect(opening).toHaveLength(1);
      expect(opening[0]).toMatchObject({ amount: "1000.50", accountId: usd.id, subtype: "PREVIOUS_SAVINGS", date: "2026-06-01" });
      expect(snap.total.toFixed(2)).toBe("1700.85");
      const stats = periodStats(ledger, { from: "2026-01-01", to: "2026-12-31" });
      expect(stats.income.toFixed(2)).toBe("0.00");
      expect(stats.opening.toFixed(2)).toBe("1700.85");
      expect(stats.netSavings.toFixed(2)).toBe("0.00");
    } finally {
      await local.dispose();
    }
  });

  it("changing the starting balance later (after other entries exist) changes every total", async () => {
    const local = await tempDb("edit-opening");
    try {
      const acct = await createAccount(local.db, { name: "Savings", type: "SAVINGS", currency: "AZN", openingBalance: "10000", openingDate: "2026-06-01", openingKind: "PREVIOUS_SAVINGS" });
      await createTransaction(local.db, { type: "EXPENSE", date: "2026-10-01", accountId: acct.id, amount: "100" });
      const before = await snapshot(local.db, "2026-10-09");
      expect(balanceOf(before.snap, acct.id)).toBe("9900.00");
      expect(before.snap.total.toFixed(2)).toBe("9900.00");

      // "I had more saved than I told it": raise the starting balance
      await updateAccount(local.db, acct.id, { name: "Savings", type: "SAVINGS", currency: "AZN", openingBalance: "12000", openingKind: "PREVIOUS_SAVINGS" });
      const after = await snapshot(local.db, "2026-10-09");
      expect(balanceOf(after.snap, acct.id)).toBe("11900.00");
      expect(after.snap.total.toFixed(2)).toBe("11900.00");
      expect(sourceValue(after.snap, after.data.sources.find((x) => x.isSystem)!.id)).toBe("11900.00"); // "Existing funds" follows
      const stats = periodStats(after.ledger, { from: "2026-01-01", to: "2026-12-31" });
      expect(stats.opening.toFixed(2)).toBe("12000.00");
      expect(stats.spent.toFixed(2)).toBe("100.00");
      expect(stats.income.toFixed(2)).toBe("0.00");
      expect(after.data.transactions.filter((x) => x.type === "OPENING")).toHaveLength(1); // edited in place, not duplicated

      // and lowering it again, and clearing it
      await updateAccount(local.db, acct.id, { name: "Savings", type: "SAVINGS", currency: "AZN", openingBalance: "9000", openingKind: "PREVIOUS_SAVINGS" });
      expect(balanceOf((await snapshot(local.db, "2026-10-09")).snap, acct.id)).toBe("8900.00");
    } finally {
      await local.dispose();
    }
  });

  it("a foreign-currency balance needs a rate to be valued, and offers to set it", async () => {
    const local = await tempDb("norate");
    try {
      await expect(createAccount(local.db, { name: "USD", type: "CARD", currency: "USD", openingBalance: "100" })).rejects.toMatchObject({
        fieldErrors: { rateToBase: expect.stringContaining("rate") },
      });
      await createAccount(local.db, { name: "USD", type: "CARD", currency: "USD", openingBalance: "100", rateToBase: "1.7" });
      const data = await loadAppData(local.db);
      expect(data.rates).toHaveLength(1);
      expect(data.rates[0]).toMatchObject({ from: "USD", to: "AZN", rate: "1.7" });
    } finally {
      await local.dispose();
    }
  });

  it("rejects duplicates, protects history and supports archive / delete rules", async () => {
    const local = await tempDb("acct");
    try {
      const { aznCard, cashAzn } = await seedBasics(local.db);
      await expect(createAccount(local.db, { name: "azn card", type: "CARD", currency: "AZN" })).rejects.toBeInstanceOf(ValidationError);
      await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: aznCard, amount: "100", incomeSourceId: (await loadAppData(local.db)).sources.find((s) => s.name === "Salary B")!.id });
      await expect(updateAccount(local.db, aznCard, { name: "AZN card", type: "CARD", currency: "USD" })).rejects.toThrow(/currency can't change/);
      await expect(deleteAccount(local.db, aznCard)).rejects.toThrow(/Archive it instead/);
      await setAccountArchived(local.db, aznCard, true);
      await expect(
        createTransaction(local.db, { type: "EXPENSE", date: "2026-10-02", accountId: aznCard, amount: "5" }),
      ).rejects.toThrow(/archived/);
      await deleteAccount(local.db, cashAzn); // unused accounts can be deleted
      expect((await loadAppData(local.db)).accounts.some((a) => a.id === cashAzn)).toBe(false);
    } finally {
      await local.dispose();
    }
  });
});

describe("transactions: normalisation and validation", () => {
  let ids: Awaited<ReturnType<typeof seedBasics>>;
  let local: TempDb;
  beforeAll(async () => {
    local = await tempDb("tx");
    ids = await seedBasics(local.db);
    await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: ids.usdCard, amount: "1000", incomeSourceId: ids.a });
    await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "2000", incomeSourceId: ids.b });
  });
  afterAll(async () => local.dispose());

  it("parses typed amounts like '1 234,5' and stores exact fixed-decimal strings", async () => {
    const { id } = await createTransaction(local.db, { type: "EXPENSE", date: "2026-10-02", accountId: ids.aznCard, amount: "1 234,5" });
    const tx = (await loadAppData(local.db)).transactions.find((x) => x.id === id)!;
    expect(tx.amount).toBe("1234.50");
    expect(tx.currency).toBe("AZN");
    expect(tx.allocationMode).toBe("AUTO");
    await deleteTransaction(local.db, id, { confirm: true });
  });

  it("freezes the valuation rate on the entry", async () => {
    const { id } = await createTransaction(local.db, { type: "INCOME", date: "2026-10-03", accountId: ids.usdCard, amount: "10", incomeSourceId: ids.a });
    const tx = (await loadAppData(local.db)).transactions.find((x) => x.id === id)!;
    expect(tx.fx).toEqual({ USD: "1.7" });
  });

  it("rejects more decimals than the currency allows instead of rounding silently", async () => {
    await expect(createTransaction(local.db, { type: "EXPENSE", date: "2026-10-02", accountId: ids.aznCard, amount: "10.555" })).rejects.toMatchObject({
      fieldErrors: { amount: expect.stringContaining("decimal") },
    });
  });

  it("a split must add up to the account debit exactly", async () => {
    await expect(
      createTransaction(local.db, {
        type: "EXPENSE",
        date: "2026-10-02",
        accountId: ids.aznCard,
        amount: "300",
        attribution: { mode: "MANUAL", allocations: [{ sourceId: ids.a, amount: "200" }, { sourceId: ids.b, amount: "99.99" }] },
      }),
    ).rejects.toMatchObject({ fieldErrors: { attribution: expect.stringContaining("adds up to") } });
  });

  it("a 300 AZN purchase split 200/100 debits the card by exactly 300 and each salary by its share", async () => {
    const { id } = await createTransaction(local.db, {
      type: "EXPENSE",
      date: "2026-10-04",
      accountId: ids.aznCard,
      amount: "300",
      attribution: { mode: "MANUAL", allocations: [{ sourceId: ids.a, amount: "200" }, { sourceId: ids.b, amount: "100" }] },
    });
    const { snap, data } = await snapshot(local.db, "2026-10-09");
    expect(balanceOf(snap, ids.aznCard)).toBe("1700.00");
    const tx = data.transactions.find((x) => x.id === id)!;
    expect(tx.allocationMode).toBe("MANUAL");
    expect(tx.allocations.map((a) => a.amount).sort()).toEqual(["100.00", "200.00"]);
    await deleteTransaction(local.db, id, { confirm: true });
  });

  it("a USD price paid from an AZN card is converted with the configured rate when the charge isn't entered", async () => {
    const { id } = await createTransaction(local.db, { type: "EXPENSE", date: "2026-10-04", accountId: ids.aznCard, amount: "10", currency: "USD" });
    const tx = (await loadAppData(local.db)).transactions.find((x) => x.id === id)!;
    expect(tx).toMatchObject({ amount: "10.00", currency: "USD", accountAmount: "17.00" });
    expect(tx.fx).toEqual({ USD: "1.7" });
    await deleteTransaction(local.db, id, { confirm: true });
  });

  it("transfers must stay within one currency; exchanges across two", async () => {
    await expect(
      createTransaction(local.db, { type: "TRANSFER", date: "2026-10-04", accountId: ids.usdCard, toAccountId: ids.aznCard, amount: "10" }),
    ).rejects.toThrow(/Use Exchange/);
    await expect(
      createTransaction(local.db, { type: "EXCHANGE", date: "2026-10-04", accountId: ids.aznCard, toAccountId: ids.cashAzn, amount: "10", toAmount: "10" }),
    ).rejects.toThrow(/Use Transfer/);
    await expect(
      createTransaction(local.db, { type: "TRANSFER", date: "2026-10-04", accountId: ids.aznCard, toAccountId: ids.aznCard, amount: "10" }),
    ).rejects.toThrow(/different account/);
  });

  it("an exchange stores the effective rate (incl. the bank's spread) and the explicit fee separately", async () => {
    const { id } = await createTransaction(local.db, {
      type: "EXCHANGE",
      date: "2026-10-05",
      accountId: ids.usdCard,
      toAccountId: ids.cashAzn,
      amount: "100",
      toAmount: "169",
      feeFixed: "0.50",
      description: "ATM",
    });
    const tx = (await loadAppData(local.db)).transactions.find((x) => x.id === id)!;
    expect(tx).toMatchObject({ amount: "100.00", toAmount: "169.00", exchangeRate: "1.69", feeAmount: "0.50", feeFixed: "0.50" });
    expect(tx.fx).toEqual({ USD: "1.7" });
    const { snap } = await snapshot(local.db, "2026-10-09");
    expect(balanceOf(snap, ids.usdCard)).toBe("909.50"); // 1000 + 10 - 100 - 0.50
    expect(balanceOf(snap, ids.cashAzn)).toBe("169.00");
  });

  it("a wildly different conversion rate asks for confirmation before it is saved", async () => {
    const input = { type: "EXCHANGE" as const, date: "2026-10-05", accountId: ids.usdCard, toAccountId: ids.cashAzn, amount: "10", toAmount: "16.90" };
    await expect(createTransaction(local.db, input)).resolves.toBeTruthy(); // 1.69: fine
    const typo = { ...input, toAmount: "1.69" }; // 0.169: probably a missing digit
    await expect(createTransaction(local.db, typo)).rejects.toBeInstanceOf(NeedsConfirmation);
    await expect(createTransaction(local.db, typo, { confirm: true })).resolves.toBeTruthy();
  });

  it("refunds reverse the expense and can't exceed it", async () => {
    const exp = await createTransaction(local.db, { type: "EXPENSE", date: "2026-10-06", accountId: ids.aznCard, amount: "100", categoryId: (await loadAppData(local.db)).categories[4].id });
    await createTransaction(local.db, { type: "REFUND", date: "2026-10-07", accountId: ids.aznCard, amount: "40", refundOfId: exp.id });
    await expect(
      createTransaction(local.db, { type: "REFUND", date: "2026-10-07", accountId: ids.aznCard, amount: "70", refundOfId: exp.id }),
    ).rejects.toMatchObject({ fieldErrors: { amount: expect.stringContaining("exceed") } });
    const { data, ledger } = await snapshot(local.db, "2026-10-09");
    const refund = data.transactions.find((x) => x.type === "REFUND")!;
    expect(refund.categoryId).toBe(data.transactions.find((x) => x.id === exp.id)!.categoryId); // inherited
    const stats = periodStats(ledger, { from: "2026-10-06", to: "2026-10-07" });
    expect(stats.spent.toFixed(2)).toBe("60.00");
    expect(stats.income.toFixed(2)).toBe("0.00");
  });
});

describe("safety: balances can't silently go negative", () => {
  it("warns about an overdraft, and proceeds once the user confirms", async () => {
    const local = await tempDb("overdraft");
    try {
      const ids = await seedBasics(local.db);
      await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "100", incomeSourceId: ids.b });
      const big = { type: "EXPENSE" as const, date: "2026-10-02", accountId: ids.aznCard, amount: "150" };
      await expect(createTransaction(local.db, big)).rejects.toMatchObject({
        name: "NeedsConfirmation",
        warnings: [expect.objectContaining({ code: "OVERDRAFT", accountId: ids.aznCard })],
      });
      expect((await loadAppData(local.db)).transactions.filter((x) => x.type === "EXPENSE")).toHaveLength(0); // nothing was written
      await createTransaction(local.db, big, { confirm: true });
      expect(balanceOf((await snapshot(local.db, "2026-10-09")).snap, ids.aznCard)).toBe("-50.00");
    } finally {
      await local.dispose();
    }
  });

  it("deleting income that funded later spending is flagged too", async () => {
    const local = await tempDb("overdraft2");
    try {
      const ids = await seedBasics(local.db);
      const salary = await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "500", incomeSourceId: ids.b });
      await createTransaction(local.db, { type: "EXPENSE", date: "2026-10-02", accountId: ids.aznCard, amount: "200" });
      await expect(deleteTransaction(local.db, salary.id)).rejects.toBeInstanceOf(NeedsConfirmation);
      await expect(updateTransaction(local.db, salary.id, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "100", incomeSourceId: ids.b })).rejects.toBeInstanceOf(NeedsConfirmation);
      // an edit that keeps everything covered is silent
      await updateTransaction(local.db, salary.id, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "400", incomeSourceId: ids.b });
    } finally {
      await local.dispose();
    }
  });
});

describe("editing and deleting history keeps every number consistent", () => {
  it("recalculates balances, attribution and statistics, and writes an audit trail", async () => {
    const local = await tempDb("edit");
    try {
      const ids = await seedBasics(local.db);
      await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "2000", incomeSourceId: ids.b });
      const exp = await createTransaction(local.db, { type: "EXPENSE", date: "2026-10-05", accountId: ids.aznCard, amount: "300", description: "Shoes" });
      expect(balanceOf((await snapshot(local.db, "2026-10-09")).snap, ids.aznCard)).toBe("1700.00");

      // edit the amount, the date and the attribution
      await updateTransaction(local.db, exp.id, {
        type: "EXPENSE",
        date: "2026-09-20",
        accountId: ids.aznCard,
        amount: "450",
        description: "Shoes",
        attribution: { mode: "MANUAL", allocations: [{ sourceId: ids.a, amount: "150" }, { sourceId: ids.b, amount: "300" }] },
      }, { confirm: true });
      let s = await snapshot(local.db, "2026-10-09");
      expect(balanceOf(s.snap, ids.aznCard)).toBe("1550.00");
      expect(sourceValue(s.snap, ids.b)).toBe("1700.00");
      expect(sourceValue(s.snap, ids.a)).toBe("-150.00");
      expect(balanceOf(snapshotAt(s.ledger, "2026-09-25") && s.snap, ids.aznCard)).toBe("1550.00");
      expect(s.snap.total.toFixed(2)).toBe("1550.00");

      // the edit must not be able to change the type
      await expect(updateTransaction(local.db, exp.id, { type: "INCOME", date: "2026-09-20", accountId: ids.aznCard, amount: "1", incomeSourceId: ids.a })).rejects.toThrow(/type of an entry/);

      await deleteTransaction(local.db, exp.id);
      s = await snapshot(local.db, "2026-10-09");
      expect(balanceOf(s.snap, ids.aznCard)).toBe("2000.00");
      expect(sourceValue(s.snap, ids.a)).toBe("0.00");

      const log = await local.db.auditLog.findMany({ where: { entity: "Transaction" }, orderBy: { at: "asc" } });
      expect(log.map((l) => l.action)).toEqual(["CREATE", "CREATE", "UPDATE", "DELETE"]);
      const update = log[2];
      expect(JSON.parse(update.before!).amount).toBe("300.00");
      expect(JSON.parse(update.after!).amount).toBe("450.00");
    } finally {
      await local.dispose();
    }
  });

  it("duplicating an entry repeats it on a new date", async () => {
    const local = await tempDb("dup");
    try {
      const ids = await seedBasics(local.db);
      await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "500", incomeSourceId: ids.b });
      const cafe = await createTransaction(local.db, { type: "EXPENSE", date: "2026-10-02", accountId: ids.aznCard, amount: "4.50", description: "Coffee", tags: ["Daily"] });
      const copy = await duplicateTransaction(local.db, cafe.id, { date: "2026-10-03" });
      const { data } = await snapshot(local.db, "2026-10-09");
      const dup = data.transactions.find((x) => x.id === copy.id)!;
      expect(dup).toMatchObject({ date: "2026-10-03", amount: "4.50", description: "Coffee", tags: ["daily"] });
    } finally {
      await local.dispose();
    }
  });
});

describe("rates are effective-dated and never rewrite history", () => {
  it("a new default rate leaves stored entries untouched but changes today's valuation", async () => {
    const local = await tempDb("rates");
    try {
      const ids = await seedBasics(local.db);
      const salary = await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: ids.usdCard, amount: "1000", incomeSourceId: ids.a });
      const before = await snapshot(local.db, "2026-10-09");
      expect(before.snap.total.toFixed(2)).toBe("1700.00");

      await addRate(local.db, { from: "USD", to: "AZN", rate: "1.8", effectiveFrom: "2026-10-09" });
      const after = await snapshot(local.db, "2026-10-09");
      expect(after.snap.total.toFixed(2)).toBe("1800.00"); // valuation follows the rate...
      expect((await snapshot(local.db, "2026-10-08")).snap.total.toFixed(2)).toBe("1700.00"); // ...but not retroactively
      expect(periodStats(after.ledger, { from: "2026-10-01", to: "2026-10-31" }).income.toFixed(2)).toBe("1700.00"); // salary stays valued as received
      expect(after.data.transactions.find((x) => x.id === salary.id)!.fx).toEqual({ USD: "1.7" });
    } finally {
      await local.dispose();
    }
  });

  it("can move both directions together, as exact reciprocals, without duplicating rows on a re-save", async () => {
    const local = await tempDb("inverse");
    try {
      const ids = await seedBasics(local.db);
      await addRate(local.db, { from: "USD", to: "AZN", rate: "1.6", effectiveFrom: "2026-10-09", alsoInverse: true });
      const rows = await local.db.exchangeRate.findMany({ where: { effectiveFrom: "2026-10-09", accountId: null } });
      const byPair = Object.fromEntries(rows.map((r) => [`${r.fromCurrency}>${r.toCurrency}`, r.rate]));
      expect(byPair["USD>AZN"]).toBe("1.6");
      expect(byPair["AZN>USD"]).toBe("0.625"); // 1 / 1.6, exactly
      // correcting the same day updates both rather than adding more
      await addRate(local.db, { from: "USD", to: "AZN", rate: "1.7", effectiveFrom: "2026-10-09", alsoInverse: true });
      const again = await local.db.exchangeRate.findMany({ where: { effectiveFrom: "2026-10-09", accountId: null } });
      expect(again).toHaveLength(2);
      expect(again.find((r) => r.fromCurrency === "AZN")!.rate).toBe("0.5882352941"); // stored to 10 decimals
      // a different buy/sell rate stays possible: leaving it off touches only the one direction
      await addRate(local.db, { from: "USD", to: "AZN", rate: "1.75", effectiveFrom: "2026-10-10" });
      expect(await local.db.exchangeRate.count({ where: { effectiveFrom: "2026-10-10" } })).toBe(1);
      // a card's own rate is one-directional by nature: no inverse is written for it
      await addRate(local.db, { from: "USD", to: "AZN", rate: "1.69", effectiveFrom: "2026-10-11", accountId: ids.usdCard, alsoInverse: true });
      expect(await local.db.exchangeRate.count({ where: { effectiveFrom: "2026-10-11" } })).toBe(1);
    } finally {
      await local.dispose();
    }
  });

  it("without a rate, a foreign-currency entry is refused with a helpful message", async () => {
    const local = await tempDb("norate2");
    try {
      const usd = (await createAccount(local.db, { name: "USD", type: "CARD", currency: "USD" })).id;
      const src = (await createIncomeSource(local.db, { name: "Pay", currency: "USD", scheduleType: "NONE" })).id;
      await expect(createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: usd, amount: "10", incomeSourceId: src })).rejects.toThrow(/exchange rate/);
      await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: usd, amount: "10", incomeSourceId: src, rate: "1.7" }); // explicit override works
    } finally {
      await local.dispose();
    }
  });

  it("a card can have its own preferred rate that wins over the global one for conversions", async () => {
    const local = await tempDb("cardrate");
    try {
      const ids = await seedBasics(local.db);
      await addRate(local.db, { from: "USD", to: "AZN", rate: "1.69", effectiveFrom: "2026-01-01", accountId: ids.usdCard });
      const data = await loadAppData(local.db);
      const ledger = buildLedger(ledgerInputOf(data));
      expect(ledger.rates.rate("USD", "AZN", "2026-10-01", { accountId: ids.usdCard })!.rate.toFixed()).toBe("1.69");
      expect(ledger.rates.rate("USD", "AZN", "2026-10-01")!.rate.toFixed()).toBe("1.7");
      expect(ledger.rates.rate("USD", "AZN", "2026-10-01", { accountId: ids.cashUsd })!.rate.toFixed()).toBe("1.7");
    } finally {
      await local.dispose();
    }
  });
});

describe("income streams", () => {
  it("auto-detects which scheduled payment a receipt settles, supports partial payments, and protects history", async () => {
    const local = await tempDb("income");
    try {
      const ids = await seedBasics(local.db);
      // pay for the 5th, received late on the 8th, in two parts
      const p1 = await createTransaction(local.db, { type: "INCOME", date: "2026-10-08", accountId: ids.usdCard, amount: "600", incomeSourceId: ids.a, expectedDate: "2026-10-05" });
      const p2 = await createTransaction(local.db, { type: "INCOME", date: "2026-10-09", accountId: ids.usdCard, amount: "400", incomeSourceId: ids.a });
      const { data } = await snapshot(local.db, "2026-10-09");
      expect(data.transactions.find((x) => x.id === p1.id)!.expectedDate).toBe("2026-10-05");
      expect(data.transactions.find((x) => x.id === p2.id)!.expectedDate).toBe("2026-10-05"); // detected: October still has 400 to go
      const bonus = await createTransaction(local.db, { type: "INCOME", date: "2026-10-09", accountId: ids.usdCard, amount: "50", incomeSourceId: ids.a, expectedDate: null });
      expect((await loadAppData(local.db)).transactions.find((x) => x.id === bonus.id)!.expectedDate).toBeNull();
      await expect(deleteIncomeSource(local.db, ids.a)).rejects.toThrow(/Pause it instead/);
    } finally {
      await local.dispose();
    }
  });
});

describe("a starting balance already contains the pay that came before it", () => {
  it("pay dates up to the receiving account's opening date are not expected again", async () => {
    const local = await tempDb("covered");
    try {
      await addRate(local.db, { from: "USD", to: "AZN", rate: "1.70", effectiveFrom: "2026-01-01" });
      // you set up on 9 Oct with $5,000 on the card; the 5 Oct salary is part of that
      const usd = (await createAccount(local.db, { name: "USD card", type: "CARD", currency: "USD", openingBalance: "5000", openingDate: "2026-10-09" })).id;
      const other = (await createAccount(local.db, { name: "Other card", type: "CARD", currency: "USD" })).id;
      const covered = (await createIncomeSource(local.db, { name: "Covered", currency: "USD", expectedAmount: "1500", scheduleType: "MONTHLY", scheduleDays: [5], destinationAccountId: usd })).id;
      const open = (await createIncomeSource(local.db, { name: "Not covered", currency: "USD", expectedAmount: "1500", scheduleType: "MONTHLY", scheduleDays: [5], destinationAccountId: other })).id;

      const data = await loadAppData(local.db);
      const ledger = buildLedger(ledgerInputOf(data));
      const streams = streamsOf(data);
      const range = { from: "2026-10-01", to: "2026-11-30" };
      const rows = (id: string) => expectedPayments(ledger, streams.find((s) => s.id === id)!, range, "2026-10-09").map((p) => [p.dueDate, p.status]);

      // the 5 Oct pay is inside the $5,000 already; the next one is 5 Nov
      expect(rows(covered)).toEqual([["2026-11-05", "upcoming"]]);
      // a salary into an account with no starting balance still shows the missed 5 Oct pay as overdue
      expect(rows(open)).toEqual([["2026-10-05", "overdue"], ["2026-11-05", "upcoming"]]);
    } finally {
      await local.dispose();
    }
  });
});

describe("categories", () => {
  it("can be created, renamed, archived — and are never deleted while in use", async () => {
    const local = await tempDb("cats");
    try {
      const ids = await seedBasics(local.db);
      const pets = await createCategory(local.db, { name: "Pets", icon: "paw-print", color: "#5FA67A", bucket: "WANTS" });
      await expect(createCategory(local.db, { name: "pets" })).rejects.toBeInstanceOf(ValidationError);
      await createTransaction(local.db, { type: "OPENING", date: "2026-10-01", accountId: ids.aznCard, amount: "100" });
      await createTransaction(local.db, { type: "EXPENSE", date: "2026-10-02", accountId: ids.aznCard, amount: "10", categoryId: pets.id });
      await expect(deleteCategory(local.db, pets.id)).rejects.toThrow(/Archive it instead/);
      await setCategoryArchived(local.db, pets.id, true);
      await expect(createTransaction(local.db, { type: "EXPENSE", date: "2026-10-02", accountId: ids.aznCard, amount: "10", categoryId: pets.id })).rejects.toThrow(/archived/);
    } finally {
      await local.dispose();
    }
  });
});

describe("10. goals reserve existing money without touching the balance", () => {
  it("allocations change 'available', never the total, and can't exceed what is unreserved", async () => {
    const local = await tempDb("goals");
    try {
      const ids = await seedBasics(local.db);
      await createTransaction(local.db, { type: "OPENING", date: "2026-01-01", accountId: ids.aznCard, amount: "15000" });
      const car = await createGoal(local.db, { name: "Car", targetAmount: "30000", currency: "AZN", targetDate: "2027-10-09", priority: 1 });
      const trip = await createGoal(local.db, { name: "Trip", targetAmount: "3000", currency: "AZN" });
      await allocateToGoal(local.db, { goalId: car.id, amount: "10000", date: "2026-10-09" });
      expect((await snapshot(local.db, "2026-10-09")).snap.total.toFixed(2)).toBe("15000.00");

      await expect(allocateToGoal(local.db, { goalId: trip.id, amount: "6000", date: "2026-10-09" })).rejects.toThrow(/Only ₼5,000.00/);
      await allocateToGoal(local.db, { goalId: trip.id, amount: "5000", date: "2026-10-09" });
      await expect(allocateToGoal(local.db, { goalId: trip.id, amount: "1", date: "2026-10-09" })).rejects.toThrow(/unreserved/);
      await allocateToGoal(local.db, { goalId: trip.id, amount: "-2000", date: "2026-10-09" }); // release
      await expect(allocateToGoal(local.db, { goalId: trip.id, amount: "-4000", date: "2026-10-09" })).rejects.toThrow(/set aside/);
      await setGoalArchived(local.db, car.id, true); // archiving releases the reservation
      await allocateToGoal(local.db, { goalId: trip.id, amount: "9000", date: "2026-10-09" }); // 15000 - 3000 reserved = 12000 free
    } finally {
      await local.dispose();
    }
  });
});

describe("recurring bills", () => {
  it("only deduct from balances once recorded as paid, once per occurrence", async () => {
    const local = await tempDb("recurring");
    try {
      const ids = await seedBasics(local.db);
      await createTransaction(local.db, { type: "OPENING", date: "2026-01-01", accountId: ids.aznCard, amount: "5000" });
      const rent = await createRecurring(local.db, {
        description: "Rent",
        amount: "800",
        currency: "AZN",
        accountId: ids.aznCard,
        frequency: "MONTHLY",
        interval: 1,
        dayOfMonth: 15,
        startDate: "2026-01-15",
      });
      expect(balanceOf((await snapshot(local.db, "2026-10-09")).snap, ids.aznCard)).toBe("5000.00"); // nothing deducted by scheduling
      await markRecurringPaid(local.db, rent.id, "2026-09-15");
      expect(balanceOf((await snapshot(local.db, "2026-10-09")).snap, ids.aznCard)).toBe("4200.00");
      await expect(markRecurringPaid(local.db, rent.id, "2026-09-15")).rejects.toThrow(/already recorded/);
      await expect(markRecurringPaid(local.db, rent.id, "2026-09-16")).rejects.toThrow(/scheduled date/);
      await skipOccurrence(local.db, rent.id, "2026-08-15");
      const paid = (await loadAppData(local.db)).transactions.find((x) => x.recurringId === rent.id)!;
      expect(paid).toMatchObject({ dueDate: "2026-09-15", date: "2026-09-15", amount: "800.00", description: "Rent" });
    } finally {
      await local.dispose();
    }
  });
});

describe("settings and strategies", () => {
  it("the reporting currency locks once data exists; strategies are switchable without touching transactions", async () => {
    const local = await tempDb("settings");
    try {
      await updateSettings(local.db, { baseCurrency: "USD" }); // allowed while empty
      expect((await loadAppData(local.db)).settings.baseCurrency).toBe("USD");
      await updateSettings(local.db, { baseCurrency: "AZN" });
      const acct = await createAccount(local.db, { name: "Cash", type: "CASH", currency: "AZN", openingBalance: "100" });
      await expect(updateSettings(local.db, { baseCurrency: "EUR" })).rejects.toThrow(/locked/);
      expect(acct.id).toBeTruthy();

      const before = JSON.stringify((await loadAppData(local.db)).transactions);
      await setStrategy(local.db, "PERCENT_TARGET", { PERCENT_TARGET: { percent: 35 } });
      await setStrategy(local.db, "FIXED_MONTHLY", { FIXED_MONTHLY: { amount: "3,000" } });
      await setStrategy(local.db, "SAVE_ALL");
      const data = await loadAppData(local.db);
      expect(data.settings.activeStrategy).toBe("SAVE_ALL");
      expect(data.settings.strategyConfig.PERCENT_TARGET.percent).toBe(35); // remembered
      expect(data.settings.strategyConfig.FIXED_MONTHLY.amount).toBe("3000");
      expect(JSON.stringify(data.transactions)).toBe(before); // no accounting change

      await setStrategy(local.db, "EMERGENCY_FIRST", { EMERGENCY_FIRST: { essentialMonthly: "1,500", months: 6 } });
      const goals = (await loadAppData(local.db)).goals;
      expect(goals.find((g) => g.kind === "EMERGENCY")).toMatchObject({ targetAmount: "9000.00", currency: "AZN" });
    } finally {
      await local.dispose();
    }
  });
});

describe("15. data survives a restart and can be restored from a backup", () => {
  it("persists across closing and reopening the database", async () => {
    const local = await tempDb("persist");
    try {
      const ids = await seedBasics(local.db);
      await createTransaction(local.db, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "2000", incomeSourceId: ids.b });
      const reopened = await local.reopen();
      const { snap } = await snapshot(reopened, "2026-10-09");
      expect(balanceOf(snap, ids.aznCard)).toBe("2000.00");
      expect((await loadAppData(reopened)).accounts).toHaveLength(4);
    } finally {
      await local.dispose();
    }
  });

  it("a backup restores accounts, streams, rates, goals, budgets, recurring bills, links and attribution exactly", async () => {
    const src = await tempDb("backup-src");
    const dst = await tempDb("backup-dst");
    try {
      const ids = await seedBasics(src.db);
      await createTransaction(src.db, { type: "OPENING", date: "2026-01-01", accountId: ids.aznCard, amount: "3000", subtype: "PREVIOUS_SAVINGS" });
      await createTransaction(src.db, { type: "INCOME", date: "2026-10-01", accountId: ids.usdCard, amount: "1000", incomeSourceId: ids.a });
      await createTransaction(src.db, { type: "INCOME", date: "2026-10-01", accountId: ids.aznCard, amount: "2000", incomeSourceId: ids.b });
      await createTransaction(src.db, { type: "EXCHANGE", date: "2026-10-02", accountId: ids.usdCard, toAccountId: ids.cashAzn, amount: "100", toAmount: "169", feeFixed: "0.5" });
      const exp = await createTransaction(src.db, {
        type: "EXPENSE", date: "2026-10-03", accountId: ids.aznCard, amount: "300",
        attribution: { mode: "MANUAL", allocations: [{ sourceId: ids.a, amount: "200" }, { sourceId: ids.b, amount: "100" }] },
      });
      await createTransaction(src.db, { type: "REFUND", date: "2026-10-04", accountId: ids.aznCard, amount: "50", refundOfId: exp.id });
      await addRate(src.db, { from: "USD", to: "AZN", rate: "1.69", effectiveFrom: "2026-01-01", accountId: ids.usdCard });
      const goal = await createGoal(src.db, { name: "Car", targetAmount: "30000", currency: "AZN" });
      await allocateToGoal(src.db, { goalId: goal.id, amount: "1000", date: "2026-10-09" });
      const rec = await createRecurring(src.db, { description: "Gym", amount: "50", currency: "AZN", accountId: ids.aznCard, frequency: "MONTHLY", interval: 1, startDate: "2026-01-10" });
      await markRecurringPaid(src.db, rec.id, "2026-10-10", { date: "2026-10-09" }, { confirm: true });
      await setStrategy(src.db, "BUDGET_50_30_20", { BUDGET_50_30_20: { needs: 55, wants: 25, savings: 20 } });

      const backup = await exportBackup(src.db);
      // survives the trip through a real JSON file
      const reloaded = JSON.parse(JSON.stringify(backup));
      const summary = await restoreBackup(dst.db, reloaded, dst.restoreOptions);
      expect(summary.transactions).toBe(7);
      // a SQLite file gets a safety copy of what was there before; the hosted database has no file to copy
      if (onPostgres) expect(summary.safetyCopy).toBeNull();
      else expect(summary.safetyCopy).toContain("before-restore");

      const a = await snapshot(src.db, "2026-10-09");
      const b = await snapshot(dst.db, "2026-10-09");
      expect(b.snap.total.toFixed(2)).toBe(a.snap.total.toFixed(2));
      for (const acc of a.snap.accounts) expect(b.snap.accounts.find((x) => x.accountId === acc.accountId)!.balance.toFixed(2)).toBe(acc.balance.toFixed(2));
      for (const s of a.snap.sources) expect(b.snap.sources.find((x) => x.sourceId === s.sourceId)!.baseValue.toFixed(2)).toBe(s.baseValue.toFixed(2));
      expect(JSON.stringify(b.data.transactions)).toBe(JSON.stringify(a.data.transactions)); // links, allocations, frozen rates
      expect(b.data.settings.strategyConfig.BUDGET_50_30_20).toEqual({ needs: 55, wants: 25, savings: 20 });
      expect(b.data.settings.activeStrategy).toBe("BUDGET_50_30_20");
      expect(b.data.rates).toHaveLength(a.data.rates.length);
      expect(b.data.goals[0].allocations).toHaveLength(1);
      expect(b.data.transactions.find((x) => x.type === "REFUND")!.refundOfId).toBe(exp.id);
      expect(b.ledger.issues).toEqual([]);
    } finally {
      await src.dispose();
      await dst.dispose();
    }
  });

  it("rejects files that aren't backups and leaves existing data untouched", async () => {
    const local = await tempDb("badbackup");
    try {
      const ids = await seedBasics(local.db);
      await createTransaction(local.db, { type: "OPENING", date: "2026-01-01", accountId: ids.aznCard, amount: "10" });
      await expect(restoreBackup(local.db, { hello: "world" })).rejects.toBeInstanceOf(ValidationError);
      const bad = await exportBackup(local.db);
      bad.tables.transactions[0] = { ...bad.tables.transactions[0], accountId: "does-not-exist" }; // dangling reference
      await expect(restoreBackup(local.db, JSON.parse(JSON.stringify(bad)))).rejects.toThrow();
      // the failed restore rolled back: the original data is still there
      expect(balanceOf((await snapshot(local.db, "2026-10-09")).snap, ids.aznCard)).toBe("10.00");
    } finally {
      await local.dispose();
    }
  });
});
