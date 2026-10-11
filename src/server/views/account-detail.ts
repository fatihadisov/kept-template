import { type Dec, ZERO } from "@/lib/finance/money";
import type { AppState } from "../session";
import { lookups } from "./common";
import { type TxRowModel, buildTxRows } from "./tx-rows";

export interface ActivityRow {
  row: TxRowModel;
  /** effect on THIS account, in its own currency */
  delta: Dec;
  balanceAfter: Dec;
}

/** Every entry that touched an account, newest first, with the balance it left behind. */
export function accountActivity(s: AppState, accountId: string, limit = 250): { rows: ActivityRow[]; total: number } {
  const deltas = new Map<string, Dec>();
  const order: string[] = [];
  for (const p of s.ledger.postings) {
    if (p.accountId !== accountId) continue;
    if (!deltas.has(p.txId)) {
      deltas.set(p.txId, ZERO);
      order.push(p.txId);
    }
    deltas.set(p.txId, (deltas.get(p.txId) as Dec).plus(p.amount));
  }
  let balance = ZERO;
  const timeline = order.map((txId) => {
    balance = balance.plus(deltas.get(txId) as Dec);
    return { txId, delta: deltas.get(txId) as Dec, balanceAfter: balance };
  });
  const lk = lookups(s);
  const recent = timeline.slice(-limit).reverse();
  const rows = recent.flatMap((t) => {
    const r = s.ledger.byId.get(t.txId);
    return r ? [{ row: buildTxRows(s, [r], lk)[0], delta: t.delta, balanceAfter: t.balanceAfter }] : [];
  });
  return { rows, total: timeline.length };
}
