import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildLedger } from "@/lib/finance/ledger";
import { detectOverdrafts, snapshotAt } from "@/lib/finance/queries";
import { periodStats, reconcile } from "@/lib/finance/stats";
import { ledgerInputOf, loadAppData } from "@/server/load";
import { seedDemo } from "@/server/services/demo";
import { onPostgres, tempDb, type TempDb } from "./helpers";

let t: TempDb;
beforeAll(async () => {
  if (onPostgres) return; // the demo database exists only on SQLite
  t = await tempDb("demo");
  await seedDemo(t.db, new Date("2026-10-09T10:00:00Z"));
}, 120_000);
afterAll(async () => t?.dispose());

describe.skipIf(onPostgres)("demo data", () => {
  it("is plentiful, valid and internally consistent", async () => {
    const data = await loadAppData(t.db);
    const ledger = buildLedger(ledgerInputOf(data));
    expect(data.accounts).toHaveLength(5);
    expect(data.transactions.length).toBeGreaterThan(300);
    expect(ledger.issues).toEqual([]);
    expect(ledger.txs).toHaveLength(data.transactions.length);
    expect(detectOverdrafts(ledger)).toEqual([]); // no account ever dips below zero
    expect(data.settings.onboarded).toBe(true);
    expect(data.settings.activeStrategy).toBe("SAVE_ALL");
  });

  it("tells a believable money story", async () => {
    const data = await loadAppData(t.db);
    const ledger = buildLedger(ledgerInputOf(data));
    const snap = snapshotAt(ledger, "2026-10-09");
    expect(snap.total.gt(20000)).toBe(true);
    const oct = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
    expect(oct.income.gt(0)).toBe(true);
    expect(oct.spent.gt(1000)).toBe(true);
    const sep = periodStats(ledger, { from: "2026-09-01", to: "2026-09-30" });
    expect(sep.savingsRate!.gt(0.1) && sep.savingsRate!.lt(0.8)).toBe(true);
    // both salaries are tracked independently, plus the freelance and the money that was already there
    const names = Object.fromEntries(data.sources.map((s) => [s.id, s.name]));
    const bySource = snap.sources.filter((s) => s.baseValue.gt(0)).map((s) => names[s.sourceId]).sort();
    expect(bySource).toEqual(["Existing funds", "Freelance", "Local job", "Remote job"]);
    // identity: wealth only changed by income, spending, fees, corrections, opening funds and FX
    const rec = reconcile(ledger, { from: "2026-02-01", to: "2026-10-09" }, { cap: "2026-10-09" });
    expect(rec.change.eq(rec.endWealth.minus(rec.startWealth))).toBe(true);
    expect(rec.revaluation.abs().lt(5)).toBe(true); // constant rates: only cent rounding
  });
});
