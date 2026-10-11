import type { AccountView, Warning } from "@/lib/app-types";
import { computeFee, effectiveRate, receivedAt } from "@/lib/finance/conversion";
import { formatDateShort } from "@/lib/finance/dates";
import { formatMoney, formatPercent } from "@/lib/finance/format";
import { suggestExpectedDate } from "@/lib/finance/income";
import { buildLedger } from "@/lib/finance/ledger";
import { type Dec, ZERO, dec } from "@/lib/finance/money";
import { detectOverdrafts } from "@/lib/finance/queries";
import type { Ledger, LedgerAllocation, LedgerTx } from "@/lib/finance/types";
import { txToInput } from "@/lib/tx-input";
import {
  type AttributionInput,
  type TransactionInput,
  type TransactionInputRaw,
  transactionInput,
} from "@/lib/validation";
import { audit } from "../audit";
import type { Db, Prisma } from "../db";
import { NeedsConfirmation } from "../errors";
import { ledgerInputOf, rowToLedgerTx, streamsOf } from "../load";
import { type Ctx, fail, makeCtx, money, moneyStr, parseInput, rateStr, refreshLedger } from "./context";

export interface WriteOptions {
  /** the user has seen the warnings (overdraft, unusual rate...) and wants to go ahead */
  confirm?: boolean;
  /** reuse an in-memory context (bulk imports / seeding) instead of loading the database again */
  ctx?: Ctx;
}

/** A validated, normalised transaction ready to be stored (id / createdAt are assigned on write). */
export type Prepared = Omit<LedgerTx, "id" | "createdAt">;

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function requireAccount(ctx: Ctx, id: string, field: string, existing?: LedgerTx): AccountView {
  const account = ctx.accounts.get(id);
  if (!account) fail(field, "Choose an account");
  const keepsExisting = existing && (existing.accountId === id || existing.toAccountId === id);
  if (account.archived && !keepsExisting) fail(field, `${account.name} is archived`);
  return account;
}

function checkCategory(ctx: Ctx, id: string | null | undefined, existing?: LedgerTx): string | null {
  if (!id) return null;
  const category = ctx.categories.get(id);
  if (!category) fail("categoryId", "Unknown category");
  if (category.archived && existing?.categoryId !== id) fail("categoryId", `${category.name} is archived`);
  return id;
}

/**
 * Freeze the valuation rate (currency -> base) of every foreign currency involved, so a later change
 * of the default rates can never rewrite this entry. An explicit override wins; then a rate the entry
 * already carries; then the rate in effect on the entry's date.
 */
function snapshotFx(
  ctx: Ctx,
  date: string,
  currencies: string[],
  override: { currency: string | null; rate: string | null | undefined },
  existing: Record<string, string> | null | undefined,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const currency of new Set(currencies)) {
    if (currency === ctx.base) continue;
    if (override.rate && override.currency === currency) {
      out[currency] = rateStr(dec(override.rate));
      continue;
    }
    const kept = existing?.[currency];
    if (kept) {
      out[currency] = kept;
      continue;
    }
    const rate = ctx.ledger.rates.toBase(currency, date);
    if (!rate) fail("rate", `Set a ${currency} → ${ctx.base} exchange rate first (Settings → Exchange rates).`);
    out[currency] = rateStr(rate);
  }
  return Object.keys(out).length ? out : null;
}

function resolveAttribution(
  ctx: Ctx,
  attribution: AttributionInput,
  principal: Dec,
  currency: string,
): { mode: "AUTO" | "MANUAL"; rows: LedgerAllocation[] } {
  if (attribution.mode === "AUTO") return { mode: "AUTO", rows: [] };
  const rows: LedgerAllocation[] = [];
  const seen = new Set<string>();
  let total = ZERO;
  for (const a of attribution.allocations) {
    if (!ctx.sources.has(a.sourceId)) fail("attribution", "Unknown income source");
    if (seen.has(a.sourceId)) fail("attribution", "Each income source can appear only once");
    seen.add(a.sourceId);
    const amount = money(a.amount, currency, "attribution");
    total = total.plus(amount);
    rows.push({ sourceId: a.sourceId, amount: moneyStr(amount, currency) });
  }
  if (!total.eq(principal)) {
    fail(
      "attribution",
      `The split adds up to ${formatMoney(total, currency)} but the amount is ${formatMoney(principal, currency)}`,
    );
  }
  return { mode: "MANUAL", rows };
}

/** The foreign currency a user-supplied rate override refers to. */
function overrideTarget(base: string, ...currencies: string[]): string | null {
  return currencies.find((c) => c !== base) ?? null;
}

function feeFor(amount: Dec, currency: string, fixed: string | null | undefined, percent: string | null | undefined) {
  const fee = computeFee({ amount, fixed, percent, currency });
  return {
    feeFixed: fixed && dec(fixed).gt(0) ? moneyStr(dec(fixed), currency) : null,
    feePercent: percent && dec(percent).gt(0) ? dec(percent).toFixed() : null,
    feeAmount: fee.gt(0) ? moneyStr(fee, currency) : null,
  };
}

/* ------------------------------------------------------------------ */
/* prepare: validate + normalise                                        */
/* ------------------------------------------------------------------ */

export function prepareTransaction(ctx: Ctx, input: TransactionInput, existing?: LedgerTx): Prepared {
  const common = {
    date: input.date,
    time: input.time ?? null,
    description: input.description,
    notes: input.notes ?? null,
    tags: input.tags,
  };
  const base = ctx.base;
  const account = requireAccount(ctx, input.accountId, "accountId", existing);
  const accountCcy = account.currency;

  switch (input.type) {
    case "INCOME": {
      const source = ctx.sources.get(input.incomeSourceId);
      if (!source || source.isSystem) fail("incomeSourceId", "Choose an income source");
      const amount = money(input.amount, accountCcy, "amount");
      const fx = snapshotFx(ctx, input.date, [accountCcy], { currency: accountCcy, rate: input.rate }, existing?.fx);

      let expectedDate: string | null;
      if (input.expectedDate === null) expectedDate = null;
      else if (typeof input.expectedDate === "string") expectedDate = input.expectedDate;
      else if (existing && existing.type === "INCOME") expectedDate = existing.expectedDate ?? null;
      else {
        const stream = streamsOf(ctx.data).find((s) => s.id === source.id);
        expectedDate = stream ? suggestExpectedDate(ctx.ledger, stream, input.date, ctx.today, existing?.id) : null;
      }
      const expectedAmount =
        expectedDate === null
          ? null
          : existing?.expectedDate === expectedDate
            ? (existing.expectedAmount ?? source.expectedAmount)
            : source.expectedAmount;

      return {
        ...common,
        type: "INCOME",
        accountId: account.id,
        amount: moneyStr(amount, accountCcy),
        currency: accountCcy,
        incomeSourceId: source.id,
        expectedDate,
        expectedAmount,
        fx,
        allocationMode: "AUTO",
        allocations: [],
      };
    }

    case "EXPENSE":
    case "REFUND": {
      const priceCcy = input.currency ?? accountCcy;
      const price = money(input.amount, priceCcy, "amount");

      let original: LedgerTx | undefined;
      if (input.type === "REFUND" && input.refundOfId) {
        original = ctx.data.transactions.find((t) => t.id === input.refundOfId);
        if (!original || original.type !== "EXPENSE") fail("refundOfId", "Choose the expense that is being refunded");
        if (original.currency === priceCcy) {
          const alreadyRefunded = ctx.data.transactions
            .filter((t) => t.type === "REFUND" && t.refundOfId === original?.id && t.id !== existing?.id && t.currency === priceCcy)
            .reduce((acc, t) => acc.plus(dec(t.amount)), ZERO);
          if (alreadyRefunded.plus(price).gt(dec(original.amount))) {
            fail("amount", `Refunds can't exceed the original ${formatMoney(original.amount, priceCcy)}`);
          }
        }
      }

      let accountAmount: Dec | null = null;
      if (priceCcy !== accountCcy) {
        if (input.accountAmount) {
          accountAmount = money(input.accountAmount, accountCcy, "accountAmount");
        } else {
          const resolved = ctx.ledger.rates.rate(priceCcy, accountCcy, input.date, { accountId: account.id });
          if (!resolved) {
            fail("accountAmount", `Enter how much ${accountCcy} was charged — there is no ${priceCcy} → ${accountCcy} rate yet`);
          }
          accountAmount = receivedAt(price, resolved.rate, accountCcy);
        }
      }
      const principal = accountAmount ?? price;

      const fx = snapshotFx(
        ctx,
        input.date,
        [accountCcy, priceCcy],
        { currency: overrideTarget(base, priceCcy, accountCcy), rate: input.rate },
        existing?.fx,
      );
      const attribution = resolveAttribution(ctx, input.attribution, principal, accountCcy);
      const categoryId = checkCategory(ctx, input.categoryId ?? original?.categoryId ?? null, existing);

      if (input.type === "EXPENSE") {
        if (input.recurringId && !ctx.data.recurring.some((r) => r.id === input.recurringId)) {
          fail("recurringId", "Unknown recurring payment");
        }
        return {
          ...common,
          type: "EXPENSE",
          accountId: account.id,
          amount: moneyStr(price, priceCcy),
          currency: priceCcy,
          accountAmount: accountAmount ? moneyStr(accountAmount, accountCcy) : null,
          categoryId,
          recurringId: input.recurringId ?? null,
          dueDate: input.dueDate ?? null,
          fx,
          allocationMode: attribution.mode,
          allocations: attribution.rows,
        };
      }
      return {
        ...common,
        type: "REFUND",
        accountId: account.id,
        amount: moneyStr(price, priceCcy),
        currency: priceCcy,
        accountAmount: accountAmount ? moneyStr(accountAmount, accountCcy) : null,
        categoryId,
        refundOfId: original?.id ?? null,
        fx,
        allocationMode: attribution.mode,
        allocations: attribution.rows,
      };
    }

    case "TRANSFER":
    case "EXCHANGE": {
      const to = requireAccount(ctx, input.toAccountId, "toAccountId", existing);
      if (to.id === account.id) fail("toAccountId", "Choose a different account");
      const amount = money(input.amount, accountCcy, "amount");
      const fee = feeFor(amount, accountCcy, input.feeFixed, input.feePercent);
      const attribution = resolveAttribution(ctx, input.attribution, amount, accountCcy);

      if (input.type === "TRANSFER") {
        if (to.currency !== accountCcy) {
          fail("toAccountId", `${to.name} holds ${to.currency}. Use Exchange to convert between currencies.`);
        }
        return {
          ...common,
          type: "TRANSFER",
          accountId: account.id,
          toAccountId: to.id,
          amount: moneyStr(amount, accountCcy),
          currency: accountCcy,
          toAmount: moneyStr(amount, accountCcy),
          ...fee,
          fx: snapshotFx(ctx, input.date, [accountCcy], { currency: null, rate: null }, existing?.fx),
          allocationMode: attribution.mode,
          allocations: attribution.rows,
        };
      }

      if (to.currency === accountCcy) {
        fail("toAccountId", "Both accounts hold the same currency. Use Transfer instead.");
      }
      const received = money(input.toAmount, to.currency, "toAmount");
      const rate = effectiveRate(amount, received);
      return {
        ...common,
        type: "EXCHANGE",
        accountId: account.id,
        toAccountId: to.id,
        amount: moneyStr(amount, accountCcy),
        currency: accountCcy,
        toAmount: moneyStr(received, to.currency),
        exchangeRate: rate ? rateStr(rate) : null,
        ...fee,
        fx: snapshotFx(ctx, input.date, [accountCcy, to.currency], { currency: null, rate: null }, existing?.fx),
        allocationMode: attribution.mode,
        allocations: attribution.rows,
      };
    }

    case "OPENING": {
      const amount = money(input.amount, accountCcy, "amount");
      return {
        ...common,
        type: "OPENING",
        accountId: account.id,
        amount: moneyStr(amount, accountCcy),
        currency: accountCcy,
        subtype: input.subtype,
        fx: snapshotFx(ctx, input.date, [accountCcy], { currency: accountCcy, rate: input.rate }, existing?.fx),
        allocationMode: "AUTO",
        allocations: [],
      };
    }

    case "ADJUSTMENT": {
      const delta = money(input.amount, accountCcy, "amount");
      const attribution = resolveAttribution(ctx, input.attribution, delta.abs(), accountCcy);
      return {
        ...common,
        type: "ADJUSTMENT",
        accountId: account.id,
        amount: moneyStr(delta, accountCcy),
        currency: accountCcy,
        subtype: input.subtype ?? null,
        fx: snapshotFx(ctx, input.date, [accountCcy], { currency: accountCcy, rate: input.rate }, existing?.fx),
        allocationMode: attribution.mode,
        allocations: attribution.rows,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Warnings                                                             */
/* ------------------------------------------------------------------ */

function overdraftWarnings(ctx: Ctx, after: Ledger): Warning[] {
  const before = new Map(detectOverdrafts(ctx.ledger).map((o) => [o.accountId, o]));
  const out: Warning[] = [];
  for (const o of detectOverdrafts(after)) {
    const prev = before.get(o.accountId);
    if (prev && !o.lowest.lt(prev.lowest)) continue; // not worse than it already was
    const account = ctx.accounts.get(o.accountId);
    const currency = account?.currency ?? ctx.base;
    out.push({
      code: "OVERDRAFT",
      accountId: o.accountId,
      message: `${account?.name ?? "Account"} would go to ${formatMoney(o.lowest, currency)} on ${formatDateShort(o.lowestDate, ctx.today)} — more than it holds.`,
    });
  }
  return out;
}

function rateWarnings(ctx: Ctx, tx: Prepared): Warning[] {
  if (tx.type !== "EXCHANGE" || !tx.toAccountId || !tx.toAmount) return [];
  const to = ctx.accounts.get(tx.toAccountId);
  if (!to) return [];
  const effective = effectiveRate(dec(tx.amount), dec(tx.toAmount));
  const usual = ctx.ledger.rates.rate(tx.currency, to.currency, tx.date, { accountId: tx.accountId });
  if (!effective || !usual) return [];
  const deviation = effective.div(usual.rate).minus(1);
  if (deviation.abs().gt("0.2")) {
    return [
      {
        code: "RATE_DEVIATION",
        message: `That's ${formatPercent(deviation.abs(), 0)} ${deviation.gt(0) ? "better" : "worse"} than your usual ${tx.currency} → ${to.currency} rate (${usual.rate.toDecimalPlaces(4).toFixed()}). Typo?`,
      },
    ];
  }
  return [];
}

function ledgerWith(ctx: Ctx, change: (txs: LedgerTx[]) => LedgerTx[]): Ledger {
  return buildLedger({ ...ledgerInputOf(ctx.data), transactions: change(ctx.data.transactions) });
}

function warningsFor(ctx: Ctx, change: (txs: LedgerTx[]) => LedgerTx[], prepared?: Prepared): Warning[] {
  return [...overdraftWarnings(ctx, ledgerWith(ctx, change)), ...(prepared ? rateWarnings(ctx, prepared) : [])];
}

function assertConfirmed(warnings: Warning[], opts: WriteOptions): void {
  if (warnings.length > 0 && !opts.confirm) {
    throw new NeedsConfirmation(warnings[0].message, warnings);
  }
}

/* ------------------------------------------------------------------ */
/* Persistence                                                          */
/* ------------------------------------------------------------------ */

function toRow(tx: Prepared): Omit<Prisma.TransactionUncheckedCreateInput, "allocations"> {
  return {
    type: tx.type,
    date: tx.date,
    time: tx.time ?? null,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? null,
    amount: tx.amount,
    currency: tx.currency,
    accountAmount: tx.accountAmount ?? null,
    toAmount: tx.toAmount ?? null,
    feeFixed: tx.feeFixed ?? null,
    feePercent: tx.feePercent ?? null,
    feeAmount: tx.feeAmount ?? null,
    fx: tx.fx && Object.keys(tx.fx).length ? JSON.stringify(tx.fx) : null,
    exchangeRate: tx.exchangeRate ?? null,
    description: tx.description ?? "",
    notes: tx.notes ?? null,
    tags: JSON.stringify(tx.tags ?? []),
    categoryId: tx.categoryId ?? null,
    incomeSourceId: tx.incomeSourceId ?? null,
    expectedDate: tx.expectedDate ?? null,
    expectedAmount: tx.expectedAmount ?? null,
    refundOfId: tx.refundOfId ?? null,
    recurringId: tx.recurringId ?? null,
    dueDate: tx.dueDate ?? null,
    subtype: tx.subtype ?? null,
    allocationMode: tx.allocationMode,
  };
}

/** One-line description for the audit trail and confirmation messages. */
export function describeTx(ctx: Ctx, tx: Prepared | LedgerTx): string {
  const name = (id: string | null | undefined) => (id ? (ctx.accounts.get(id)?.name ?? "account") : "");
  const money = formatMoney(tx.amount, tx.currency);
  const what = tx.description ? ` · ${tx.description}` : "";
  switch (tx.type) {
    case "INCOME":
      return `Income ${money} → ${name(tx.accountId)}${what}`;
    case "EXPENSE":
      return `Expense ${money} from ${name(tx.accountId)}${what}`;
    case "REFUND":
      return `Refund ${money} → ${name(tx.accountId)}${what}`;
    case "TRANSFER":
      return `Transfer ${money} ${name(tx.accountId)} → ${name(tx.toAccountId)}`;
    case "EXCHANGE":
      return `Exchange ${money} → ${formatMoney(tx.toAmount ?? tx.amount, ctx.accounts.get(tx.toAccountId ?? "")?.currency ?? tx.currency)}`;
    case "OPENING":
      return `Opening balance ${money} on ${name(tx.accountId)}`;
    case "ADJUSTMENT":
      return `Balance correction ${money} on ${name(tx.accountId)}`;
  }
}

function plainSnapshot(tx: LedgerTx | (Prepared & { id?: string })) {
  return JSON.parse(JSON.stringify(tx));
}

export async function createTransaction(db: Db, raw: TransactionInputRaw, opts: WriteOptions = {}): Promise<{ id: string }> {
  const input = parseInput(transactionInput, raw);
  const ctx = opts.ctx ?? (await makeCtx(db));
  const prepared = prepareTransaction(ctx, input);

  if (!opts.confirm) {
    const candidate: LedgerTx = { ...prepared, id: "__new__", createdAt: new Date().toISOString() };
    assertConfirmed(warningsFor(ctx, (txs) => [...txs, candidate], prepared), opts);
  }

  const created = await db.$transaction(async (tx) => {
    const row = await tx.transaction.create({
      data: { ...toRow(prepared), allocations: { create: prepared.allocations.map((a) => ({ sourceId: a.sourceId, amount: a.amount })) } },
      include: { allocations: true },
    });
    await audit(tx, {
      entity: "Transaction",
      entityId: row.id,
      action: "CREATE",
      summary: describeTx(ctx, prepared),
      after: plainSnapshot({ ...prepared, id: row.id }),
    });
    return row;
  });

  if (opts.ctx) {
    ctx.data.transactions.push(rowToLedgerTx(created));
    refreshLedger(ctx);
  }
  return { id: created.id };
}

export async function updateTransaction(db: Db, id: string, raw: TransactionInputRaw, opts: WriteOptions = {}): Promise<{ id: string }> {
  const input = parseInput(transactionInput, raw);
  const ctx = opts.ctx ?? (await makeCtx(db));
  const existing = ctx.data.transactions.find((t) => t.id === id);
  if (!existing) fail("id", "That transaction no longer exists");
  if (existing.type !== input.type) fail("type", "The type of an entry can't be changed — delete it and add a new one");
  const prepared = prepareTransaction(ctx, input, existing);

  if (!opts.confirm) {
    const candidate: LedgerTx = { ...prepared, id: existing.id, createdAt: existing.createdAt };
    assertConfirmed(warningsFor(ctx, (txs) => txs.map((t) => (t.id === id ? candidate : t)), prepared), opts);
  }

  await db.$transaction(async (tx) => {
    await tx.transactionAllocation.deleteMany({ where: { transactionId: id } });
    await tx.transaction.update({
      where: { id },
      data: { ...toRow(prepared), allocations: { create: prepared.allocations.map((a) => ({ sourceId: a.sourceId, amount: a.amount })) } },
    });
    await audit(tx, {
      entity: "Transaction",
      entityId: id,
      action: "UPDATE",
      summary: `Edited: ${describeTx(ctx, prepared)}`,
      before: plainSnapshot(existing),
      after: plainSnapshot({ ...prepared, id }),
    });
  });
  return { id };
}

/** What would happen if this entry were deleted? (used to fill the confirmation dialog) */
export async function previewDelete(db: Db, id: string): Promise<{ warnings: Warning[]; linkedRefunds: number; summary: string }> {
  const ctx = await makeCtx(db);
  const existing = ctx.data.transactions.find((t) => t.id === id);
  if (!existing) fail("id", "That transaction no longer exists");
  return {
    warnings: warningsFor(ctx, (txs) => txs.filter((t) => t.id !== id)),
    linkedRefunds: ctx.data.transactions.filter((t) => t.refundOfId === id).length,
    summary: describeTx(ctx, existing),
  };
}

export async function deleteTransaction(db: Db, id: string, opts: WriteOptions = {}): Promise<{ id: string }> {
  const ctx = opts.ctx ?? (await makeCtx(db));
  const existing = ctx.data.transactions.find((t) => t.id === id);
  if (!existing) fail("id", "That transaction no longer exists");

  if (!opts.confirm) assertConfirmed(warningsFor(ctx, (txs) => txs.filter((t) => t.id !== id)), opts);

  await db.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id } });
    await audit(tx, {
      entity: "Transaction",
      entityId: id,
      action: "DELETE",
      summary: `Deleted: ${describeTx(ctx, existing)}`,
      before: plainSnapshot(existing),
    });
  });
  if (opts.ctx) {
    ctx.data.transactions = ctx.data.transactions.filter((t) => t.id !== id);
    refreshLedger(ctx);
  }
  return { id };
}

/** Copy an entry (to a new date, today by default) — the "repeat my usual coffee" shortcut. */
export async function duplicateTransaction(db: Db, id: string, opts: WriteOptions & { date?: string } = {}): Promise<{ id: string }> {
  const ctx = opts.ctx ?? (await makeCtx(db));
  const existing = ctx.data.transactions.find((t) => t.id === id);
  if (!existing) fail("id", "That transaction no longer exists");
  const input = txToInput(existing);
  const copy = { ...input, date: opts.date ?? ctx.today, time: null } as TransactionInputRaw;
  if (copy.type === "INCOME") copy.expectedDate = undefined; // let the app re-detect which payment this settles
  if (copy.type === "EXPENSE") {
    copy.recurringId = null;
    copy.dueDate = null;
  }
  return createTransaction(db, copy, { ...opts, ctx });
}

