import { z } from "zod";
import { isISODate } from "./finance/dates";
import { dec, parseAmountInput } from "./finance/money";

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

const MAX_AMOUNT = dec("1000000000000"); // 1 trillion: a sanity bound, not a business rule

/** A date as "YYYY-MM-DD". */
export const isoDate = z.string().refine(isISODate, "Enter a valid date");

export const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm")
  .nullish();

const id = z.string().min(1, "Required");

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #4E8D6E");
/** an income-source colour: a theme-aware slot letter, or a custom hex */
const sourceColor = z.string().regex(/^([a-f]|#[0-9a-fA-F]{6})$/, "Pick a colour");

/** Parses what a person types ("1 234,56") into a normalised decimal string. */
function decimalText(message = "Enter a number") {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      const parsed = parseAmountInput(value);
      if (!parsed) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      if (parsed.abs().gt(MAX_AMOUNT)) {
        ctx.addIssue({ code: "custom", message: "That number is too large" });
        return z.NEVER;
      }
      return parsed.toFixed();
    });
}

export const positiveAmount = decimalText().refine((v) => dec(v).gt(0), "Must be greater than zero");
export const nonNegativeAmount = decimalText().refine((v) => dec(v).gte(0), "Cannot be negative");
export const signedAmount = decimalText().refine((v) => !dec(v).isZero(), "Cannot be zero");

/** Exchange rate: positive, up to 10 decimal places (>= 6 are always preserved). */
export const rateText = decimalText("Enter a rate")
  .refine((v) => dec(v).gt(0), "Rate must be greater than zero")
  .refine((v) => (dec(v).decimalPlaces() ?? 0) <= 10, "At most 10 decimal places");

const percentText = decimalText("Enter a percentage").refine((v) => dec(v).gte(0) && dec(v).lte(100), "Between 0 and 100");

const description = z.string().trim().max(200, "Keep it under 200 characters").default("");
const notes = z.string().trim().max(2000).nullish();
const tags = z
  .array(z.string().trim().min(1).max(30))
  .max(12)
  .default([])
  .transform((list) => [...new Set(list.map((t) => t.toLowerCase()))]);

/* ------------------------------------------------------------------ */
/* Transactions                                                         */
/* ------------------------------------------------------------------ */

/** AUTO = attribution follows the money in the paying account. MANUAL = explicit split by income source. */
export const attributionInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("AUTO") }),
  z.object({
    mode: z.literal("MANUAL"),
    allocations: z.array(z.object({ sourceId: id, amount: positiveAmount })).min(1, "Choose at least one source"),
  }),
]);
export type AttributionInput = z.infer<typeof attributionInput>;

const base = {
  date: isoDate,
  time: timeOfDay,
  description,
  notes,
  tags,
};

export const incomeInput = z.object({
  type: z.literal("INCOME"),
  ...base,
  accountId: id,
  amount: positiveAmount,
  incomeSourceId: id,
  /** the scheduled pay date this receipt settles; omit to auto-detect, null for "unscheduled" */
  expectedDate: isoDate.nullish(),
  /** override the valuation rate (account currency -> base) frozen on this entry */
  rate: rateText.nullish(),
});

export const expenseInput = z.object({
  type: z.literal("EXPENSE"),
  ...base,
  accountId: id,
  amount: positiveAmount,
  /** currency of the price; defaults to the paying account's currency */
  currency: currencyCode.nullish(),
  /** what actually left the account when `currency` differs from the account's; computed from rates if omitted */
  accountAmount: positiveAmount.nullish(),
  categoryId: id.nullish(),
  attribution: attributionInput.default({ mode: "AUTO" }),
  rate: rateText.nullish(),
  recurringId: id.nullish(),
  dueDate: isoDate.nullish(),
});

export const refundInput = z.object({
  type: z.literal("REFUND"),
  ...base,
  accountId: id,
  amount: positiveAmount,
  currency: currencyCode.nullish(),
  accountAmount: positiveAmount.nullish(),
  refundOfId: id.nullish(),
  categoryId: id.nullish(),
  attribution: attributionInput.default({ mode: "AUTO" }),
  rate: rateText.nullish(),
});

export const transferInput = z.object({
  type: z.literal("TRANSFER"),
  ...base,
  accountId: id,
  toAccountId: id,
  amount: positiveAmount,
  feeFixed: nonNegativeAmount.nullish(),
  feePercent: percentText.nullish(),
  attribution: attributionInput.default({ mode: "AUTO" }),
});

export const exchangeInput = z.object({
  type: z.literal("EXCHANGE"),
  ...base,
  accountId: id,
  toAccountId: id,
  /** debited from the origin account, excluding the fee */
  amount: positiveAmount,
  /** credited to the destination account */
  toAmount: positiveAmount,
  feeFixed: nonNegativeAmount.nullish(),
  feePercent: percentText.nullish(),
  attribution: attributionInput.default({ mode: "AUTO" }),
});

export const openingInput = z.object({
  type: z.literal("OPENING"),
  ...base,
  accountId: id,
  amount: nonNegativeAmount,
  subtype: z.enum(["EXISTING_FUNDS", "PREVIOUS_SAVINGS"]).default("EXISTING_FUNDS"),
  rate: rateText.nullish(),
});

export const adjustmentInput = z.object({
  type: z.literal("ADJUSTMENT"),
  ...base,
  accountId: id,
  /** signed difference to apply to the account balance */
  amount: signedAmount,
  subtype: z.string().trim().max(40).nullish(),
  attribution: attributionInput.default({ mode: "AUTO" }),
  rate: rateText.nullish(),
});

export const transactionInput = z.discriminatedUnion("type", [
  incomeInput,
  expenseInput,
  refundInput,
  transferInput,
  exchangeInput,
  openingInput,
  adjustmentInput,
]);

export type TransactionInput = z.infer<typeof transactionInput>;
export type TransactionInputRaw = z.input<typeof transactionInput>;
export type IncomeInput = z.infer<typeof incomeInput>;
export type ExpenseInput = z.infer<typeof expenseInput>;
export type RefundInput = z.infer<typeof refundInput>;
export type TransferInput = z.infer<typeof transferInput>;
export type ExchangeInput = z.infer<typeof exchangeInput>;
export type OpeningInput = z.infer<typeof openingInput>;
export type AdjustmentInput = z.infer<typeof adjustmentInput>;

/* ------------------------------------------------------------------ */
/* Accounts, income streams, categories                                 */
/* ------------------------------------------------------------------ */

export const accountInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  type: z.enum(["CARD", "CASH", "SAVINGS", "OTHER"]),
  currency: currencyCode,
  nickname: z.string().trim().max(40).nullish(),
  color: hexColor.nullish(),
  /** money already in the account when you start tracking; recorded as existing funds, never as income */
  openingBalance: nonNegativeAmount.nullish(),
  openingDate: isoDate.nullish(),
  openingKind: z.enum(["EXISTING_FUNDS", "PREVIOUS_SAVINGS"]).default("EXISTING_FUNDS"),
  /** value of 1 unit of this currency in the base currency; used if no rate is configured yet */
  rateToBase: rateText.nullish(),
});
export type AccountInput = z.infer<typeof accountInput>;
export type AccountInputRaw = z.input<typeof accountInput>;

export const scheduleTypes = ["MONTHLY", "SEMI_MONTHLY", "BIWEEKLY", "WEEKLY", "ONCE", "NONE"] as const;

export const incomeSourceInput = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(60),
    kind: z.enum(["SALARY", "BONUS", "SIDE", "OTHER"]).default("SALARY"),
    currency: currencyCode,
    expectedAmount: nonNegativeAmount.nullish(),
    scheduleType: z.enum(scheduleTypes).default("NONE"),
    scheduleDays: z.array(z.number().int().min(0).max(31)).max(2).default([]),
    scheduleAnchor: isoDate.nullish(),
    scheduleEnd: isoDate.nullish(),
    destinationAccountId: id.nullish(),
    color: sourceColor.nullish(),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if ((v.scheduleType === "MONTHLY" || v.scheduleType === "SEMI_MONTHLY") && v.scheduleDays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["scheduleDays"], message: "Pick the day of the month" });
    }
    if (v.scheduleType === "SEMI_MONTHLY" && v.scheduleDays.length !== 2) {
      ctx.addIssue({ code: "custom", path: ["scheduleDays"], message: "Pick two days" });
    }
    if ((v.scheduleType === "BIWEEKLY" || v.scheduleType === "ONCE") && !v.scheduleAnchor) {
      ctx.addIssue({ code: "custom", path: ["scheduleAnchor"], message: "Pick a pay date" });
    }
  });
export type IncomeSourceInput = z.infer<typeof incomeSourceInput>;
export type IncomeSourceInputRaw = z.input<typeof incomeSourceInput>;

export const categoryInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(40),
  icon: z.string().min(1).max(40).default("circle"),
  color: hexColor.default("#A5A8AE"),
  bucket: z.enum(["NEEDS", "WANTS", "OTHER"]).default("WANTS"),
});
export type CategoryInput = z.infer<typeof categoryInput>;
export type CategoryInputRaw = z.input<typeof categoryInput>;

/* ------------------------------------------------------------------ */
/* Goals, budgets, recurring, rates, settings                           */
/* ------------------------------------------------------------------ */

export const goalInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  kind: z.enum(["RESERVE", "TOTAL", "EMERGENCY"]).default("RESERVE"),
  targetAmount: positiveAmount,
  currency: currencyCode,
  targetDate: isoDate.nullish(),
  priority: z.number().int().min(1).max(3).default(2),
  isPrimary: z.boolean().default(false),
  icon: z.string().min(1).max(40).default("target"),
  color: hexColor.nullish(),
  note: z.string().trim().max(500).nullish(),
});
export type GoalInput = z.infer<typeof goalInput>;
export type GoalInputRaw = z.input<typeof goalInput>;

export const goalAllocationInput = z.object({
  goalId: id,
  /** positive = reserve money for the goal, negative = release it */
  amount: signedAmount,
  date: isoDate,
  note: z.string().trim().max(200).nullish(),
});
export type GoalAllocationInput = z.infer<typeof goalAllocationInput>;
export type GoalAllocationInputRaw = z.input<typeof goalAllocationInput>;

export const budgetInput = z.object({
  categoryId: id.nullish(),
  amount: positiveAmount,
});
export type BudgetInput = z.infer<typeof budgetInput>;

export const recurringInput = z.object({
  description: z.string().trim().min(1, "Give it a name").max(100),
  amount: positiveAmount,
  currency: currencyCode,
  accountId: id,
  categoryId: id.nullish(),
  frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]).default("MONTHLY"),
  interval: z.number().int().min(1).max(24).default(1),
  dayOfMonth: z.number().int().min(1).max(31).nullish(),
  startDate: isoDate,
  endDate: isoDate.nullish(),
  /** { sourceId: percent } — omit for automatic attribution */
  sourceShares: z.record(z.string(), z.number().min(0).max(100)).nullish(),
  tags,
  notes,
  isActive: z.boolean().default(true),
});
export type RecurringInput = z.infer<typeof recurringInput>;
export type RecurringInputRaw = z.input<typeof recurringInput>;

export const rateInput = z
  .object({
    from: currencyCode,
    to: currencyCode,
    rate: rateText,
    effectiveFrom: isoDate,
    accountId: id.nullish(),
    note: z.string().trim().max(120).nullish(),
    /** also record the opposite direction as the reciprocal (global rates only) */
    alsoInverse: z.boolean().optional(),
  })
  .refine((v) => v.from !== v.to, { message: "Pick two different currencies", path: ["to"] });
export type RateInput = z.infer<typeof rateInput>;
export type RateInputRaw = z.input<typeof rateInput>;

export const settingsInput = z
  .object({
    baseCurrency: currencyCode,
    timezone: z.string().min(1).refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    locale: z.enum(["en-US", "en-GB", "az-AZ", "tr-TR", "ru-RU", "de-DE"]),
    reportingMode: z.enum(["MONTH", "CYCLE"]),
    cycleStartDay: z.number().int().min(1).max(31),
    weekStartsOn: z.number().int().min(0).max(1),
    deductUpcomingBills: z.boolean(),
    upcomingBillsDays: z.number().int().min(1).max(120),
    forecastSpending: nonNegativeAmount.nullable(),
  })
  .partial();
export type SettingsPatch = z.infer<typeof settingsInput>;

export const strategyConfigInput = z.object({
  PERCENT_TARGET: z.object({ percent: z.number().min(0).max(100) }).partial().optional(),
  FIXED_MONTHLY: z.object({ amount: nonNegativeAmount }).partial().optional(),
  BUDGET_50_30_20: z
    .object({ needs: z.number().min(0).max(100), wants: z.number().min(0).max(100), savings: z.number().min(0).max(100) })
    .partial()
    .optional(),
  EMERGENCY_FIRST: z
    .object({ essentialMonthly: nonNegativeAmount, months: z.number().int().min(1).max(60) })
    .partial()
    .optional(),
});
export type StrategyConfigPatch = z.infer<typeof strategyConfigInput>;

/** Flatten a ZodError into { "field.path": "first message" } for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
