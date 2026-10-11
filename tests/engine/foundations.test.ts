import { describe, expect, it } from "vitest";
import { D, dec, formatRate, parseAmountInput, round, sum, toStr } from "@/lib/finance/money";
import { distribute } from "@/lib/finance/distribute";
import { decimalsOf, roundMoney } from "@/lib/finance/currency";
import {
  addDays,
  addMonths,
  diffDays,
  eachMonthStart,
  endOfMonth,
  isISODate,
  startOfWeek,
  timeNowIn,
  todayIn,
  weekday,
} from "@/lib/finance/dates";
import {
  periodContaining,
  periodsBetween,
  previousRange,
  resolveRange,
  shiftPeriod,
  type PeriodConfig,
} from "@/lib/finance/periods";

describe("decimal money", () => {
  it("does not suffer binary floating point error", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the problem we avoid
    expect(toStr(dec("0.1").plus("0.2"), 2)).toBe("0.30");
    expect(dec("0.1").plus("0.2").eq("0.3")).toBe(true);
    expect(toStr(dec("1234567.89").times("1.7"), 2)).toBe("2098765.41");
  });

  it("rounds half up to the currency minor unit", () => {
    expect(toStr(round(dec("2.345"), 2), 2)).toBe("2.35");
    expect(toStr(round(dec("2.344999"), 2), 2)).toBe("2.34");
    expect(toStr(round(dec("-2.345"), 2), 2)).toBe("-2.35");
    expect(toStr(roundMoney(dec("1234.5"), "JPY"), 0)).toBe("1235");
    expect(decimalsOf("AZN")).toBe(2);
    expect(decimalsOf("JPY")).toBe(0);
    expect(decimalsOf("KWD")).toBe(3);
  });

  it("sums exactly", () => {
    const parts = Array.from({ length: 10 }, () => dec("0.1"));
    expect(sum(parts).eq(1)).toBe(true);
  });

  it("keeps 6+ decimal places on exchange rates", () => {
    const rate = dec("1.699999");
    expect(toStr(dec("1000").times(rate))).toBe("1699.999");
    expect(formatRate(dec("1.7"))).toBe("1.70");
    expect(formatRate(dec("0.588235294"))).toBe("0.588235");
  });

  it("parses typed amounts", () => {
    const cases: [string, string | null][] = [
      ["12.5", "12.5"],
      ["12,50", "12.5"],
      ["1,234.56", "1234.56"],
      ["1.234,56", "1234.56"],
      ["1 234,56", "1234.56"],
      ["1,234", "1234"],
      ["1.234.567", "1234567"],
      ["0,5", "0.5"],
      [".5", "0.5"],
      ["-3", "-3"],
      ["abc", null],
      ["", null],
      ["1.2.3x", null],
    ];
    for (const [input, expected] of cases) {
      const out = parseAmountInput(input);
      expect(out === null ? null : out.toFixed(), input).toBe(expected);
    }
  });
});

describe("distribute (largest remainder)", () => {
  const sumOf = (xs: ReturnType<typeof distribute>) => xs.reduce((a, b) => a.plus(b), dec(0));

  it("splits 100 into thirds that sum to exactly 100.00", () => {
    const parts = distribute(dec("100"), [dec(1), dec(1), dec(1)], 2);
    expect(parts.map((p) => p.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(sumOf(parts).eq(100)).toBe(true);
  });

  it("splits a 300 purchase 200/100 exactly", () => {
    const parts = distribute(dec("300"), [dec("200"), dec("100")], 2);
    expect(parts.map((p) => p.toFixed(2))).toEqual(["200.00", "100.00"]);
  });

  it("always reconciles with the total, for arbitrary weights", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 500; i += 1) {
      const total = new D((Math.round(rnd() * 1_000_000) / 100).toFixed(2));
      const n = 1 + Math.floor(rnd() * 5);
      const weights = Array.from({ length: n }, () => new D((rnd() * 1000).toFixed(4)));
      const parts = distribute(total, weights, 2);
      expect(sumOf(parts).eq(total)).toBe(true);
      for (const p of parts) expect(p.decimalPlaces()).toBeLessThanOrEqual(2);
    }
  });

  it("handles negatives, zero weights and zero-decimal currencies", () => {
    expect(distribute(dec("-100"), [dec(1), dec(2)], 2).map((p) => p.toFixed(2))).toEqual(["-33.33", "-66.67"]);
    expect(distribute(dec("50"), [dec(0), dec(0)], 2).map((p) => p.toFixed(2))).toEqual(["50.00", "0.00"]);
    expect(distribute(dec("10"), [dec(1), dec(1), dec(1)], 0).map((p) => p.toFixed(0))).toEqual(["4", "3", "3"]);
    expect(distribute(dec("5"), [dec(0), dec(3)], 2).map((p) => p.toFixed(2))).toEqual(["0.00", "5.00"]);
  });
});

describe("calendar dates", () => {
  it("validates and does arithmetic on calendar fields", () => {
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-10-01", "2026-10-09")).toBe(8);
    expect(diffDays("2026-10-09", "2026-10-01")).toBe(-8);
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(weekday("2026-10-09")).toBe(5); // Friday
    expect(startOfWeek("2026-10-09", 1)).toBe("2026-10-05");
    expect(startOfWeek("2026-10-11", 1)).toBe("2026-10-05");
    expect(eachMonthStart("2026-01-20", "2026-03-05")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("uses the Asia/Baku wall clock for 'today'", () => {
    // 19:59 UTC is 23:59 in Baku (UTC+4): still the 9th
    expect(todayIn("Asia/Baku", new Date("2026-10-09T19:59:00Z"))).toBe("2026-10-09");
    // 20:01 UTC is 00:01 on the 10th in Baku
    expect(todayIn("Asia/Baku", new Date("2026-10-09T20:01:00Z"))).toBe("2026-10-10");
    expect(todayIn("UTC", new Date("2026-10-09T20:01:00Z"))).toBe("2026-10-09");
    expect(timeNowIn("Asia/Baku", new Date("2026-10-09T20:01:00Z"))).toBe("00:01");
  });
});

describe("periods and ranges", () => {
  const month: PeriodConfig = { mode: "MONTH", cycleStartDay: 1 };
  const cycle5: PeriodConfig = { mode: "CYCLE", cycleStartDay: 5 };

  it("calendar months", () => {
    const p = periodContaining("2026-10-09", month);
    expect([p.start, p.end]).toEqual(["2026-10-01", "2026-10-31"]);
    expect(shiftPeriod(p, -1, month).start).toBe("2026-09-01");
    expect(shiftPeriod(p, 2, month).start).toBe("2026-12-01");
  });

  it("salary cycles starting on the 5th", () => {
    const a = periodContaining("2026-10-03", cycle5);
    expect([a.start, a.end]).toEqual(["2026-09-05", "2026-10-04"]);
    const b = periodContaining("2026-10-05", cycle5);
    expect([b.start, b.end]).toEqual(["2026-10-05", "2026-11-04"]);
    expect(shiftPeriod(b, -1, cycle5).start).toBe("2026-09-05");
    expect(shiftPeriod(b, 1, cycle5).start).toBe("2026-11-05");
    const list = periodsBetween("2026-09-20", "2026-11-10", cycle5);
    expect(list.map((x) => x.start)).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
  });

  it("cycles starting on the 31st clamp to short months", () => {
    const cfg: PeriodConfig = { mode: "CYCLE", cycleStartDay: 31 };
    const p = periodContaining("2026-02-28", cfg);
    expect(p.start).toBe("2026-02-28");
    expect(p.end).toBe("2026-03-30");
  });

  it("resolves the quick filters", () => {
    const ctx = { today: "2026-10-09", period: month, firstDate: "2026-03-15" };
    expect(resolveRange("today", ctx)).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(resolveRange("yesterday", ctx)).toEqual({ from: "2026-10-08", to: "2026-10-08" });
    expect(resolveRange("last7", ctx)).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(resolveRange("thisMonth", ctx)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveRange("lastMonth", ctx)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolveRange("last3m", ctx)).toEqual({ from: "2026-07-10", to: "2026-10-09" });
    expect(resolveRange("last6m", ctx)).toEqual({ from: "2026-04-10", to: "2026-10-09" });
    expect(resolveRange("thisYear", ctx)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(resolveRange("lastYear", ctx)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(resolveRange("all", ctx)).toEqual({ from: "2026-03-15", to: "2026-10-09" });
    expect(resolveRange("custom", { ...ctx, custom: { from: "2026-01-05", to: "2026-02-10" } })).toEqual({
      from: "2026-01-05",
      to: "2026-02-10",
    });
  });

  it("previous range matches whole periods, otherwise equal length", () => {
    expect(previousRange({ from: "2026-10-01", to: "2026-10-31" }, month)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousRange({ from: "2026-07-01", to: "2026-09-30" }, month)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(previousRange({ from: "2026-10-03", to: "2026-10-09" }, month)).toEqual({ from: "2026-09-26", to: "2026-10-02" });
  });
});
