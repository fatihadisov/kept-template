import type { ISODate } from "./finance/dates";
import type { StrategyConfigs, StrategyId } from "./finance/savings";

/**
 * Plain, JSON-serialisable shapes of the app's entities. These are what server components pass to
 * client components; money is always a decimal string.
 */

export interface SettingsView {
  baseCurrency: string;
  timezone: string;
  locale: string;
  reportingMode: "MONTH" | "CYCLE";
  cycleStartDay: number;
  weekStartsOn: number;
  activeStrategy: StrategyId;
  strategyConfig: StrategyConfigs;
  deductUpcomingBills: boolean;
  upcomingBillsDays: number;
  forecastSpending: string | null;
  onboarded: boolean;
}

export type AccountKind = "CARD" | "CASH" | "SAVINGS" | "OTHER";

export interface AccountView {
  id: string;
  name: string;
  type: AccountKind;
  currency: string;
  nickname: string | null;
  color: string | null;
  archived: boolean;
  sortOrder: number;
}

export interface SourceView {
  id: string;
  name: string;
  kind: string;
  isSystem: boolean;
  currency: string;
  expectedAmount: string | null;
  scheduleType: string;
  scheduleDays: number[];
  scheduleAnchor: ISODate | null;
  scheduleEnd: ISODate | null;
  destinationAccountId: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
}

export type Bucket = "NEEDS" | "WANTS" | "OTHER";

export interface CategoryView {
  id: string;
  name: string;
  icon: string;
  color: string;
  bucket: Bucket;
  archived: boolean;
  sortOrder: number;
}

export interface RateRecord {
  id: string;
  from: string;
  to: string;
  rate: string;
  effectiveFrom: ISODate;
  accountId: string | null;
  note: string | null;
  createdAt: string;
}

export interface GoalView {
  id: string;
  name: string;
  kind: "RESERVE" | "TOTAL" | "EMERGENCY";
  targetAmount: string;
  currency: string;
  targetDate: ISODate | null;
  priority: number;
  isPrimary: boolean;
  icon: string;
  color: string | null;
  note: string | null;
  archived: boolean;
  createdAt: string;
  allocations: { id: string; date: ISODate; amount: string; note: string | null }[];
}

export interface BudgetView {
  id: string;
  categoryId: string | null;
  amount: string;
  isActive: boolean;
}

export interface RecurringView {
  id: string;
  description: string;
  amount: string;
  currency: string;
  accountId: string;
  categoryId: string | null;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  dayOfMonth: number | null;
  startDate: ISODate;
  endDate: ISODate | null;
  isActive: boolean;
  skippedDates: ISODate[];
  sourceShares: Record<string, number> | null;
  tags: string[];
  notes: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountKind, string> = {
  CARD: "Card",
  CASH: "Cash",
  SAVINGS: "Savings",
  OTHER: "Other",
};

export interface Warning {
  code: "OVERDRAFT" | "RATE_DEVIATION" | "OVER_RESERVED" | "REFUND_EXCEEDS" | "MISSING_RATE";
  message: string;
  accountId?: string;
}

/** Standard result of every mutation (server actions / services). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; warnings?: Warning[] };
