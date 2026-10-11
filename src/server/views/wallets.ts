import type { ISODate } from "@/lib/finance/dates";
import { type Dec, ZERO } from "@/lib/finance/money";
import { type Snapshot, type State, snapshotFromState, stateAt } from "@/lib/finance/queries";
import type { AppState } from "../session";
import { type Lookups, lookups } from "./common";

export interface WalletRow {
  id: string;
  name: string;
  nickname: string | null;
  type: string;
  color: string | null;
  currency: string;
  archived: boolean;
  balance: Dec;
  baseValue: Dec;
  /** how the balance is made up, by income source (positive parts only) */
  composition: { sourceId: string; name: string; color: string; value: number; amount: Dec }[];
  negative: boolean;
}

/** One row per account as of a snapshot: native balance, reporting-currency value, and who the money belongs to. */
export function walletRows(s: AppState, snap: Snapshot, state: State, lk: Lookups = lookups(s)): WalletRow[] {
  const rows: WalletRow[] = [];
  for (const acc of s.data.accounts) {
    const bal = snap.accounts.find((x) => x.accountId === acc.id);
    const balance = bal?.balance ?? ZERO;
    if (acc.archived && balance.isZero()) continue;
    const cells = state.cells.get(acc.id);
    const composition = [...(cells?.entries() ?? [])]
      .filter(([, v]) => v.gt(0))
      .map(([sid, v]) => ({ sourceId: sid, name: lk.source(sid).name, color: lk.source(sid).color, value: v.toNumber(), amount: v }));
    rows.push({
      id: acc.id,
      name: acc.name,
      nickname: acc.nickname,
      type: acc.type,
      color: acc.color,
      currency: acc.currency,
      archived: acc.archived,
      balance,
      baseValue: bal?.baseValue ?? ZERO,
      composition,
      negative: balance.isNegative(),
    });
  }
  return rows;
}

export interface WalletsModel {
  asOf: ISODate;
  isHistorical: boolean;
  total: Dec;
  byCurrency: { currency: string; amount: Dec; baseValue: Dec }[];
  groups: { type: string; label: string; rows: WalletRow[] }[];
  archived: WalletRow[];
  sources: { id: string; name: string; color: string; value: Dec; share: number; isSystem: boolean }[];
  openings: Record<string, { amount: string; date: string; kind: string } | null>;
}

const GROUPS: { type: string; label: string }[] = [
  { type: "CARD", label: "Cards" },
  { type: "CASH", label: "Cash" },
  { type: "SAVINGS", label: "Savings" },
  { type: "OTHER", label: "Other" },
];

export function buildWallets(s: AppState, asOf: ISODate): WalletsModel {
  const lk = lookups(s);
  const state = stateAt(s.ledger, asOf);
  const snap = snapshotFromState(s.ledger, state, asOf);
  const all = walletRows(s, snap, state, lk);
  const live = all.filter((w) => !w.archived);

  const sources = snap.sources
    .map((x) => {
      const info = lk.source(x.sourceId);
      return { id: x.sourceId, name: info.name, color: info.color, value: x.baseValue, share: snap.total.gt(0) ? x.baseValue.div(snap.total).toNumber() : 0, isSystem: info.isSystem };
    })
    .filter((x) => !x.value.isZero())
    .sort((a, b) => Number(a.isSystem) - Number(b.isSystem) || b.value.comparedTo(a.value));

  const openings: WalletsModel["openings"] = {};
  for (const acc of s.data.accounts) {
    const t = s.data.transactions.find((x) => x.type === "OPENING" && x.accountId === acc.id);
    openings[acc.id] = t ? { amount: t.amount, date: t.date, kind: t.subtype ?? "EXISTING_FUNDS" } : null;
  }

  return {
    asOf,
    isHistorical: asOf < s.today,
    total: snap.total,
    byCurrency: snap.byCurrency.filter((c) => !c.amount.isZero()),
    groups: GROUPS.map((g) => ({ ...g, rows: live.filter((w) => w.type === g.type) })).filter((g) => g.rows.length > 0),
    archived: all.filter((w) => w.archived),
    sources,
    openings,
  };
}
