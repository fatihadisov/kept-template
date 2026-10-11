import { dec } from "@/lib/finance/money";
import { type RateInputRaw, rateInput } from "@/lib/validation";
import { audit } from "../audit";
import type { Db } from "../db";
import { fail, makeCtx, parseInput, rateStr } from "./context";

interface RateRow {
  from: string;
  to: string;
  rate: string;
  effectiveFrom: string;
  accountId: string | null;
  note: string | null;
}

async function upsertRate(db: Db, r: RateRow): Promise<{ id: string }> {
  const where = { fromCurrency: r.from, toCurrency: r.to, effectiveFrom: r.effectiveFrom, accountId: r.accountId };
  const existing = await db.exchangeRate.findFirst({ where });
  const row = existing
    ? await db.exchangeRate.update({ where: { id: existing.id }, data: { rate: r.rate, note: r.note } })
    : await db.exchangeRate.create({ data: { ...where, rate: r.rate, note: r.note } });
  await audit(db, {
    entity: "ExchangeRate",
    entityId: row.id,
    action: existing ? "UPDATE" : "CREATE",
    summary: `Rate ${r.from} → ${r.to} = ${row.rate}${r.accountId ? " (card)" : ""} from ${r.effectiveFrom}`,
    before: existing ?? undefined,
    after: row,
  });
  return { id: row.id };
}

/**
 * Add (or correct) a conversion rate. Rates are effective-dated: adding a new one from today leaves
 * every earlier rate — and every transaction that froze one — untouched. With `alsoInverse` the
 * opposite direction is recorded too, as the exact reciprocal (a bank's separate buy/sell rates
 * stay possible by leaving it off and setting each direction on its own).
 */
export async function addRate(db: Db, raw: RateInputRaw): Promise<{ id: string }> {
  const input = parseInput(rateInput, raw);
  const ctx = await makeCtx(db);
  if (input.accountId && !ctx.accounts.has(input.accountId)) fail("accountId", "Unknown account");

  const rate = dec(input.rate);
  const main = await upsertRate(db, {
    from: input.from,
    to: input.to,
    rate: rateStr(rate),
    effectiveFrom: input.effectiveFrom,
    accountId: input.accountId ?? null,
    note: input.note ?? null,
  });
  if (input.alsoInverse && !input.accountId && rate.gt(0)) {
    await upsertRate(db, {
      from: input.to,
      to: input.from,
      rate: rateStr(dec(1).div(rate)),
      effectiveFrom: input.effectiveFrom,
      accountId: null,
      note: input.note ?? null,
    });
  }
  return main;
}

export async function deleteRate(db: Db, id: string): Promise<void> {
  const row = await db.exchangeRate.findUnique({ where: { id } });
  if (!row) return;
  await db.exchangeRate.delete({ where: { id } });
  await audit(db, { entity: "ExchangeRate", entityId: id, action: "DELETE", summary: `Removed rate ${row.fromCurrency} → ${row.toCurrency} (${row.rate})`, before: row });
}
