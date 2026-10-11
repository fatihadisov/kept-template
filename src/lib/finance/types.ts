import type { CurrencyCode } from "./currency";
import type { ISODate } from "./dates";
import type { Dec } from "./money";
import type { RateBook, RateRow } from "./rates";

export type TxType = "INCOME" | "EXPENSE" | "REFUND" | "TRANSFER" | "EXCHANGE" | "OPENING" | "ADJUSTMENT";

export const TX_TYPES: readonly TxType[] = ["INCOME", "EXPENSE", "REFUND", "TRANSFER", "EXCHANGE", "OPENING", "ADJUSTMENT"];

export type AccountType = "CARD" | "CASH" | "SAVINGS" | "OTHER";
export type SourceKind = "SALARY" | "BONUS" | "SIDE" | "OTHER" | "OPENING";
export type AllocationMode = "AUTO" | "MANUAL";

export interface LedgerAccount {
  id: string;
  name: string;
  type: AccountType | string;
  currency: CurrencyCode;
  archived: boolean;
  sortOrder: number;
}

export interface LedgerSource {
  id: string;
  name: string;
  kind: SourceKind | string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface LedgerAllocation {
  sourceId: string;
  /** in the paying account's currency */
  amount: string;
}

/** A transaction in the shape the engine and the UI both consume (all values are strings). */
export interface LedgerTx {
  id: string;
  type: TxType;
  date: ISODate;
  time?: string | null;
  /** ISO datetime; only used to order entries that share a date/time */
  createdAt: string;
  accountId: string;
  toAccountId?: string | null;
  amount: string;
  currency: CurrencyCode;
  accountAmount?: string | null;
  toAmount?: string | null;
  feeAmount?: string | null;
  /** the inputs the fee was computed from (kept so the entry can be edited faithfully) */
  feeFixed?: string | null;
  feePercent?: string | null;
  /** frozen valuation rates { CCY: rate-to-base } captured when the entry was recorded */
  fx?: Record<string, string> | null;
  exchangeRate?: string | null;
  categoryId?: string | null;
  incomeSourceId?: string | null;
  expectedDate?: ISODate | null;
  expectedAmount?: string | null;
  refundOfId?: string | null;
  recurringId?: string | null;
  dueDate?: ISODate | null;
  subtype?: string | null;
  description?: string;
  notes?: string | null;
  tags?: string[];
  allocationMode: AllocationMode;
  allocations: LedgerAllocation[];
}

export interface LedgerInput {
  baseCurrency: CurrencyCode;
  accounts: LedgerAccount[];
  sources: LedgerSource[];
  transactions: LedgerTx[];
  rates: RateRow[];
}

export type PostingRole = "MAIN" | "OUT" | "IN" | "FEE";

/** One line of the ledger: money moving in one account, attributed to one income source. */
export interface Posting {
  seq: number;
  txId: string;
  txType: TxType;
  date: ISODate;
  accountId: string;
  sourceId: string;
  /** the account's currency */
  currency: CurrencyCode;
  /** signed amount in the account's currency */
  amount: Dec;
  /** signed value in the base currency at the transaction's frozen rates */
  base: Dec;
  role: PostingRole;
}

/** Base-currency components of a transaction, valued at its frozen rates. */
export interface TxMetrics {
  /** INCOME received */
  incomeBase: Dec;
  /** OPENING funds introduced (not income) */
  openingBase: Dec;
  /** true cost of an EXPENSE (positive) or the cost reversed by a REFUND (negative) */
  expenseBase: Dec;
  /** realised currency loss (+) / gain (−): conversion spread, or account debit vs price difference */
  fxLossBase: Dec;
  /** explicit fees charged separately */
  feeBase: Dec;
  /** signed balance correction */
  adjustmentBase: Dec;
  /** unsigned base-currency value of the headline amount (what a list row shows as "≈ AZN") */
  principalBase: Dec;
}

export interface Part {
  sourceId: string;
  amount: Dec;
}

export interface ResolvedTx {
  tx: LedgerTx;
  seq: number;
  /** debit / outflow principal per income source, in the origin account's currency */
  parts: Part[];
  metrics: TxMetrics;
  /** frozen snapshot for the origin account currency, price currency, destination currency */
  accountCurrency: CurrencyCode;
  toCurrency?: CurrencyCode;
  /** exact principal moved out of / into accounts (account currency) */
  out: Dec;
  into: Dec;
  fee: Dec;
}

export type LedgerIssueCode =
  | "UNKNOWN_ACCOUNT"
  | "UNKNOWN_SOURCE"
  | "CURRENCY_MISMATCH"
  | "MISSING_RATE"
  | "BAD_ALLOCATION"
  | "BAD_AMOUNT";

export interface LedgerIssue {
  txId: string | null;
  code: LedgerIssueCode;
  message: string;
}

export interface Ledger {
  base: CurrencyCode;
  baseDecimals: number;
  accounts: Map<string, LedgerAccount>;
  sources: Map<string, LedgerSource>;
  /** id of the built-in "Existing funds" source */
  openingSourceId: string;
  /** source used when an account holds no attributable funds */
  defaultSourceId: string;
  rateRows: RateRow[];
  rates: RateBook;
  /** resolved transactions in ledger order */
  txs: ResolvedTx[];
  byId: Map<string, ResolvedTx>;
  postings: Posting[];
  issues: LedgerIssue[];
  /** currencies that needed a rate but had none configured (valued at 0) */
  missingRates: Set<CurrencyCode>;
}
