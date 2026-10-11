import { accountColorFor } from "@/lib/defaults";
import { dec } from "@/lib/finance/money";
import { type AccountInputRaw, accountInput } from "@/lib/validation";
import { audit } from "../audit";
import type { Db } from "../db";
import { fail, makeCtx, parseInput, rateStr } from "./context";
import { createTransaction, deleteTransaction, updateTransaction } from "./transactions";

function uniqueName(names: string[], name: string): void {
  if (names.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase())) {
    fail("name", `You already have an account called “${name}”`);
  }
}

/**
 * Creates an account. A starting balance is recorded as an OPENING entry on the account's own
 * date — existing funds / previous savings — so it never inflates income statistics.
 */
export async function createAccount(db: Db, raw: AccountInputRaw): Promise<{ id: string }> {
  const input = parseInput(accountInput, raw);
  let ctx = await makeCtx(db);
  uniqueName(
    ctx.data.accounts.filter((a) => !a.archived).map((a) => a.name),
    input.name,
  );

  const opening = input.openingBalance ? dec(input.openingBalance) : null;
  const needsRate = input.currency !== ctx.base && !ctx.ledger.rates.toBase(input.currency, ctx.today);
  if (needsRate && input.rateToBase) {
    await db.exchangeRate.create({
      data: { fromCurrency: input.currency, toCurrency: ctx.base, rate: rateStr(dec(input.rateToBase)), effectiveFrom: ctx.today },
    });
  } else if (needsRate && opening && opening.gt(0)) {
    fail("rateToBase", `Set the ${input.currency} → ${ctx.base} rate so this balance can be valued`);
  }

  const created = await db.account.create({
    data: {
      name: input.name,
      type: input.type,
      currency: input.currency,
      nickname: input.nickname || null,
      color: input.color ?? accountColorFor(input.currency, ctx.data.accounts.length),
      sortOrder: ctx.data.accounts.reduce((m, a) => Math.max(m, a.sortOrder), -1) + 1,
    },
  });
  await audit(db, { entity: "Account", entityId: created.id, action: "CREATE", summary: `Added account ${created.name} (${created.currency})`, after: created });

  if (opening && opening.gt(0)) {
    ctx = await makeCtx(db);
    await createTransaction(
      db,
      {
        type: "OPENING",
        date: input.openingDate ?? ctx.today,
        accountId: created.id,
        amount: opening.toFixed(),
        subtype: input.openingKind,
        description: input.openingKind === "PREVIOUS_SAVINGS" ? "Previous savings" : "Existing funds",
      },
      { ctx, confirm: true },
    );
  }
  return { id: created.id };
}

export async function updateAccount(db: Db, id: string, raw: AccountInputRaw): Promise<{ id: string }> {
  const input = parseInput(accountInput, raw);
  let ctx = await makeCtx(db);
  const account = ctx.accounts.get(id);
  if (!account) fail("id", "That account no longer exists");

  uniqueName(
    ctx.data.accounts.filter((a) => !a.archived && a.id !== id).map((a) => a.name),
    input.name,
  );
  const used = ctx.data.transactions.some((t) => t.accountId === id || t.toAccountId === id);
  if (input.currency !== account.currency && used) {
    fail("currency", "This account already has transactions, so its currency can't change. Create a new account instead.");
  }

  const updated = await db.account.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      currency: input.currency,
      nickname: input.nickname || null,
      color: input.color ?? account.color,
    },
  });
  await audit(db, { entity: "Account", entityId: id, action: "UPDATE", summary: `Edited account ${updated.name}`, before: account, after: updated });

  // keep the opening balance in sync
  ctx = await makeCtx(db);
  const openingTx = ctx.data.transactions.find((t) => t.type === "OPENING" && t.accountId === id);
  const wanted = input.openingBalance ? dec(input.openingBalance) : null;
  if (openingTx && (!wanted || wanted.isZero())) {
    await deleteTransaction(db, openingTx.id, { ctx, confirm: true });
  } else if (openingTx && wanted) {
    await updateTransaction(
      db,
      openingTx.id,
      {
        type: "OPENING",
        date: input.openingDate ?? openingTx.date,
        accountId: id,
        amount: wanted.toFixed(),
        subtype: input.openingKind,
        description: openingTx.description ?? "",
      },
      { ctx, confirm: true },
    );
  } else if (!openingTx && wanted && wanted.gt(0)) {
    await createTransaction(
      db,
      {
        type: "OPENING",
        date: input.openingDate ?? ctx.today,
        accountId: id,
        amount: wanted.toFixed(),
        subtype: input.openingKind,
        description: input.openingKind === "PREVIOUS_SAVINGS" ? "Previous savings" : "Existing funds",
      },
      { ctx, confirm: true },
    );
  }
  return { id };
}

export async function setAccountArchived(db: Db, id: string, archived: boolean): Promise<void> {
  const account = await db.account.findUnique({ where: { id } });
  if (!account) fail("id", "That account no longer exists");
  await db.account.update({ where: { id }, data: { archived } });
  await audit(db, { entity: "Account", entityId: id, action: "UPDATE", summary: `${archived ? "Archived" : "Restored"} account ${account.name}` });
}

export async function deleteAccount(db: Db, id: string): Promise<void> {
  const ctx = await makeCtx(db);
  const account = ctx.accounts.get(id);
  if (!account) fail("id", "That account no longer exists");
  const count = ctx.data.transactions.filter((t) => t.accountId === id || t.toAccountId === id).length;
  const openingOnly = ctx.data.transactions.filter((t) => t.accountId === id || t.toAccountId === id).every((t) => t.type === "OPENING");
  if (count > 0 && !openingOnly) {
    fail("id", `${account.name} has ${count} transaction${count === 1 ? "" : "s"}. Archive it instead — history stays intact.`);
  }
  if (ctx.data.recurring.some((r) => r.accountId === id)) {
    fail("id", `A recurring payment still uses ${account.name}. Remove or move it first.`);
  }
  for (const t of ctx.data.transactions.filter((x) => x.accountId === id)) {
    await deleteTransaction(db, t.id, { ctx, confirm: true });
  }
  await db.account.delete({ where: { id } });
  await audit(db, { entity: "Account", entityId: id, action: "DELETE", summary: `Deleted account ${account.name}`, before: account });
}

export async function reorderAccounts(db: Db, ids: string[]): Promise<void> {
  await db.$transaction(ids.map((id, index) => db.account.update({ where: { id }, data: { sortOrder: index } })));
}
