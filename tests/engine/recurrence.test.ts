import { describe, expect, it } from "vitest";
import {
  type Schedule,
  describeSchedule,
  incomeSchedule,
  nextOccurrence,
  nextOccurrenceOnOrAfter,
  occurrencesBetween,
  recurringSchedule,
} from "@/lib/finance/recurrence";
import { RateBook } from "@/lib/finance/rates";
import { effectiveRate, computeFee, receivedAt, givenFor, spreadVsBenchmark, spreadPercent } from "@/lib/finance/conversion";
import { dec } from "@/lib/finance/money";

describe("schedules", () => {
  it("monthly salary on the 5th", () => {
    const s = incomeSchedule({ scheduleType: "MONTHLY", scheduleDays: [5], scheduleAnchor: null });
    expect(occurrencesBetween(s, "2026-08-20", "2026-11-10")).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
  });

  it("monthly on the 31st clamps to short months", () => {
    const s = incomeSchedule({ scheduleType: "MONTHLY", scheduleDays: [31], scheduleAnchor: null });
    expect(occurrencesBetween(s, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("semi-monthly pays twice a month", () => {
    const s = incomeSchedule({ scheduleType: "SEMI_MONTHLY", scheduleDays: [1, 15], scheduleAnchor: null });
    expect(occurrencesBetween(s, "2026-10-01", "2026-11-14")).toEqual(["2026-10-01", "2026-10-15", "2026-11-01"]);
    expect(describeSchedule(s)).toBe("Twice a month · 1st & 15th");
  });

  it("bi-weekly is anchored on the first pay date", () => {
    const s = incomeSchedule({ scheduleType: "BIWEEKLY", scheduleDays: [], scheduleAnchor: "2026-10-02" });
    expect(occurrencesBetween(s, "2026-10-01", "2026-11-15")).toEqual(["2026-10-02", "2026-10-16", "2026-10-30", "2026-11-13"]);
    expect(describeSchedule(s)).toBe("Every 2 weeks on Friday");
  });

  it("weekly on a chosen weekday", () => {
    const s = incomeSchedule({ scheduleType: "WEEKLY", scheduleDays: [1], scheduleAnchor: null });
    expect(occurrencesBetween(s, "2026-10-01", "2026-10-20")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("respects the end date and the start date", () => {
    const s = incomeSchedule({ scheduleType: "MONTHLY", scheduleDays: [10], scheduleAnchor: "2026-03-01", scheduleEnd: "2026-05-31" });
    expect(occurrencesBetween(s, "2026-01-01", "2026-12-31")).toEqual(["2026-03-10", "2026-04-10", "2026-05-10"]);
  });

  it("'after' drops earlier dates without shifting the rhythm", () => {
    // bi-weekly Fridays anchored on 2 Oct: 2, 16, 30 Oct, 13 Nov ...
    const biweekly = { ...incomeSchedule({ scheduleType: "BIWEEKLY", scheduleDays: [], scheduleAnchor: "2026-10-02" }), after: "2026-10-16" } as Schedule;
    // the 16th itself is covered (on or before); the cycle continues on the same Fridays
    expect(occurrencesBetween(biweekly, "2026-10-01", "2026-11-30")).toEqual(["2026-10-30", "2026-11-13", "2026-11-27"]);
    const monthly = { ...incomeSchedule({ scheduleType: "MONTHLY", scheduleDays: [5], scheduleAnchor: null }), after: "2026-10-09" } as Schedule;
    expect(occurrencesBetween(monthly, "2026-09-01", "2026-12-31")).toEqual(["2026-11-05", "2026-12-05"]);
    expect(nextOccurrenceOnOrAfter(monthly, "2026-10-01")).toBe("2026-11-05");
    // a one-off on or before the date is gone; one after it stays
    expect(occurrencesBetween({ type: "ONCE", start: "2026-10-09", after: "2026-10-09" }, "2026-10-01", "2026-10-31")).toEqual([]);
    expect(occurrencesBetween({ type: "ONCE", start: "2026-10-10", after: "2026-10-09" }, "2026-10-01", "2026-10-31")).toEqual(["2026-10-10"]);
  });

  it("one-off and unscheduled", () => {
    expect(occurrencesBetween(incomeSchedule({ scheduleType: "ONCE", scheduleDays: [], scheduleAnchor: "2026-12-20" }), "2026-12-01", "2026-12-31")).toEqual(["2026-12-20"]);
    expect(occurrencesBetween(incomeSchedule({ scheduleType: "NONE", scheduleDays: [] }), "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("recurring bills: every 3 months, yearly, weekly", () => {
    const quarterly = recurringSchedule({ frequency: "MONTHLY", interval: 3, dayOfMonth: 15, startDate: "2026-01-15" });
    expect(occurrencesBetween(quarterly, "2026-01-01", "2026-12-31")).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
    const yearly = recurringSchedule({ frequency: "YEARLY", interval: 1, startDate: "2024-02-29" });
    expect(occurrencesBetween(yearly, "2025-01-01", "2028-12-31")).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
    const weekly = recurringSchedule({ frequency: "WEEKLY", interval: 1, startDate: "2026-10-01" });
    expect(occurrencesBetween(weekly, "2026-10-08", "2026-10-22")).toEqual(["2026-10-08", "2026-10-15", "2026-10-22"]);
  });

  it("next occurrence", () => {
    const s = incomeSchedule({ scheduleType: "MONTHLY", scheduleDays: [5], scheduleAnchor: null });
    expect(nextOccurrence(s, "2026-10-05")).toBe("2026-11-05");
    expect(nextOccurrence(s, "2026-10-04")).toBe("2026-10-05");
  });
});

describe("rate book", () => {
  const book = new RateBook(
    [
      { from: "USD", to: "AZN", rate: "1.700000", effectiveFrom: "2026-01-01" },
      { from: "USD", to: "AZN", rate: "1.710000", effectiveFrom: "2026-06-01" },
      { from: "AZN", to: "USD", rate: "0.584000", effectiveFrom: "2026-01-01" },
      { from: "EUR", to: "AZN", rate: "1.99", effectiveFrom: "2026-01-01" },
      { from: "USD", to: "AZN", rate: "1.69", effectiveFrom: "2026-01-01", accountId: "card1" },
    ],
    "AZN",
  );

  it("uses the latest rate effective on the date (history preserved)", () => {
    expect(book.rate("USD", "AZN", "2026-03-01")!.rate.toFixed()).toBe("1.7");
    expect(book.rate("USD", "AZN", "2026-06-01")!.rate.toFixed()).toBe("1.71");
    expect(book.rate("USD", "AZN", "2026-12-31")!.rate.toFixed()).toBe("1.71");
  });

  it("falls back to the earliest rate for dates before any row", () => {
    expect(book.rate("USD", "AZN", "2019-05-05")!.rate.toFixed()).toBe("1.7");
  });

  it("per-account preferred rate beats the global one", () => {
    const r = book.rate("USD", "AZN", "2026-07-01", { accountId: "card1" })!;
    expect(r.rate.toFixed()).toBe("1.69");
    expect(r.source).toBe("account");
    expect(book.rate("USD", "AZN", "2026-07-01", { accountId: "other" })!.source).toBe("global");
  });

  it("directional rates are honoured and inverses/crosses are derived", () => {
    expect(book.rate("AZN", "USD", "2026-07-01")!.rate.toFixed()).toBe("0.584"); // explicit, not 1/1.71
    const eurToAzn = book.rate("EUR", "AZN", "2026-07-01")!;
    expect(eurToAzn.rate.toFixed()).toBe("1.99");
    const inverse = book.rate("AZN", "EUR", "2026-07-01")!;
    expect(inverse.source).toBe("inverse");
    expect(inverse.rate.times("1.99").toFixed(8)).toBe("1.00000000");
    const cross = book.rate("USD", "EUR", "2026-07-01")!;
    expect(cross.source).toBe("cross");
    expect(cross.rate.toFixed(6)).toBe("0.859296"); // 1.71 / 1.99
    expect(book.rate("USD", "USD", "2026-07-01")!.rate.toFixed()).toBe("1");
    expect(book.rate("USD", "JPY", "2026-07-01")).toBeNull();
  });

  it("keeps 6+ decimals of precision", () => {
    const b = new RateBook([{ from: "USD", to: "AZN", rate: "1.699999", effectiveFrom: "2026-01-01" }], "AZN");
    expect(b.toBase("USD", "2026-02-02")!.times(1_000_000).toFixed()).toBe("1699999");
  });
});

describe("conversion maths", () => {
  it("derives the effective rate from what was given and received", () => {
    expect(effectiveRate(dec("100"), dec("169"))!.toFixed()).toBe("1.69");
    expect(effectiveRate(dec("300"), dec("500"))!.toFixed()).toBe("1.66666667");
    expect(effectiveRate(dec("0"), dec("5"))).toBeNull();
  });

  it("the embedded spread is not a fee: fees are only explicit commissions", () => {
    // benchmark 1.70, bank gave 1.69 -> 1.00 AZN spread; the commission is independent
    expect(spreadVsBenchmark(dec("100"), dec("169"), dec("1.70"), "AZN").toFixed(2)).toBe("1.00");
    expect(spreadPercent(dec("100"), dec("169"), dec("1.70"))!.toFixed(4)).toBe("0.5882");
    expect(computeFee({ amount: dec("100"), fixed: "0.50", percent: "1", currency: "USD" }).toFixed(2)).toBe("1.50");
    expect(computeFee({ amount: dec("100"), currency: "USD" }).toFixed(2)).toBe("0.00");
    expect(computeFee({ amount: dec("33.33"), percent: "0.5", currency: "USD" }).toFixed(2)).toBe("0.17");
  });

  it("converts at a rate with 6+ decimals and back", () => {
    expect(receivedAt(dec("100"), dec("1.699999"), "AZN").toFixed(2)).toBe("170.00");
    expect(receivedAt(dec("1234.56"), dec("1.7"), "AZN").toFixed(2)).toBe("2098.75");
    expect(givenFor(dec("170"), dec("1.7"), "USD").toFixed(2)).toBe("100.00");
    expect(receivedAt(dec("100.55"), dec("147.31"), "JPY").toFixed(0)).toBe("14812");
  });
});
