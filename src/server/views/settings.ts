import type { AuditEntry, RateRecord } from "@/lib/app-types";
import { addDays } from "@/lib/finance/dates";
import { billOccurrences } from "@/lib/finance/forecast";
import { describeSchedule } from "@/lib/finance/recurrence";
import type { Db } from "../db";
import type { AppState } from "../session";
import { lookups } from "./common";

export interface RatePair {
  from: string;
  to: string;
  current: RateRecord | null;
  history: RateRecord[];
}

export interface RecurringRow {
  id: string;
  next: { dueDate: string; status: string } | null;
  scheduleText: string;
  accountName: string;
  categoryName: string | null;
}

export interface SettingsModel {
  categoryUsage: Record<string, number>;
  recurring: Record<string, RecurringRow>;
  /** global rate pairs (all accounts) */
  globalPairs: RatePair[];
  /** rates that belong to one card */
  cardRates: (RateRecord & { accountName: string })[];
  foreignCurrencies: string[];
  audit: AuditEntry[];
  issues: { code: string; message: string }[];
  counts: { accounts: number; transactions: number; goals: number };
}

export async function buildSettings(s: AppState, db: Db): Promise<SettingsModel> {
  const lk = lookups(s);
  const base = s.data.settings.baseCurrency;

  const categoryUsage: Record<string, number> = {};
  for (const t of s.data.transactions) if (t.categoryId) categoryUsage[t.categoryId] = (categoryUsage[t.categoryId] ?? 0) + 1;

  const recurring: Record<string, RecurringRow> = {};
  for (const bill of s.bills) {
    const occ = billOccurrences(s.ledger, bill, { from: s.today, to: addDays(s.today, 366) }, s.today).filter((o) => o.status !== "paid" && o.status !== "skipped");
    const overdue = billOccurrences(s.ledger, bill, { from: addDays(s.today, -7), to: addDays(s.today, -1) }, s.today).filter((o) => o.status === "overdue");
    const nextOcc = overdue[0] ?? occ[0] ?? null;
    recurring[bill.id] = {
      id: bill.id,
      next: nextOcc ? { dueDate: nextOcc.dueDate, status: nextOcc.status } : null,
      scheduleText: describeSchedule(bill.schedule),
      accountName: lk.accountName(bill.accountId),
      categoryName: bill.categoryId ? lk.category(bill.categoryId).name : null,
    };
  }

  const pairKey = (r: RateRecord) => `${r.from}>${r.to}`;
  const globals = s.data.rates.filter((r) => !r.accountId);
  const keys = new Set(globals.map(pairKey));
  // make sure every foreign currency in use has a row, even if its rate is missing
  const foreignCurrencies = [...new Set([...s.data.accounts.map((a) => a.currency), ...s.data.goals.map((g) => g.currency), ...s.data.sources.map((x) => x.currency)])].filter((c) => c !== base);
  for (const c of foreignCurrencies) if (!keys.has(`${c}>${base}`)) keys.add(`${c}>${base}`);
  const globalPairs: RatePair[] = [...keys].map((k) => {
    const [from, to] = k.split(">");
    const history = globals.filter((r) => r.from === from && r.to === to).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0));
    return { from, to, current: history.find((r) => r.effectiveFrom <= s.today) ?? history[history.length - 1] ?? null, history };
  });
  globalPairs.sort((a, b) => (a.to === base ? 0 : 1) - (b.to === base ? 0 : 1) || a.from.localeCompare(b.from));

  const cardRates = s.data.rates
    .filter((r) => r.accountId)
    .map((r) => ({ ...r, accountName: lk.accountName(r.accountId) }))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

  const rows = await db.auditLog.findMany({ orderBy: { at: "desc" }, take: 40 });
  const audit: AuditEntry[] = rows.map((r) => ({ id: r.id, at: r.at.toISOString(), entity: r.entity, entityId: r.entityId, action: r.action, summary: r.summary }));

  return {
    categoryUsage,
    recurring,
    globalPairs,
    cardRates,
    foreignCurrencies,
    audit,
    issues: s.ledger.issues.map((i) => ({ code: i.code, message: i.message })),
    counts: { accounts: s.data.accounts.length, transactions: s.data.transactions.length, goals: s.data.goals.length },
  };
}
