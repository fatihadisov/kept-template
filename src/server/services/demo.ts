import { type ISODate, addDays, addMonths, daysInMonth, formatISO, parseISO, startOfMonth } from "@/lib/finance/dates";
import { billOccurrences } from "@/lib/finance/forecast";
import type { TransactionInputRaw } from "@/lib/validation";
import type { Db } from "../db";
import { billsOf } from "../load";
import { createAccount } from "./accounts";
import { upsertBudget } from "./catalog";
import { type Ctx, makeCtx } from "./context";
import { allocateToGoal, createGoal } from "./goals";
import { createIncomeSource } from "./income";
import { addRate } from "./rates";
import { createRecurring, markRecurringPaid } from "./recurring";
import { completeOnboarding, setStrategy, updateSettings } from "./settings";
import { createTransaction } from "./transactions";

/** Small deterministic PRNG so the demo looks the same every time. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS_BACK = 8;

export async function isEmpty(db: Db): Promise<boolean> {
  return (await db.account.count()) === 0;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface DemoEvent {
  date: ISODate;
  input: TransactionInputRaw;
}

/**
 * Fills an empty database with ~8 months of believable example data: two salaries in different
 * currencies, cards + cash, conversions, transfers, recurring bills, goals and budgets.
 * Everything goes through the same services as real use, so the numbers are consistent by construction.
 */
export async function seedDemo(db: Db, now: Date = new Date()): Promise<void> {
  if (!(await isEmpty(db))) throw new Error("The database already has data; refusing to add demo data on top of it.");
  const rand = mulberry32(20260930);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const money = (lo: number, hi: number, step = 0.5) => (Math.round(between(lo, hi) / step) * step).toFixed(2);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

  let ctx: Ctx = await makeCtx(db, now);
  const today = ctx.today;
  const start = addMonths(startOfMonth(today), -MONTHS_BACK);
  await updateSettings(db, { timezone: ctx.data.settings.timezone });

  /* ---------- rates (with a bit of history and a card-specific rate) ---------- */
  await addRate(db, { from: "USD", to: "AZN", rate: "1.70", effectiveFrom: start, note: "Official rate" });
  await addRate(db, { from: "AZN", to: "USD", rate: "0.588235", effectiveFrom: start });

  /* ---------- accounts, each with money that was already there ---------- */
  const usdCard = (await createAccount(db, { name: "USD card", nickname: "Dollar card", type: "CARD", currency: "USD", openingBalance: "1200", openingDate: start, openingKind: "PREVIOUS_SAVINGS" })).id;
  const aznCard = (await createAccount(db, { name: "AZN card", nickname: "Everyday", type: "CARD", currency: "AZN", openingBalance: "2500", openingDate: start, openingKind: "EXISTING_FUNDS" })).id;
  const cashAzn = (await createAccount(db, { name: "Cash AZN", type: "CASH", currency: "AZN", openingBalance: "400", openingDate: start })).id;
  const cashUsd = (await createAccount(db, { name: "Cash USD", type: "CASH", currency: "USD", openingBalance: "300", openingDate: start, openingKind: "PREVIOUS_SAVINGS" })).id;
  const savings = (await createAccount(db, { name: "Savings", type: "SAVINGS", currency: "AZN", openingBalance: "6000", openingDate: start, openingKind: "PREVIOUS_SAVINGS" })).id;
  await addRate(db, { from: "USD", to: "AZN", rate: "1.69", effectiveFrom: start, accountId: usdCard, note: "What this card actually pays" });

  /* ---------- two salaries + a side income ---------- */
  const streamA = (
    await createIncomeSource(db, {
      name: "Remote job",
      currency: "USD",
      expectedAmount: "1500",
      scheduleType: "MONTHLY",
      scheduleDays: [5],
      scheduleAnchor: start,
      destinationAccountId: usdCard,
    })
  ).id;
  const streamB = (
    await createIncomeSource(db, {
      name: "Local job",
      currency: "AZN",
      expectedAmount: "1500",
      scheduleType: "MONTHLY",
      scheduleDays: [15],
      scheduleAnchor: start,
      destinationAccountId: aznCard,
    })
  ).id;
  const freelance = (
    await createIncomeSource(db, { name: "Freelance", kind: "SIDE", currency: "AZN", scheduleType: "NONE", destinationAccountId: aznCard })
  ).id;

  ctx = await makeCtx(db, now);
  const cat = (name: string) => ctx.data.categories.find((c) => c.name === name)!.id;
  const C = {
    food: cat("Food & Groceries"),
    eat: cat("Restaurants & Cafes"),
    transport: cat("Transport"),
    car: cat("Car & Maintenance"),
    shop: cat("Shopping"),
    fun: cat("Entertainment"),
    travel: cat("Travel"),
    home: cat("Rent & Utilities"),
    health: cat("Health & Fitness"),
    subs: cat("Subscriptions"),
    family: cat("Family & Gifts"),
    other: cat("Other"),
  };

  /* ---------- recurring bills ---------- */
  const recurring = {
    rent: await createRecurring(db, { description: "Rent", amount: "750", currency: "AZN", accountId: aznCard, categoryId: C.home, frequency: "MONTHLY", interval: 1, dayOfMonth: 1, startDate: start, sourceShares: { [streamA]: 60, [streamB]: 40 } }),
    internet: await createRecurring(db, { description: "Home internet", amount: "25", currency: "AZN", accountId: aznCard, categoryId: C.home, frequency: "MONTHLY", interval: 1, dayOfMonth: 12, startDate: start }),
    phone: await createRecurring(db, { description: "Phone plan", amount: "18", currency: "AZN", accountId: aznCard, categoryId: C.other, frequency: "MONTHLY", interval: 1, dayOfMonth: 3, startDate: start }),
    gym: await createRecurring(db, { description: "Gym membership", amount: "55", currency: "AZN", accountId: aznCard, categoryId: C.health, frequency: "MONTHLY", interval: 1, dayOfMonth: 10, startDate: start }),
    streaming: await createRecurring(db, { description: "Streaming", amount: "11.99", currency: "USD", accountId: usdCard, categoryId: C.subs, frequency: "MONTHLY", interval: 1, dayOfMonth: 18, startDate: start }),
    insurance: await createRecurring(db, { description: "Car insurance", amount: "380", currency: "AZN", accountId: aznCard, categoryId: C.car, frequency: "YEARLY", interval: 1, startDate: addDays(addMonths(startOfMonth(today), 3), 3) }),
  };

  /* ---------- the monthly story ---------- */
  const events: DemoEvent[] = [];
  const add = (date: ISODate, input: DistributiveOmit<TransactionInputRaw, "date">) => {
    if (date >= start && date <= today) events.push({ date, input: { ...input, date } as TransactionInputRaw });
  };

  for (let m = 0; m <= MONTHS_BACK; m += 1) {
    const ms = addMonths(start, m);
    const { y, m: mo } = parseISO(ms);
    const day = (d: number) => formatISO(y, mo, Math.min(d, daysInMonth(y, mo)));
    const months = MONTHS_BACK - m; // months ago

    // salary A: usually on the 5th; once late and in two parts
    if (months === 3) {
      add(day(8), { type: "INCOME", accountId: usdCard, amount: "900.00", incomeSourceId: streamA, expectedDate: day(5), description: "Salary (first part)" });
      add(day(12), { type: "INCOME", accountId: usdCard, amount: "600.00", incomeSourceId: streamA, expectedDate: day(5), description: "Salary (rest)" });
    } else {
      const amount = months === 1 ? "1650.00" : "1500.00"; // a raise
      add(day(5 + (rand() < 0.2 ? 1 : 0)), { type: "INCOME", accountId: usdCard, amount, incomeSourceId: streamA, expectedDate: day(5), description: "Salary" });
    }
    // salary B on the 15th, with a bonus now and then
    add(day(15), { type: "INCOME", accountId: aznCard, amount: months === 2 ? "1800.00" : "1500.00", incomeSourceId: streamB, expectedDate: day(15), description: months === 2 ? "Salary + bonus" : "Salary" });
    // freelance, irregular
    if (rand() < 0.65) add(day(Math.floor(between(18, 27))), { type: "INCOME", accountId: aznCard, amount: money(150, 650, 10), incomeSourceId: freelance, expectedDate: null, description: pick(["Logo design", "Website fix", "Translation", "Photo shoot"]) });

    // moving money around: convert dollars, fill the cash wallet, top up savings
    add(day(7), { type: "EXCHANGE", accountId: usdCard, toAccountId: aznCard, amount: "800.00", toAmount: "1352.00", description: "Dollars → manat" });
    add(day(8), { type: "EXCHANGE", accountId: usdCard, toAccountId: cashAzn, amount: "200.00", toAmount: "336.00", feeFixed: "0.50", description: "ATM withdrawal" });
    add(day(16), { type: "TRANSFER", accountId: aznCard, toAccountId: savings, amount: (months % 3 === 0 ? "300.00" : "500.00"), description: "To savings" });
    add(day(10), { type: "TRANSFER", accountId: aznCard, toAccountId: cashAzn, amount: "150.00", description: "Cash for the week" });

    // recurring bills, recorded as paid (the future ones stay open)
    // (done below with markRecurringPaid so they carry their schedule link)

    // groceries
    for (let i = 0; i < 10; i += 1) {
      const cash = rand() < 0.35;
      add(day(Math.floor(between(1, 29))), {
        type: "EXPENSE",
        accountId: cash ? cashAzn : aznCard,
        amount: money(16, 78, 0.5),
        categoryId: C.food,
        description: pick(["Weekly groceries", "Supermarket", "Fruit & vegetables", "Bakery", "Market"]),
      });
    }
    // eating out
    for (let i = 0; i < 8; i += 1) {
      add(day(Math.floor(between(1, 29))), {
        type: "EXPENSE",
        accountId: rand() < 0.5 ? cashAzn : aznCard,
        amount: money(9, 52, 0.5),
        categoryId: C.eat,
        description: pick(["Coffee", "Lunch", "Dinner with friends", "Pizza", "Brunch", "Takeaway"]),
        ...(rand() < 0.15 ? { tags: ["friends"] } : {}),
      });
    }
    // transport
    for (let i = 0; i < 11; i += 1) {
      add(day(Math.floor(between(1, 29))), {
        type: "EXPENSE",
        accountId: rand() < 0.6 ? cashAzn : aznCard,
        amount: money(1.5, 12, 0.5),
        categoryId: C.transport,
        description: pick(["Metro", "Taxi", "Bus", "Taxi home"]),
      });
    }
    // car
    add(day(Math.floor(between(3, 12))), { type: "EXPENSE", accountId: aznCard, amount: money(38, 64, 1), categoryId: C.car, description: "Fuel" });
    add(day(Math.floor(between(18, 27))), { type: "EXPENSE", accountId: aznCard, amount: money(38, 64, 1), categoryId: C.car, description: "Fuel" });
    if (rand() < 0.3) add(day(Math.floor(between(5, 25))), { type: "EXPENSE", accountId: aznCard, amount: money(90, 260, 5), categoryId: C.car, description: pick(["Oil change", "Car wash & polish", "Tyre repair"]) });
    // shopping (one in dollars, from the dollar card)
    for (let i = 0; i < 3; i += 1) {
      add(day(Math.floor(between(2, 28))), { type: "EXPENSE", accountId: aznCard, amount: money(40, 210, 5), categoryId: C.shop, description: pick(["Clothes", "Shoes", "Home stuff", "Electronics accessory"]) });
    }
    if (rand() < 0.5) add(day(Math.floor(between(2, 28))), { type: "EXPENSE", accountId: usdCard, amount: money(15, 60, 1), categoryId: C.shop, description: "Online order", tags: ["online"] });
    // fun
    for (let i = 0; i < 2; i += 1) {
      add(day(Math.floor(between(2, 28))), { type: "EXPENSE", accountId: rand() < 0.5 ? cashAzn : aznCard, amount: money(10, 55, 1), categoryId: C.fun, description: pick(["Cinema", "Concert tickets", "Bowling", "Book", "Game"]) });
    }
    // health, family, utilities
    if (rand() < 0.6) add(day(Math.floor(between(2, 28))), { type: "EXPENSE", accountId: aznCard, amount: money(9, 42, 0.5), categoryId: C.health, description: "Pharmacy" });
    add(day(Math.floor(between(17, 24))), { type: "EXPENSE", accountId: aznCard, amount: money(55, 125, 1), categoryId: C.home, description: "Utilities" });
    if (rand() < 0.55) add(day(Math.floor(between(2, 28))), { type: "EXPENSE", accountId: aznCard, amount: money(30, 120, 5), categoryId: C.family, description: pick(["Birthday gift", "Gift for mum", "Family dinner"]), tags: ["gift"] });
    if (rand() < 0.25) add(day(Math.floor(between(2, 28))), { type: "EXPENSE", accountId: cashAzn, amount: money(5, 30, 1), categoryId: C.other, description: "Miscellaneous" });
  }

  // a trip paid in dollars, a returned item, and a tiny cash correction
  add(addDays(today, -62), { type: "EXPENSE", accountId: usdCard, amount: "286.40", categoryId: C.travel, description: "Flights to Istanbul", tags: ["trip"] });
  add(addDays(today, -58), { type: "EXPENSE", accountId: cashUsd, amount: "120.00", categoryId: C.travel, description: "Hotel (cash)", tags: ["trip"] });
  add(addDays(today, -56), { type: "EXPENSE", accountId: aznCard, amount: "64.00", currency: "USD", accountAmount: "109.20", categoryId: C.eat, description: "Dinners abroad", tags: ["trip"] });
  add(addDays(today, -41), { type: "EXPENSE", accountId: aznCard, amount: "129.00", categoryId: C.shop, description: "Sneakers — wrong size" });
  add(addDays(today, -33), { type: "ADJUSTMENT", accountId: cashAzn, amount: "-12.40", description: "Counted the cash wallet", subtype: "COUNT" });

  events.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  ctx = await makeCtx(db, now);
  let sneakers: string | null = null;
  for (const e of events) {
    const { id } = await createTransaction(db, e.input, { ctx, confirm: true });
    if (e.input.type === "EXPENSE" && e.input.description === "Sneakers — wrong size") sneakers = id;
  }
  if (sneakers) {
    await createTransaction(db, { type: "REFUND", date: addDays(today, -37), accountId: aznCard, amount: "129.00", refundOfId: sneakers, description: "Returned" }, { ctx, confirm: true });
  }

  // recurring bills that fell due: record them as paid (autopay), leave the upcoming ones open
  for (const r of Object.values(recurring)) {
    const fresh = await makeCtx(db, now);
    const tpl = fresh.data.recurring.find((x) => x.id === r.id)!;
    const bill = billsOf(fresh.data).find((b) => b.id === tpl.id)!;
    for (const o of billOccurrences(fresh.ledger, bill, { from: start, to: today }, today)) {
      if (o.status === "paid") continue;
      // leave the most recent open occurrence unpaid so the "upcoming / overdue" widgets have something to show
      if (tpl.id === recurring.internet.id && o.dueDate >= addDays(today, -7)) continue;
      await markRecurringPaid(db, tpl.id, o.dueDate, {}, { confirm: true });
    }
  }

  /* ---------- goals, budgets, strategy ---------- */
  const car = await createGoal(db, { name: "Buy a car", kind: "RESERVE", targetAmount: "30000", currency: "AZN", targetDate: addMonths(today, 20), priority: 2, icon: "car", color: "#7487DA" });
  const emergency = await createGoal(db, { name: "Emergency fund", kind: "EMERGENCY", targetAmount: "10800", currency: "AZN", priority: 1, isPrimary: true, icon: "life-buoy", color: "#4E8D6E", note: "6 months of essential costs" });
  const trip = await createGoal(db, { name: "Summer trip", kind: "RESERVE", targetAmount: "4000", currency: "AZN", targetDate: addMonths(today, 7), priority: 3, icon: "plane", color: "#EA9B4E" });
  await createGoal(db, { name: "Reach 50,000 in savings", kind: "TOTAL", targetAmount: "50000", currency: "AZN", priority: 3, icon: "mountain", color: "#9A7BD6" });
  await allocateToGoal(db, { goalId: emergency.id, amount: "4500", date: addMonths(today, -3) });
  await allocateToGoal(db, { goalId: car.id, amount: "5000", date: addMonths(today, -2) });
  await allocateToGoal(db, { goalId: trip.id, amount: "1200", date: addDays(today, -20) });

  for (const [name, amount] of [["Food & Groceries", "450"], ["Restaurants & Cafes", "280"], ["Shopping", "220"], ["Entertainment", "100"], ["Transport", "150"]] as const) {
    await upsertBudget(db, { categoryId: cat(name), amount });
  }
  await upsertBudget(db, { categoryId: null, amount: "2900" });
  await setStrategy(db, "SAVE_ALL", { EMERGENCY_FIRST: { essentialMonthly: "1800", months: 6 }, FIXED_MONTHLY: { amount: "1500" }, PERCENT_TARGET: { percent: 35 } });
  await completeOnboarding(db);
}
