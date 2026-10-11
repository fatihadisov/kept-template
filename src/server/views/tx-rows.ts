import { formatRelativeDay } from "@/lib/finance/dates";
import { dec } from "@/lib/finance/money";
import type { LedgerTx, ResolvedTx, TxType } from "@/lib/finance/types";
import type { AppState } from "../session";
import { type Lookups, lookups } from "./common";

export interface AttributionChip {
  name: string;
  color: string;
  pct: number;
}

export interface TxRowModel {
  id: string;
  date: string;
  time: string | null;
  type: TxType;
  title: string;
  subtitle: string;
  /** main amount text, with sign where it means something */
  amount: string;
  tone: "in" | "out" | "neutral";
  /** e.g. "≈ ₼17.00" or "rate 1.68 · fee $0.50" */
  secondary: string | null;
  visual: { kind: "category"; icon: string; color: string } | { kind: "type" };
  attribution: AttributionChip[];
  tags: string[];
  tx: LedgerTx;
}

const MINUS = "−";

/** Turn resolved ledger transactions into display rows (shared by the overview, activity and wallet pages). */
export function buildTxRows(s: AppState, rows: readonly ResolvedTx[], lk: Lookups = lookups(s)): TxRowModel[] {
  const f = s.fmt;
  const base = s.ledger.base;
  return rows.map((r) => {
    const t = r.tx;
    const fromName = lk.accountName(t.accountId);
    const toName = lk.accountName(t.toAccountId);
    const cat = lk.category(t.categoryId);
    const inForeign = r.accountCurrency !== base || t.currency !== base;
    const approx = inForeign && r.metrics.principalBase.gt(0) ? `≈ ${f.inBase(r.metrics.principalBase)}` : null;

    let title = t.description?.trim() ?? "";
    let subtitle = "";
    let amount = "";
    let tone: TxRowModel["tone"] = "neutral";
    let secondary: string | null = approx;
    let visual: TxRowModel["visual"] = { kind: "type" };

    switch (t.type) {
      case "INCOME": {
        const src = t.incomeSourceId ? lk.source(t.incomeSourceId) : null;
        title = title || src?.name || "Income";
        subtitle = `${src?.name ?? "Income"} → ${fromName}`;
        amount = `+${f.money(t.amount, r.accountCurrency)}`;
        tone = "in";
        break;
      }
      case "EXPENSE": {
        title = title || cat.name;
        subtitle = `${cat.name} · ${fromName}`;
        amount = `${MINUS}${f.money(t.amount, t.currency)}`;
        tone = "out";
        visual = { kind: "category", icon: cat.icon, color: cat.color };
        if (t.accountAmount && t.currency !== r.accountCurrency) {
          secondary = `charged ${f.money(t.accountAmount, r.accountCurrency)}${approx ? ` · ${approx}` : ""}`;
        }
        break;
      }
      case "REFUND": {
        title = title || `Refund · ${cat.name}`;
        subtitle = `Refund · ${cat.name} → ${fromName}`;
        amount = `+${f.money(t.amount, t.currency)}`;
        tone = "in";
        visual = { kind: "category", icon: cat.icon, color: cat.color };
        break;
      }
      case "TRANSFER": {
        title = title || "Transfer";
        subtitle = `${fromName} → ${toName}`;
        amount = f.money(t.amount, r.accountCurrency);
        secondary = t.feeAmount ? `fee ${f.money(t.feeAmount, r.accountCurrency)}` : null;
        break;
      }
      case "EXCHANGE": {
        title = title || `Exchange ${r.accountCurrency} → ${r.toCurrency}`;
        subtitle = `${fromName} → ${toName}`;
        amount = `${f.money(t.amount, r.accountCurrency)} → ${f.money(t.toAmount ?? t.amount, r.toCurrency ?? r.accountCurrency)}`;
        const bits: string[] = [];
        if (t.exchangeRate) bits.push(`rate ${f.rate(t.exchangeRate)}`);
        if (t.feeAmount) bits.push(`fee ${f.money(t.feeAmount, r.accountCurrency)}`);
        secondary = bits.join(" · ") || null;
        break;
      }
      case "OPENING": {
        title = title || (t.subtype === "PREVIOUS_SAVINGS" ? "Previous savings" : "Existing funds");
        subtitle = `Opening balance · ${fromName}`;
        amount = f.money(t.amount, r.accountCurrency);
        break;
      }
      case "ADJUSTMENT": {
        title = title || "Balance correction";
        subtitle = `Correction · ${fromName}`;
        const positive = !dec(t.amount).isNegative();
        amount = `${positive ? "+" : MINUS}${f.money(dec(t.amount).abs(), r.accountCurrency)}`;
        tone = positive ? "in" : "out";
        break;
      }
    }

    // attribution: only when the user chose it (an automatic split follows the money and is visible in the editor)
    const total = r.parts.reduce((a, p) => a.plus(p.amount.abs()), dec(0));
    const attribution: AttributionChip[] =
      t.type === "INCOME" || t.type === "OPENING" || total.isZero() || t.allocationMode !== "MANUAL"
        ? []
        : r.parts.map((p) => {
            const info = lk.source(p.sourceId);
            return { name: info.name, color: info.color, pct: p.amount.abs().div(total).times(100).toNumber() };
          });

    return {
      id: t.id,
      date: t.date,
      time: t.time ?? null,
      type: t.type,
      title,
      subtitle,
      amount,
      tone,
      secondary,
      visual,
      attribution,
      tags: t.tags ?? [],
      tx: t,
    };
  });
}

/** "Today" / "Yesterday" / "Mon 5 Oct" */
export function dayLabel(date: string, today: string): string {
  return formatRelativeDay(date, today);
}

