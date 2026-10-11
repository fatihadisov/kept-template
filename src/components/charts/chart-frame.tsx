"use client";

import { Table2, ChartColumn } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface LegendItem {
  label: string;
  color: string;
  /** mirror the mark: a rect for bars/areas, a short line for lines */
  shape?: "rect" | "line" | "dot";
}

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
  /** right-align from this column on (numbers) */
  numericFrom?: number;
}

/** A legend is always shown for two or more series: the dependable identity channel. */
export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)} aria-label="Legend">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[13px] text-ink-2">
          <span
            aria-hidden
            className={cn("inline-block shrink-0", item.shape === "line" ? "h-[3px] w-4 rounded-full" : item.shape === "dot" ? "size-2.5 rounded-full" : "size-2.5 rounded-[3px]")}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ table }: { table: TableData }) {
  const from = table.numericFrom ?? 1;
  return (
    <div className="scroll-thin max-h-[320px] overflow-auto rounded-2xl ring-1 ring-line">
      <table className="w-full text-[13.5px]">
        <thead className="sticky top-0 bg-surface-2 text-left text-ink-2">
          <tr>
            {table.columns.map((c, i) => (
              <th key={c} scope="col" className={cn("whitespace-nowrap px-3.5 py-2.5 font-semibold", i >= from && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="border-t border-line">
              {row.map((cell, i) => (
                <td key={i} className={cn("whitespace-nowrap px-3.5 py-2 text-ink", i >= from ? "num text-right" : "font-medium")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The container every chart lives in: title, an always-visible legend for multi-series charts, and a
 * toggle to the data table, the accessible twin of the picture.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
  actions,
  toolbar,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: LegendItem[];
  table?: TableData;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  /** a row of controls (e.g. tabs) shown under the title */
  toolbar?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="text-[15px] font-semibold text-ink">
            {title}
          </h3>
          {subtitle ? <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p> : null}
        </div>
        <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1">
          {actions}
          {table ? (
            <button
              type="button"
              onClick={() => setView(view === "chart" ? "table" : "chart")}
              aria-pressed={view === "table"}
              aria-label={view === "table" ? "Show chart" : "Show data as a table"}
              title={view === "table" ? "Show chart" : "Show as table"}
              className="grid size-8 place-items-center rounded-full text-ink-3 transition hover:bg-ink/[0.06] hover:text-ink"
            >
              {view === "table" ? <ChartColumn className="size-4" /> : <Table2 className="size-4" />}
            </button>
          ) : null}
        </div>
      </header>
      {toolbar ? <div className="mt-3">{toolbar}</div> : null}
      {legend && legend.length > 1 && view === "chart" ? <Legend items={legend} className="mt-3" /> : null}
      <div className="mt-4" role="group" aria-labelledby={id}>
        {view === "chart" || !table ? children : <DataTable table={table} />}
      </div>
    </Card>
  );
}
