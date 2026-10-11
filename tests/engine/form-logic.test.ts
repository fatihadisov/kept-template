import { describe, expect, it } from "vitest";
import type { AppContextValue } from "@/components/app-provider";
import {
  blankState,
  buildInput,
  chargeQuote,
  evenSplit,
  exchangeQuote,
  splitRemainder,
  stateFromTx,
  type FormState,
} from "@/components/transaction/form-logic";
import { dec } from "@/lib/finance/money";
import type { LedgerTx } from "@/lib/finance/types";
import { txToInput } from "@/lib/tx-input";
import { parseDefaults } from "./form-defaults";

const app: AppContextValue = parseDefaults();

const withState = (type: FormState["type"], patch: Partial<FormState>): FormState => ({ ...blankState(type, app), ...patch });
const ok = (r: ReturnType<typeof buildInput>) => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.errors)}`);
  return r.input;
};

describe("add-form logic", () => {
  it("defaults to the last-used card and the primary income", () => {
    const expense = blankState("EXPENSE", app);
    expect(expense.accountId).toBe("aznCard");
    expect(expense.currency).toBe("AZN");
    expect(expense.date).toBe("2026-10-09");
    const income = blankState("INCOME", app);
    expect(income.incomeSourceId).toBe("A");
    expect(income.accountId).toBe("usdCard"); // the income's own destination account
    const exchange = blankState("EXCHANGE", app);
    expect(exchange.accountId).toBe("usdCard");
    expect(exchange.toAccountId).toBe("aznCard");
    const transfer = blankState("TRANSFER", app);
    expect(transfer.accountId).toBe("aznCard");
    expect(transfer.toAccountId).toBe("cashAzn");
  });

  it("builds an expense payload from typed text", () => {
    const input = ok(buildInput(withState("EXPENSE", { amount: "12,50", categoryId: "food", description: " Coffee ", tags: "#daily, work" }), app, "create"));
    expect(input).toMatchObject({ type: "EXPENSE", accountId: "aznCard", amount: "12,50", currency: "AZN", categoryId: "food", description: "Coffee", tags: ["daily", "work"], attribution: { mode: "AUTO" } });
  });

  it("explains what is missing instead of sending a bad request", () => {
    const r = buildInput(withState("EXPENSE", { amount: "" }), app, "create");
    expect(r).toEqual({ ok: false, errors: { amount: "Enter an amount" } });
    expect(buildInput(withState("EXPENSE", { amount: "-5" }), app, "create")).toEqual({ ok: false, errors: { amount: "Must be more than zero" } });
    expect(buildInput(withState("EXPENSE", { amount: "5", accountId: "" }), app, "create")).toMatchObject({ ok: false, errors: { accountId: "Choose an account" } });
  });

  it("a USD price on an AZN card is converted with the usual rate, and can be overridden", () => {
    const s = withState("EXPENSE", { amount: "10", currency: "USD" });
    const q = chargeQuote(app, s);
    expect(q.rate!.toFixed()).toBe("1.7");
    expect(q.charged!.toFixed(2)).toBe("17.00");
    // no manual figure needed when a rate exists
    expect(ok(buildInput(s, app, "create"))).toMatchObject({ currency: "USD", accountAmount: null });
    // an explicit charge is sent
    expect(ok(buildInput({ ...s, accountAmount: "17,40" }, app, "create"))).toMatchObject({ accountAmount: "17,40" });
    // an unknown pair has no quote, so the person must say what was charged
    const eur = withState("EXPENSE", { amount: "10", currency: "EUR" });
    expect(chargeQuote(app, eur).charged).toBeNull();
    expect(buildInput(eur, app, "create")).toMatchObject({ ok: false, errors: { accountAmount: "Enter how much AZN was charged" } });
  });

  it("splits: remainder, even split and validation", () => {
    const s = withState("EXPENSE", { amount: "300", attrMode: "SPLIT", split: { A: "200", B: "50" } });
    expect(splitRemainder(app, s)!.toFixed(2)).toBe("50.00");
    expect(buildInput(s, app, "create")).toMatchObject({ ok: false, errors: { attribution: expect.stringContaining("short by") } });
    const good = { ...s, split: { A: "200", B: "100" } };
    expect(ok(buildInput(good, app, "create"))).toMatchObject({ attribution: { mode: "MANUAL", allocations: [{ sourceId: "A", amount: "200" }, { sourceId: "B", amount: "100" }] } });
    expect(evenSplit(dec("100"), ["A", "B", "C"], "AZN")).toEqual({ A: "33.34", B: "33.33", C: "33.33" });
    // choosing one income attributes the whole debit to it
    expect(ok(buildInput(withState("EXPENSE", { amount: "40", attrMode: "ONE", attrSource: "B" }), app, "create"))).toMatchObject({
      attribution: { mode: "MANUAL", allocations: [{ sourceId: "B", amount: "40" }] },
    });
  });

  it("income: scheduled-date modes", () => {
    const base = withState("INCOME", { amount: "1000" });
    expect(ok(buildInput(base, app, "create"))).toMatchObject({ expectedDate: undefined });
    expect(ok(buildInput({ ...base, expected: "none" }, app, "create"))).toMatchObject({ expectedDate: null });
    expect(ok(buildInput({ ...base, expected: "2026-10-05" }, app, "create"))).toMatchObject({ expectedDate: "2026-10-05" });
  });

  it("exchange: effective rate vs the usual rate, with a typo guard", () => {
    const s = withState("EXCHANGE", { amount: "100", toAmount: "169", feeFixed: "0.5", feePercent: "0.1" });
    const q = exchangeQuote(app, s);
    expect(q.effective!.toFixed()).toBe("1.69");
    expect(q.usual!.toFixed()).toBe("1.7");
    expect(q.deviation!.times(100).toFixed(2)).toBe("-0.59");
    expect(q.fee.toFixed(2)).toBe("0.60"); // 0.50 + 0.1 % of 100
    expect(q.suggestedReceived!.toFixed(2)).toBe("170.00");
    expect(ok(buildInput(s, app, "create"))).toMatchObject({ type: "EXCHANGE", toAmount: "169", feeFixed: "0.5", feePercent: "0.1" });
    expect(buildInput({ ...s, toAccountId: "usdCard" }, app, "create")).toMatchObject({ ok: false, errors: { toAccountId: "Choose a different account" } });
    expect(buildInput({ ...s, toAccountId: "cashUsd" }, app, "create")).toMatchObject({ ok: false, errors: { toAccountId: "Both hold the same currency: use Transfer" } });
  });

  it("transfer must stay within one currency", () => {
    expect(buildInput(withState("TRANSFER", { amount: "5", accountId: "aznCard", toAccountId: "usdCard" }), app, "create")).toMatchObject({
      ok: false,
      errors: { toAccountId: "Use Exchange to convert between currencies" },
    });
  });

  it("correction: type what the account really holds; the app works out the difference", () => {
    // the app thinks the AZN card holds 1,000
    const s = withState("ADJUSTMENT", { accountId: "aznCard", actualBalance: "987,60" });
    expect(ok(buildInput(s, app, "create"))).toMatchObject({ type: "ADJUSTMENT", amount: "-12.4" });
    expect(buildInput({ ...s, actualBalance: "1000" }, app, "create")).toMatchObject({ ok: false, errors: { amount: "That already matches the account's balance" } });
    expect(ok(buildInput({ ...s, actualBalance: "1012.5" }, app, "create"))).toMatchObject({ amount: "12.5" });
  });

  it("editing round-trips: the form reproduces the stored entry", () => {
    const cases: LedgerTx[] = [
      tx({ type: "EXPENSE", accountId: "aznCard", amount: "300.00", currency: "AZN", categoryId: "food", description: "Shoes", tags: ["a"], allocationMode: "MANUAL", allocations: [{ sourceId: "A", amount: "200.00" }, { sourceId: "B", amount: "100.00" }] }),
      tx({ type: "INCOME", accountId: "usdCard", amount: "1500.00", currency: "USD", incomeSourceId: "A", expectedDate: "2026-10-05", description: "Salary" }),
      tx({ type: "EXCHANGE", accountId: "usdCard", toAccountId: "cashAzn", amount: "100.00", currency: "USD", toAmount: "169.00", feeFixed: "0.50", feeAmount: "0.50" }),
      tx({ type: "EXPENSE", accountId: "aznCard", amount: "800.00", currency: "AZN", categoryId: "food", recurringId: "rent", dueDate: "2026-10-01", time: "09:30", notes: "autopay" }),
      tx({ type: "TRANSFER", accountId: "aznCard", toAccountId: "cashAzn", amount: "50.00", currency: "AZN" }),
      tx({ type: "EXPENSE", accountId: "aznCard", amount: "10.00", currency: "USD", accountAmount: "17.00", categoryId: "food" }),
    ];
    for (const t of cases) {
      const built = ok(buildInput(stateFromTx(t, app), app, "edit")) as Record<string, unknown>;
      const original = txToInput(t) as Record<string, unknown>;
      for (const key of Object.keys(original)) {
        if (key === "rate") continue;
        // "200.00" and "200" are the same money: compare values, not spelling
        expect(canonical(built[key]), `${t.type}.${key}`).toEqual(canonical(original[key]));
      }
    }
  });
});

function canonical(v: unknown): unknown {
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) return dec(v).toFixed();
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, canonical(x)]));
  return v;
}

function tx(partial: Partial<LedgerTx> & Pick<LedgerTx, "type" | "accountId" | "amount" | "currency">): LedgerTx {
  return { id: "t1", date: "2026-10-08", createdAt: "2026-10-08T10:00:00Z", allocationMode: "AUTO", allocations: [], description: "", tags: [], ...partial };
}
