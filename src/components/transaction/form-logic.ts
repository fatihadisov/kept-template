import type { AppContextValue } from "@/components/app-provider";
import type { AccountView } from "@/lib/app-types";
import { computeFee, effectiveRate, receivedAt } from "@/lib/finance/conversion";
import { decimalsOf } from "@/lib/finance/currency";
import { distribute } from "@/lib/finance/distribute";
import { type Dec, ZERO, dec, parseAmountInput } from "@/lib/finance/money";
import { RateBook } from "@/lib/finance/rates";
import type { LedgerTx, TxType } from "@/lib/finance/types";
import type { TransactionInputRaw } from "@/lib/validation";

export type AttrMode = "AUTO" | "ONE" | "SPLIT";

/** Everything the Add / Edit form holds. Amounts are the raw text the person typed. */
export interface FormState {
  type: TxType;
  amount: string;
  /** currency of the price (expense / refund) */
  currency: string;
  /** what the account was actually charged, when the price currency differs from the account's */
  accountAmount: string;
  chargedTouched: boolean;
  toAmount: string;
  toTouched: boolean;
  accountId: string;
  toAccountId: string;
  categoryId: string | null;
  incomeSourceId: string;
  /** "auto" = detect from the schedule, "none" = an unscheduled receipt, otherwise the due date it settles */
  expected: string;
  date: string;
  description: string;
  notes: string;
  /** comma separated */
  tags: string;
  feeFixed: string;
  feePercent: string;
  attrMode: AttrMode;
  attrSource: string;
  /** sourceId -> amount text, in the paying account's currency */
  split: Record<string, string>;
  refundOfId: string | null;
  openingKind: "EXISTING_FUNDS" | "PREVIOUS_SAVINGS";
  /** correction, create mode: what the account really holds right now */
  actualBalance: string;
  /** correction, edit mode: the signed difference stored */
  signedDelta: string;
  /** override of the valuation rate frozen on the entry */
  rate: string;
  /** carried through edits untouched, so saving never breaks a link or loses data the form doesn't show */
  time: string | null;
  recurringId: string | null;
  dueDate: string | null;
}

export const parse = (text: string): Dec | null => parseAmountInput(text);

export function liveAccounts(app: AppContextValue): AccountView[] {
  return app.accounts.filter((a) => !a.archived);
}

export function realSources(app: AppContextValue) {
  return app.sources.filter((s) => !s.isSystem);
}

export function activeSources(app: AppContextValue) {
  return app.sources.filter((s) => !s.isSystem && s.isActive);
}

const accountById = (app: AppContextValue, id: string) => app.accounts.find((a) => a.id === id);

let bookCache: { rates: AppContextValue["rates"]; base: string; book: RateBook } | null = null;
/** The same rate book the server uses, so previews match what will be stored. */
export function rateBookOf(app: AppContextValue): RateBook {
  if (bookCache && bookCache.rates === app.rates && bookCache.base === app.settings.baseCurrency) return bookCache.book;
  const book = new RateBook(
    app.rates.map((r) => ({ from: r.from, to: r.to, rate: r.rate, effectiveFrom: r.effectiveFrom, accountId: r.accountId })),
    app.settings.baseCurrency,
  );
  bookCache = { rates: app.rates, base: app.settings.baseCurrency, book };
  return book;
}

/* ------------------------------------------------------------------ */
/* initial state                                                        */
/* ------------------------------------------------------------------ */

export function blankState(type: TxType, app: AppContextValue): FormState {
  const live = liveAccounts(app);
  const sources = activeSources(app);
  const preferred = live.find((a) => a.id === app.habits.expenseAccountId) ?? live[0];
  const source = sources.find((s) => s.id === app.habits.incomeSourceId) ?? sources[0];
  const destination = source?.destinationAccountId ? live.find((a) => a.id === source.destinationAccountId) : undefined;
  const incomeAccount = destination ?? live.find((a) => a.currency === source?.currency) ?? preferred;

  let accountId = preferred?.id ?? "";
  let toAccountId = "";
  if (type === "INCOME") accountId = incomeAccount?.id ?? accountId;
  if (type === "EXCHANGE") {
    const foreign = live.find((a) => a.currency !== app.settings.baseCurrency) ?? preferred;
    accountId = foreign?.id ?? accountId;
    toAccountId = live.find((a) => a.currency !== foreign?.currency)?.id ?? "";
  }
  if (type === "TRANSFER") {
    const from = preferred;
    accountId = from?.id ?? "";
    toAccountId = live.find((a) => a.id !== from?.id && a.currency === from?.currency)?.id ?? "";
  }

  const account = accountById(app, accountId);
  return {
    type,
    amount: "",
    currency: account?.currency ?? app.settings.baseCurrency,
    accountAmount: "",
    chargedTouched: false,
    toAmount: "",
    toTouched: false,
    accountId,
    toAccountId,
    categoryId: null,
    incomeSourceId: source?.id ?? "",
    expected: "auto",
    date: app.today,
    description: "",
    notes: "",
    tags: "",
    feeFixed: "",
    feePercent: "",
    attrMode: "AUTO",
    attrSource: sources[0]?.id ?? "",
    split: {},
    refundOfId: null,
    openingKind: "EXISTING_FUNDS",
    actualBalance: "",
    signedDelta: "",
    rate: "",
    time: null,
    recurringId: null,
    dueDate: null,
  };
}

export function stateFromTx(tx: LedgerTx, app: AppContextValue): FormState {
  const base = blankState(tx.type, app);
  const manual = tx.allocationMode === "MANUAL" && tx.allocations.length > 0;
  return {
    ...base,
    type: tx.type,
    amount: tx.type === "ADJUSTMENT" ? "" : tx.amount,
    currency: tx.currency,
    accountAmount: tx.accountAmount ?? "",
    chargedTouched: Boolean(tx.accountAmount),
    toAmount: tx.toAmount ?? "",
    toTouched: true,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? "",
    categoryId: tx.categoryId ?? null,
    incomeSourceId: tx.incomeSourceId ?? base.incomeSourceId,
    expected: tx.type === "INCOME" ? (tx.expectedDate ?? "none") : "auto",
    date: tx.date,
    description: tx.description ?? "",
    notes: tx.notes ?? "",
    tags: (tx.tags ?? []).join(", "),
    feeFixed: tx.feeFixed ?? "",
    feePercent: tx.feePercent ?? "",
    attrMode: manual ? (tx.allocations.length === 1 ? "ONE" : "SPLIT") : "AUTO",
    attrSource: manual ? tx.allocations[0].sourceId : base.attrSource,
    split: manual ? Object.fromEntries(tx.allocations.map((a) => [a.sourceId, a.amount])) : {},
    refundOfId: tx.refundOfId ?? null,
    openingKind: tx.subtype === "PREVIOUS_SAVINGS" ? "PREVIOUS_SAVINGS" : "EXISTING_FUNDS",
    signedDelta: tx.type === "ADJUSTMENT" ? tx.amount : "",
    time: tx.time ?? null,
    recurringId: tx.recurringId ?? null,
    dueDate: tx.dueDate ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* quotes                                                               */
/* ------------------------------------------------------------------ */

export interface ChargeQuote {
  /** 1 price-currency = rate account-currency */
  rate: Dec | null;
  /** price converted at that rate */
  charged: Dec | null;
}

/** For a price in another currency than the paying account's: what the account would be charged at the usual rate. */
export function chargeQuote(app: AppContextValue, state: FormState): ChargeQuote {
  const account = accountById(app, state.accountId);
  const price = parse(state.amount);
  if (!account || account.currency === state.currency) return { rate: null, charged: null };
  const resolved = rateBookOf(app).rate(state.currency, account.currency, state.date, { accountId: account.id });
  if (!resolved) return { rate: null, charged: null };
  return { rate: resolved.rate, charged: price ? receivedAt(price, resolved.rate, account.currency) : null };
}

export interface ExchangeQuote {
  effective: Dec | null;
  usual: Dec | null;
  /** (effective / usual) - 1 */
  deviation: Dec | null;
  fee: Dec;
  /** from-amount the received money would need to be at the usual rate */
  suggestedReceived: Dec | null;
}

export function exchangeQuote(app: AppContextValue, state: FormState): ExchangeQuote {
  const from = accountById(app, state.accountId);
  const to = accountById(app, state.toAccountId);
  const given = parse(state.amount);
  const received = parse(state.toAmount);
  const effective = given && received && given.gt(0) ? effectiveRate(given, received) : null;
  const usual =
    from && to ? (rateBookOf(app).rate(from.currency, to.currency, state.date, { accountId: from.id })?.rate ?? null) : null;
  const fee = from && given ? computeFee({ amount: given, fixed: parse(state.feeFixed) ?? ZERO, percent: parse(state.feePercent) ?? ZERO, currency: from.currency }) : ZERO;
  return {
    effective,
    usual,
    deviation: effective && usual && usual.gt(0) ? effective.div(usual).minus(1) : null,
    fee,
    suggestedReceived: given && usual && to ? receivedAt(given, usual, to.currency) : null,
  };
}

/** The amount (in the paying account's currency) that attribution has to add up to. */
export function principalOf(app: AppContextValue, state: FormState): { amount: Dec | null; currency: string } {
  const account = accountById(app, state.accountId);
  const currency = account?.currency ?? app.settings.baseCurrency;
  if ((state.type === "EXPENSE" || state.type === "REFUND") && account && account.currency !== state.currency) {
    return { amount: parse(state.accountAmount), currency };
  }
  return { amount: parse(state.amount), currency };
}

/** What's left to allocate in a manual split. */
export function splitRemainder(app: AppContextValue, state: FormState): Dec | null {
  const { amount } = principalOf(app, state);
  if (!amount) return null;
  const used = Object.values(state.split).reduce((a, v) => a.plus(parse(v) ?? ZERO), ZERO);
  return amount.minus(used);
}

/** Evenly split `total` across `ids` as text (largest remainder, to the currency's minor unit). */
export function evenSplit(total: Dec, ids: string[], currency: string): Record<string, string> {
  const parts = distribute(total, ids.map(() => dec(1)), decimalsOf(currency));
  return Object.fromEntries(ids.map((id, i) => [id, parts[i].toFixed(decimalsOf(currency))]));
}

/* ------------------------------------------------------------------ */
/* state -> server payload                                              */
/* ------------------------------------------------------------------ */

export type BuildResult = { ok: true; input: TransactionInputRaw } | { ok: false; errors: Record<string, string> };

const tagsOf = (text: string) =>
  text
    .split(/[,#]/)
    .map((t) => t.trim())
    .filter(Boolean);

export function buildInput(state: FormState, app: AppContextValue, mode: "create" | "edit"): BuildResult {
  const errors: Record<string, string> = {};
  const account = accountById(app, state.accountId);
  if (!account) errors.accountId = "Choose an account";

  const needAmount = (value: string, key: string, allowZero = false) => {
    const d = parse(value);
    if (!d) errors[key] = "Enter an amount";
    else if (!allowZero && d.lte(0)) errors[key] = "Must be more than zero";
    return d;
  };

  const common = {
    date: state.date,
    time: state.time,
    description: state.description.trim(),
    notes: state.notes.trim() || null,
    tags: tagsOf(state.tags),
  };
  const rate = state.rate.trim() ? state.rate.trim() : null;

  const attribution = (): { mode: "AUTO" } | { mode: "MANUAL"; allocations: { sourceId: string; amount: string }[] } => {
    if (state.attrMode === "AUTO") return { mode: "AUTO" };
    const { amount } = principalOf(app, state);
    if (state.attrMode === "ONE") {
      if (!amount) return { mode: "AUTO" };
      return { mode: "MANUAL", allocations: [{ sourceId: state.attrSource, amount: amount.toFixed() }] };
    }
    const allocations = Object.entries(state.split)
      .map(([sourceId, text]) => ({ sourceId, amount: parse(text) }))
      .filter((a): a is { sourceId: string; amount: Dec } => a.amount !== null && a.amount.gt(0))
      .map((a) => ({ sourceId: a.sourceId, amount: a.amount.toFixed() }));
    if (allocations.length === 0) errors.attribution = "Enter how it was split";
    return { mode: "MANUAL", allocations };
  };

  let input: TransactionInputRaw | null = null;

  switch (state.type) {
    case "EXPENSE":
    case "REFUND": {
      needAmount(state.amount, "amount");
      const cross = account && account.currency !== state.currency;
      if (cross && state.accountAmount.trim()) needAmount(state.accountAmount, "accountAmount");
      if (cross && !state.accountAmount.trim() && !chargeQuote(app, state).charged) errors.accountAmount = `Enter how much ${account.currency} was charged`;
      const attr = attribution();
      if (state.attrMode === "SPLIT") {
        const left = splitRemainder(app, state);
        if (left && !left.isZero()) errors.attribution = `The split is ${left.gt(0) ? "short by" : "over by"} ${left.abs().toFixed(2)}`;
      }
      if (state.type === "EXPENSE") {
        input = {
          type: "EXPENSE",
          ...common,
          accountId: state.accountId,
          amount: state.amount,
          currency: state.currency,
          accountAmount: cross && state.accountAmount.trim() ? state.accountAmount : null,
          categoryId: state.categoryId,
          attribution: attr,
          rate,
          recurringId: state.recurringId,
          dueDate: state.dueDate,
        };
      } else {
        input = {
          type: "REFUND",
          ...common,
          accountId: state.accountId,
          amount: state.amount,
          currency: state.currency,
          accountAmount: cross && state.accountAmount.trim() ? state.accountAmount : null,
          refundOfId: state.refundOfId,
          categoryId: state.categoryId,
          attribution: attr,
          rate,
        };
      }
      break;
    }

    case "INCOME": {
      needAmount(state.amount, "amount");
      if (!state.incomeSourceId) errors.incomeSourceId = "Choose an income";
      input = {
        type: "INCOME",
        ...common,
        accountId: state.accountId,
        amount: state.amount,
        incomeSourceId: state.incomeSourceId,
        expectedDate: state.expected === "auto" ? undefined : state.expected === "none" ? null : state.expected,
        rate,
      };
      break;
    }

    case "TRANSFER":
    case "EXCHANGE": {
      needAmount(state.amount, "amount");
      const to = accountById(app, state.toAccountId);
      if (!to) errors.toAccountId = "Choose the destination";
      else if (to.id === state.accountId) errors.toAccountId = "Choose a different account";
      const attr = attribution();
      if (state.attrMode === "SPLIT") {
        const left = splitRemainder(app, state);
        if (left && !left.isZero()) errors.attribution = `The split is ${left.gt(0) ? "short by" : "over by"} ${left.abs().toFixed(2)}`;
      }
      const fees = { feeFixed: state.feeFixed.trim() || null, feePercent: state.feePercent.trim() || null };
      if (state.type === "TRANSFER") {
        if (account && to && account.currency !== to.currency) errors.toAccountId = "Use Exchange to convert between currencies";
        input = { type: "TRANSFER", ...common, accountId: state.accountId, toAccountId: state.toAccountId, amount: state.amount, ...fees, attribution: attr };
      } else {
        needAmount(state.toAmount, "toAmount");
        if (account && to && to.id !== account.id && account.currency === to.currency) errors.toAccountId = "Both hold the same currency: use Transfer";
        input = {
          type: "EXCHANGE",
          ...common,
          accountId: state.accountId,
          toAccountId: state.toAccountId,
          amount: state.amount,
          toAmount: state.toAmount,
          ...fees,
          attribution: attr,
        };
      }
      break;
    }

    case "OPENING": {
      needAmount(state.amount, "amount", true);
      input = { type: "OPENING", ...common, accountId: state.accountId, amount: state.amount, subtype: state.openingKind, rate };
      break;
    }

    case "ADJUSTMENT": {
      let delta: Dec | null;
      if (mode === "edit") {
        delta = parse(state.signedDelta);
        if (!delta || delta.isZero()) errors.amount = "Enter the difference";
      } else {
        const actual = parse(state.actualBalance);
        const current = dec(app.balances[state.accountId] ?? "0");
        if (!actual) errors.amount = "Enter what the account really holds";
        delta = actual ? actual.minus(current) : null;
        if (delta && delta.isZero()) errors.amount = "That already matches the account's balance";
      }
      input = {
        type: "ADJUSTMENT",
        ...common,
        accountId: state.accountId,
        amount: delta ? delta.toFixed() : "",
        subtype: "COUNT",
        attribution: attribution(),
        rate,
      };
      break;
    }
  }

  if (Object.keys(errors).length > 0 || !input) return { ok: false, errors };
  return { ok: true, input };
}
