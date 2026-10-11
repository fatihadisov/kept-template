import { describe, expect, it } from "vitest";
import { buildForecast, billOccurrences, upcomingBills, type RecurringBill } from "@/lib/finance/forecast";
import { formatMoney, formatPercent, moneyParts } from "@/lib/finance/format";
import { filterTransactions } from "@/lib/finance/filters";
import { expectedPayments, suggestExpectedDate, summarizeStream, unscheduledPayments, type IncomeStream } from "@/lib/finance/income";
import { insightsFrom } from "@/lib/finance/insights";
import { CALENDAR_MONTHS, periodsBetween } from "@/lib/finance/periods";
import { dec } from "@/lib/finance/money";
import { snapshotAt } from "@/lib/finance/queries";
import { incomeSchedule, recurringSchedule } from "@/lib/finance/recurrence";
import {
  availableToSpend,
  averageMonthlySavings,
  goalsProgress,
  parseStrategyConfigs,
  reservedTotalBase,
  strategyReport,
  DEFAULT_STRATEGY_CONFIGS,
  type GoalInput,
} from "@/lib/finance/savings";
import { periodSeries, periodStats } from "@/lib/finance/stats";
import { standard } from "./helpers";

const m = (v: { toFixed(dp?: number): string }) => v.toFixed(2);

/* ------------------------------------------------------------------ */
describe("10. a goal reserves existing money without deducting it from total wealth", () => {
  const s = standard();
  s.opening("cashAzn", "15000.00", "2026-01-01");
  const ledger = s.build();
  const total = snapshotAt(ledger, "2026-10-09").total;
  const toBase = (ccy: string) => (ccy === "AZN" ? dec(1) : dec("1.7"));
  const car: GoalInput = {
    id: "car",
    name: "Car",
    kind: "RESERVE",
    targetAmount: "30000",
    currency: "AZN",
    targetDate: "2027-10-09",
    priority: 1,
    isPrimary: true,
    archived: false,
    allocations: [{ amount: "10000" }],
  };

  it("total stays 15,000 while only 5,000 is unreserved", () => {
    expect(m(total)).toBe("15000.00");
    const reserved = reservedTotalBase([car], toBase);
    const a = availableToSpend(total, reserved);
    expect(m(a.liquid)).toBe("15000.00");
    expect(m(a.reserved)).toBe("10000.00");
    expect(m(a.available)).toBe("5000.00");
    expect(a.overReserved).toBe(false);
  });

  it("two goals never double-count the same money", () => {
    const trip: GoalInput = { ...car, id: "trip", name: "Trip", priority: 2, isPrimary: false, allocations: [{ amount: "2500" }, { amount: "-500" }] };
    const reserved = reservedTotalBase([car, trip], toBase);
    expect(m(reserved)).toBe("12000.00");
    expect(m(availableToSpend(total, reserved).available)).toBe("3000.00");
  });

  it("archiving a goal releases its reservation; releasing is a negative allocation", () => {
    expect(m(reservedTotalBase([{ ...car, archived: true }], toBase))).toBe("0.00");
  });

  it("flags over-reservation and can deduct upcoming bills when asked", () => {
    expect(availableToSpend(dec("1000"), dec("1500")).overReserved).toBe(true);
    expect(m(availableToSpend(dec("1000"), dec("200"), dec("150")).available)).toBe("650.00");
  });

  it("goal progress: remaining, required monthly and a priority-ordered estimate", () => {
    const trip: GoalInput = { ...car, id: "trip", name: "Trip", priority: 2, isPrimary: false, targetAmount: "5000", targetDate: null, allocations: [{ amount: "1000" }] };
    const prog = goalsProgress([trip, car], {
      today: "2026-10-09",
      toBase,
      liquidBase: total,
      avgMonthlySavingsBase: dec("2000"),
    });
    const c = prog.find((p) => p.goalId === "car")!;
    expect(m(c.ratio.times(100))).toBe("33.33");
    expect(m(c.remaining)).toBe("20000.00");
    expect(c.monthsLeft).toBeCloseTo(12, 0);
    expect(Number(c.requiredMonthlyBase!.toFixed(0))).toBeGreaterThanOrEqual(1640);
    expect(Number(c.requiredMonthlyBase!.toFixed(0))).toBeLessThanOrEqual(1700);
    // car is funded first: 20,000 / 2,000 per month = 10 months; trip comes after: (20,000+4,000)/2,000 = 12 months
    expect(c.estimatedCompletion).toBe("2027-08-10");
    expect(c.status).toBe("on_track");
    const t = prog.find((p) => p.goalId === "trip")!;
    expect(t.estimatedCompletion).toBe("2027-10-10");
    expect(t.status).toBe("no_deadline");
  });

  it("a 'total savings' milestone is measured against all liquid savings, not a reservation", () => {
    const milestone: GoalInput = { ...car, id: "ms", kind: "TOTAL", targetAmount: "50000", allocations: [], targetDate: null };
    const [p] = goalsProgress([milestone], { today: "2026-10-09", toBase, liquidBase: total, avgMonthlySavingsBase: dec("1000") });
    expect(m(p.current)).toBe("15000.00");
    expect(m(p.ratio.times(100))).toBe("30.00");
    expect(p.estimatedCompletion).toBe("2029-09-09"); // 35,000 left at 1,000 / month
  });

  it("without any saving pace the status is 'unknown', not a false alarm", () => {
    const [p] = goalsProgress([car], { today: "2026-10-09", toBase, liquidBase: total, avgMonthlySavingsBase: dec(0) });
    expect(p.estimatedCompletion).toBeNull();
    expect(p.status).toBe("unknown");
  });
});

/* ------------------------------------------------------------------ */
describe("savings strategies are views, not accounting changes", () => {
  const s = standard();
  s.opening("aznCard", "1000.00", "2026-08-31");
  s.income("A", "aznCard", "2000.00", "2026-10-05");
  s.income("B", "aznCard", "1000.00", "2026-10-06");
  s.expense("aznCard", "700.00", "2026-10-07", { categoryId: "rent", ...s.split({ A: "700.00" }) });
  s.expense("aznCard", "500.00", "2026-10-08", { categoryId: "fun", ...s.split({ B: "500.00" }) });
  s.expense("aznCard", "200.00", "2026-10-09", { categoryId: "misc", ...s.split({ A: "100.00", B: "100.00" }) });
  const ledger = s.build();
  const stats = periodStats(ledger, { from: "2026-10-01", to: "2026-10-31" });
  const cfg = DEFAULT_STRATEGY_CONFIGS;
  const input = {
    stats,
    currentPeriod: { stats, end: "2026-10-31" },
    today: "2026-10-09",
    bucketOf: (id: string) => (id === "rent" ? ("NEEDS" as const) : id === "fun" ? ("WANTS" as const) : ("OTHER" as const)),
    emergencyReservedBase: dec("6000"),
  };

  it("A. save everything left: savings = income − spending, nothing else needed", () => {
    const r = strategyReport("SAVE_ALL", cfg, input);
    expect(m(r.income)).toBe("3000.00");
    expect(m(r.saved)).toBe("1600.00");
    expect(m(r.rate!.times(100))).toBe("53.33");
  });

  it("B. percentage target compares a goal against reality and never touches balances", () => {
    const before = m(snapshotAt(ledger, "2026-10-09").total);
    const r = strategyReport("PERCENT_TARGET", { ...cfg, PERCENT_TARGET: { percent: 40 } }, input);
    expect(m(r.target)).toBe("1200.00"); // 40% of 3,000
    expect(m(r.actual)).toBe("1600.00");
    expect(m(r.delta)).toBe("400.00"); // ahead
    expect(m(r.achieved!.times(100))).toBe("133.33");
    const a = r.bySource.find((x) => x.sourceId === "A")!;
    expect(m(a.target)).toBe("800.00"); // 40% of 2,000
    expect(m(a.actual)).toBe("1200.00"); // 2,000 − 700 − 100
    const b = r.bySource.find((x) => x.sourceId === "B")!;
    expect(m(b.target)).toBe("400.00");
    expect(m(b.actual)).toBe("400.00"); // 1,000 − 500 − 100
    expect(m(snapshotAt(ledger, "2026-10-09").total)).toBe(before);
  });

  it("C. fixed monthly target shows what is still missing", () => {
    const behind = strategyReport("FIXED_MONTHLY", { ...cfg, FIXED_MONTHLY: { amount: "3000" } }, input);
    expect(m(behind.actual)).toBe("1600.00");
    expect(m(behind.remaining)).toBe("1400.00");
    expect(behind.daysLeft).toBe(22);
    expect(m(behind.neededPerDay!)).toBe("63.64");
    const met = strategyReport("FIXED_MONTHLY", { ...cfg, FIXED_MONTHLY: { amount: "1000" } }, input);
    expect(m(met.remaining)).toBe("0.00");
  });

  it("D. 50/30/20 puts actual spending next to the plan", () => {
    const r = strategyReport("BUDGET_50_30_20", cfg, input);
    const [needs, wants, savings] = r.lines;
    expect(m(needs.allocated)).toBe("1500.00");
    expect(m(needs.actual)).toBe("700.00");
    expect(m(needs.delta)).toBe("800.00"); // under budget
    expect(m(wants.allocated)).toBe("900.00");
    expect(m(wants.actual)).toBe("500.00");
    expect(m(savings.allocated)).toBe("600.00");
    expect(m(savings.actual)).toBe("1600.00");
    expect(m(savings.delta)).toBe("1000.00"); // ahead
    expect(m(r.unclassified)).toBe("200.00");
    expect(r.percentSum).toBe(100);
  });

  it("E. emergency fund first: target = essentials × months, progress from reserved money", () => {
    const r = strategyReport("EMERGENCY_FIRST", { ...cfg, EMERGENCY_FIRST: { essentialMonthly: "1500", months: 6 } }, input);
    expect(m(r.target)).toBe("9000.00");
    expect(m(r.reserved)).toBe("6000.00");
    expect(m(r.remaining)).toBe("3000.00");
    expect(m(r.progress!.times(100))).toBe("66.67");
    expect(m(r.monthsCovered!)).toBe("4.00");
    expect(r.done).toBe(false);
  });

  it("strategy settings survive a switch (each strategy keeps its own parameters)", () => {
    const stored = JSON.stringify({ PERCENT_TARGET: { percent: 35 }, EMERGENCY_FIRST: { months: 12 } });
    const parsed = parseStrategyConfigs(stored);
    expect(parsed.PERCENT_TARGET.percent).toBe(35);
    expect(parsed.EMERGENCY_FIRST).toEqual({ essentialMonthly: "0", months: 12 });
    expect(parsed.BUDGET_50_30_20).toEqual({ needs: 50, wants: 30, savings: 20 });
    expect(parseStrategyConfigs("not json").FIXED_MONTHLY.amount).toBe("0");
  });
});

/* ------------------------------------------------------------------ */
describe("income streams: expected vs actually received", () => {
  const stream: IncomeStream = {
    id: "A",
    name: "Salary A",
    kind: "SALARY",
    currency: "USD",
    expectedAmount: "2000",
    schedule: incomeSchedule({ scheduleType: "MONTHLY", scheduleDays: [5], scheduleAnchor: null }),
    destinationAccountId: "usdCard",
    isActive: true,
  };

  const s = standard();
  // September: paid on time and in full
  s.income("A", "usdCard", "2000.00", "2026-09-05", { expectedDate: "2026-09-05", expectedAmount: "2000" });
  // October: late and in two parts (partial, then the rest)
  s.income("A", "usdCard", "1200.00", "2026-10-08", { expectedDate: "2026-10-05", expectedAmount: "2000" });
  // a bonus nobody scheduled
  s.income("A", "usdCard", "300.00", "2026-10-09", { subtype: "bonus" });
  const ledger = s.build();

  it("distinguishes received, partial, late and overdue", () => {
    const rows = expectedPayments(ledger, stream, { from: "2026-08-01", to: "2026-11-30" }, "2026-10-09");
    const byDate = Object.fromEntries(rows.map((r) => [r.dueDate, r]));
    expect(byDate["2026-08-05"].status).toBe("overdue"); // nothing recorded for August
    expect(byDate["2026-09-05"].status).toBe("received");
    expect(byDate["2026-09-05"].late).toBe(false);
    const oct = byDate["2026-10-05"];
    expect(oct.status).toBe("partial");
    expect(oct.late).toBe(true);
    expect(m(oct.receivedNative!)).toBe("1200.00");
    expect(m(oct.variance!)).toBe("-800.00");
    expect(byDate["2026-11-05"].status).toBe("upcoming");
  });

  it("completing the partial payment settles the occurrence; expected pay is not money owned", () => {
    const s2 = standard();
    s2.income("A", "usdCard", "1200.00", "2026-10-08", { expectedDate: "2026-10-05" });
    s2.income("A", "usdCard", "800.00", "2026-10-09", { expectedDate: "2026-10-05" });
    const l2 = s2.build();
    const oct = expectedPayments(l2, stream, { from: "2026-10-01", to: "2026-10-31" }, "2026-10-09")[0];
    expect(oct.status).toBe("received");
    expect(oct.payments).toHaveLength(2);
    // the upcoming November salary is not part of the balance
    expect(m(snapshotAt(l2, "2026-10-09").accounts.find((a) => a.accountId === "usdCard")!.balance)).toBe("2000.00");
  });

  it("variable salaries are compared with the amount that was expected when recorded", () => {
    const s3 = standard();
    s3.income("A", "usdCard", "2300.00", "2026-10-05", { expectedDate: "2026-10-05", expectedAmount: "2000" });
    const row = expectedPayments(s3.build(), stream, { from: "2026-10-01", to: "2026-10-31" }, "2026-10-09")[0];
    expect(row.status).toBe("received");
    expect(m(row.variance!)).toBe("300.00");
  });

  it("bonuses and one-offs are listed separately from the schedule", () => {
    const extra = unscheduledPayments(ledger, stream, { from: "2026-10-01", to: "2026-10-31" });
    expect(extra.map((r) => r.tx.amount)).toEqual(["300.00"]);
  });

  it("suggests which scheduled payment a new receipt settles", () => {
    expect(suggestExpectedDate(ledger, stream, "2026-10-12", "2026-10-12")).toBe("2026-10-05"); // the partial one
    expect(suggestExpectedDate(ledger, stream, "2026-11-04", "2026-11-04")).toBe("2026-11-05");
  });

  it("pay that arrives early settles the upcoming payment, not a stray extra", () => {
    // a monthly salary due on the 5th, received on the 29th of the month before (7 days early)
    const early = standard();
    early.income("A", "usdCard", "2000.00", "2026-09-05", { expectedDate: "2026-09-05", expectedAmount: "2000" });
    expect(suggestExpectedDate(early.build(), stream, "2026-09-29", "2026-09-29")).toBe("2026-10-05");
    // too early to be the same pay (16 days ahead of a monthly date): nothing is suggested
    expect(suggestExpectedDate(early.build(), stream, "2026-09-19", "2026-09-19")).toBeNull();
  });

  it("how early is 'early' depends on how often the pay comes", () => {
    const weekly: IncomeStream = { ...stream, id: "W", schedule: incomeSchedule({ scheduleType: "WEEKLY", scheduleDays: [5], scheduleAnchor: null }) }; // Fridays
    const w = standard();
    for (const friday of ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"]) {
      w.income("W", "usdCard", "500.00", friday, { expectedDate: friday, expectedAmount: "500" });
    }
    const l = w.build();
    // money on Wed 7 Oct is 2 days early for Friday the 9th
    expect(suggestExpectedDate(l, weekly, "2026-10-07", "2026-10-07")).toBe("2026-10-09");
    // money on Sun 4 Oct is 5 days ahead of that Friday: too early for weekly pay (the window is 3 days)
    expect(suggestExpectedDate(l, weekly, "2026-10-04", "2026-10-04")).toBeNull();
  });

  it("summarises next payment and last payment", () => {
    const sum = summarizeStream(ledger, stream, { from: "2026-10-01", to: "2026-10-31" }, "2026-10-09");
    expect(sum.next!.dueDate).toBe("2026-10-05");
    expect(sum.next!.status).toBe("partial");
    expect(sum.lastPayment!.tx.amount).toBe("300.00");
    expect(sum.paymentCount).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
describe("recurring bills and the forecast", () => {
  const rent: RecurringBill = {
    id: "rent",
    description: "Rent",
    amount: "800",
    currency: "AZN",
    accountId: "aznCard",
    categoryId: "rent",
    schedule: recurringSchedule({ frequency: "MONTHLY", interval: 1, dayOfMonth: 15, startDate: "2026-01-15" }),
    isActive: true,
    skippedDates: [],
  };
  const netflix: RecurringBill = {
    id: "nf",
    description: "Streaming",
    amount: "10",
    currency: "USD",
    accountId: "usdCard",
    categoryId: "subs",
    schedule: recurringSchedule({ frequency: "MONTHLY", interval: 1, dayOfMonth: 20, startDate: "2026-01-20" }),
    isActive: true,
    skippedDates: ["2026-11-20"],
  };

  const s = standard();
  s.income("B", "aznCard", "3000.00", "2026-10-01", { expectedDate: "2026-10-01" });
  s.income("A", "usdCard", "500.00", "2026-10-01");
  // October rent already recorded as paid
  s.expense("aznCard", "800.00", "2026-10-15", { recurringId: "rent", dueDate: "2026-10-15" });
  const ledger = s.build();

  it("upcoming bills are only deducted from balances once recorded as paid", () => {
    const occ = billOccurrences(ledger, rent, { from: "2026-10-01", to: "2026-12-31" }, "2026-10-09");
    expect(occ.map((o) => [o.dueDate, o.status])).toEqual([
      ["2026-10-15", "paid"],
      ["2026-11-15", "upcoming"],
      ["2026-12-15", "upcoming"],
    ]);
    // 3000 AZN income, the recorded rent is the only deduction so far
    expect(m(snapshotAt(ledger, "2026-10-09").accounts.find((a) => a.accountId === "aznCard")!.balance)).toBe("3000.00");
  });

  it("lists unpaid bills in the lookahead window, valued in the base currency", () => {
    const list = upcomingBills(ledger, [rent, netflix], "2026-10-09", 40);
    expect(list.map((o) => o.billId + o.dueDate)).toEqual(["nf2026-10-20", "rent2026-11-15"]);
    expect(m(list[0].amountBase)).toBe("17.00"); // 10 USD at 1.70
  });

  it("skipped occurrences are excluded", () => {
    const nov = billOccurrences(ledger, netflix, { from: "2026-11-01", to: "2026-11-30" }, "2026-10-09");
    expect(nov[0].status).toBe("skipped");
  });

  it("projects balances forward without treating expected pay as owned", () => {
    const salary: IncomeStream = {
      id: "B",
      name: "Salary B",
      kind: "SALARY",
      currency: "AZN",
      expectedAmount: "3000",
      schedule: incomeSchedule({ scheduleType: "MONTHLY", scheduleDays: [1], scheduleAnchor: null }),
      destinationAccountId: "aznCard",
      isActive: true,
    };
    const f = buildForecast({
      ledger,
      today: "2026-10-09",
      months: 3,
      streams: [salary],
      bills: [rent, netflix],
      variableMonthly: dec("600"),
      period: CALENDAR_MONTHS,
    });
    // today's real money: 3000 AZN + 500 USD*1.7 = 3850. The rent is dated the 15th, so it is not spent yet.
    expect(m(f.startBalance)).toBe("3850.00");
    const [oct, nov, dec_] = f.months;
    expect(m(oct.income)).toBe("0.00"); // October salary already received
    expect(m(oct.bills)).toBe("817.00"); // rent paid ahead (dated the 15th) + streaming on the 20th
    expect(m(oct.variable)).toBe("445.16"); // 600 × 23/31 days left
    expect(m(oct.endBalance)).toBe("2587.84"); // 3850 − 817 − 445.16
    expect(m(nov.income)).toBe("3000.00");
    expect(m(nov.bills)).toBe("800.00"); // rent; streaming skipped
    expect(m(nov.endBalance)).toBe("4187.84"); // 2587.84 + 3000 − 800 − 600
    expect(m(dec_.bills)).toBe("817.00");
    expect(m(dec_.endBalance)).toBe("5770.84"); // 4187.84 + 3000 − 817 − 600
  });
});

/* ------------------------------------------------------------------ */
describe("insights", () => {
  const s = standard();
  s.opening("aznCard", "100.00", "2026-05-31");
  const months: [string, string, string][] = [
    ["2026-06", "3000", "2000"],
    ["2026-07", "3000", "2600"],
    ["2026-08", "3200", "1800"],
    ["2026-09", "3000", "2400"],
  ];
  for (const [mo, inc, exp] of months) {
    s.income("B", "aznCard", `${inc}.00`, `${mo}-05`);
    s.expense("aznCard", `${exp}.00`, `${mo}-12`);
  }
  s.income("B", "aznCard", "3000.00", "2026-10-05");
  s.expense("aznCard", "100.00", "2026-10-08");
  const ledger = s.build();
  const points = periodSeries(ledger, periodsBetween("2026-06-01", "2026-10-31", CALENDAR_MONTHS), "2026-10-09");
  const ins = insightsFrom(points, "2026-10-09");

  it("uses only completed periods", () => {
    expect(ins.periods).toHaveLength(4);
    expect(m(ins.avgSpent)).toBe("2200.00");
    expect(m(ins.avgSavings)).toBe("850.00");
    expect(m(ins.avgIncome)).toBe("3050.00");
  });

  it("finds the extremes and the growth", () => {
    expect(ins.highestSpending!.period.key).toBe("2026-07-01");
    expect(ins.bestSavings!.period.key).toBe("2026-08-01");
    expect(m(ins.spendingGrowth!.times(100))).toBe("33.33"); // 2400 vs 1800
    expect(ins.savingsRateTrend).not.toBeNull();
  });

  it("average monthly savings feeds goal estimates", () => {
    expect(m(averageMonthlySavings(points, "2026-10-09", 3))).toBe("800.00"); // (400+1400+600)/3 over Jul–Sep
  });
});

/* ------------------------------------------------------------------ */
describe("filtering", () => {
  const s = standard();
  s.income("A", "usdCard", "1000.00", "2026-10-01");
  s.expense("usdCard", "40.00", "2026-10-02", { categoryId: "food", description: "Groceries at Bravo", tags: ["weekly"] });
  s.expense("usdCard", "250.00", "2026-10-03", { categoryId: "shop", description: "Headphones" });
  s.expense("aznCard", "12.50", "2026-10-04", { categoryId: "food", description: "Coffee" });
  const ledger = s.build();
  const lookups = {
    accountName: (id: string) => id,
    categoryName: (id: string) => ({ food: "Food & Groceries", shop: "Shopping" })[id] ?? id,
    sourceName: (id: string) => `Salary ${id}`,
  };

  it("filters by text, category, account, amount and date", () => {
    const f = (x: Parameters<typeof filterTransactions>[1]) => filterTransactions(ledger, x, lookups).map((r) => r.tx.description || r.tx.type);
    expect(f({ search: "bravo" })).toEqual(["Groceries at Bravo"]);
    expect(f({ search: "food groceries" }).length).toBe(2);
    expect(f({ categoryIds: ["shop"] })).toEqual(["Headphones"]);
    expect(f({ accountIds: ["aznCard"] })).toEqual(["Coffee"]);
    expect(f({ types: ["EXPENSE"], from: "2026-10-03" })).toEqual(["Coffee", "Headphones"]);
    // base-currency amounts: 250 USD = 425 AZN, 40 USD = 68 AZN, 12.50 AZN
    expect(f({ types: ["EXPENSE"], min: "100" })).toEqual(["Headphones"]);
    expect(f({ types: ["EXPENSE"], max: "20" })).toEqual(["Coffee"]);
    // single currency: compared in that currency
    expect(f({ types: ["EXPENSE"], currencies: ["USD"], min: "100" })).toEqual(["Headphones"]);
    expect(f({ tags: ["weekly"] })).toEqual(["Groceries at Bravo"]);
    expect(f({ sourceIds: ["A"], types: ["INCOME"] })).toEqual(["INCOME"]);
  });
});

/* ------------------------------------------------------------------ */
describe("formatting", () => {
  it("formats exact decimals with currency symbols", () => {
    expect(formatMoney("1234.5", "AZN")).toBe("₼1,234.50");
    expect(formatMoney("-1234.567", "USD")).toBe("-$1,234.57");
    expect(formatMoney("1234.5", "AZN", { display: "code" })).toBe("AZN 1,234.50");
    expect(formatMoney("1234.5", "AZN", { locale: "az-AZ" })).toBe("1.234,50\u00A0₼");
    expect(formatMoney("5", "AZN", { sign: "always" })).toBe("+₼5.00");
    expect(formatMoney("1234", "JPY")).toBe("¥1,234");
    // no float round trip: 17 significant digits survive
    expect(formatMoney("12345678901234.56", "AZN")).toBe("₼12,345,678,901,234.56");
  });

  it("splits into hero-number parts", () => {
    const p = moneyParts("18420.5", "AZN");
    expect(p.symbol).toBe("₼");
    expect(p.integer).toBe("18,420");
    expect(p.fraction).toBe("50");
    expect(formatPercent("0.1667", 1)).toBe("16.7%");
    expect(formatPercent(null)).toBe("—");
  });
});
