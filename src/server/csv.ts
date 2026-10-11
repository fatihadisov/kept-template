import type { AppData } from "./load";
import type { PeriodPoint } from "@/lib/finance/stats";
import type { Ledger, ResolvedTx } from "@/lib/finance/types";

type Cell = string | number | null | undefined;

/** Neutralise spreadsheet formulas in free text (=, +, -, @ at the start would be executed by Excel). */
function text(value: string | null | undefined): string {
  const v = value ?? "";
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function escape(cell: Cell): string {
  const s = cell === null || cell === undefined ? "" : String(cell);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel shows ₼ and Azerbaijani letters correctly. */
export function toCsv(rows: Cell[][]): string {
  return `﻿${rows.map((r) => r.map(escape).join(",")).join("\r\n")}\r\n`;
}

const TYPE_LABEL: Record<string, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  REFUND: "Refund",
  TRANSFER: "Transfer",
  EXCHANGE: "Exchange",
  OPENING: "Opening balance",
  ADJUSTMENT: "Correction",
};

export function transactionsCsv(ledger: Ledger, data: AppData, txs: readonly ResolvedTx[]): string {
  const account = new Map(data.accounts.map((a) => [a.id, a]));
  const category = new Map(data.categories.map((c) => [c.id, c.name]));
  const source = new Map(data.sources.map((s) => [s.id, s.name]));
  const header: Cell[] = [
    "Date",
    "Time",
    "Type",
    "Account",
    "To account",
    "Description",
    "Category",
    "Amount",
    "Currency",
    "Charged to account",
    "Account currency",
    "Received",
    "Received currency",
    "Effective rate",
    "Fee",
    `Value (${ledger.base})`,
    "Attributed to",
    "Income source",
    "Scheduled pay date",
    "Tags",
    "Notes",
    "Frozen valuation rates",
  ];
  const rows: Cell[][] = [header];
  for (const r of [...txs].sort((a, b) => (a.tx.date === b.tx.date ? a.seq - b.seq : a.tx.date < b.tx.date ? -1 : 1))) {
    const t = r.tx;
    const to = t.toAccountId ? account.get(t.toAccountId) : undefined;
    const sign = t.type === "EXPENSE" || t.type === "TRANSFER" || t.type === "EXCHANGE" ? "-" : "";
    rows.push([
      t.date,
      t.time ?? "",
      TYPE_LABEL[t.type] ?? t.type,
      text(account.get(t.accountId)?.name),
      text(to?.name),
      text(t.description),
      text(t.categoryId ? category.get(t.categoryId) : ""),
      `${sign}${t.amount}`,
      t.currency,
      t.accountAmount ? `${sign}${t.accountAmount}` : "",
      r.accountCurrency,
      t.toAmount ?? "",
      r.toCurrency ?? "",
      t.exchangeRate ?? "",
      t.feeAmount ?? "",
      r.metrics.principalBase.toFixed(ledger.baseDecimals),
      text(r.parts.map((p) => `${source.get(p.sourceId) ?? "?"} ${p.amount.toFixed(2)}`).join("; ")),
      text(t.incomeSourceId ? source.get(t.incomeSourceId) : ""),
      t.expectedDate ?? "",
      text((t.tags ?? []).join(" ")),
      text(t.notes),
      t.fx ? Object.entries(t.fx).map(([c, v]) => `${c}=${v}`).join(" ") : "",
    ]);
  }
  return toCsv(rows);
}

/** One row per period: the report behind the charts. */
export function reportCsv(points: readonly PeriodPoint[], data: AppData, base: string): string {
  const source = new Map(data.sources.map((s) => [s.id, s.name]));
  const sourceIds = data.sources.filter((s) => !s.isSystem).map((s) => s.id);
  const header: Cell[] = [
    "Period",
    "From",
    "To",
    `Income (${base})`,
    `Spent (${base})`,
    `Fees (${base})`,
    `Conversion cost (${base})`,
    `Net savings (${base})`,
    "Savings rate %",
    `Total money at end (${base})`,
    ...sourceIds.flatMap((id) => [`Income · ${source.get(id)}`, `Spent · ${source.get(id)}`, `Remaining · ${source.get(id)}`]),
    `Remaining · ${data.sources.find((s) => s.isSystem)?.name ?? "Existing funds"}`,
  ];
  const openingId = data.sources.find((s) => s.isSystem)?.id;
  const rows: Cell[][] = [header];
  for (const p of points) {
    const s = p.stats;
    rows.push([
      text(p.period.label),
      p.period.start,
      p.period.end,
      s.income.toFixed(2),
      s.spent.toFixed(2),
      s.fees.toFixed(2),
      s.conversionLoss.toFixed(2),
      s.netSavings.toFixed(2),
      s.savingsRate ? s.savingsRate.times(100).toFixed(1) : "",
      p.closing.total.toFixed(2),
      ...sourceIds.flatMap((id) => [
        s.incomeBySource.get(id)?.toFixed(2) ?? "0.00",
        s.spentBySource.get(id)?.toFixed(2) ?? "0.00",
        p.closing.sources.find((x) => x.sourceId === id)?.baseValue.toFixed(2) ?? "0.00",
      ]),
      openingId ? (p.closing.sources.find((x) => x.sourceId === openingId)?.baseValue.toFixed(2) ?? "0.00") : "",
    ]);
  }
  return toCsv(rows);
}
