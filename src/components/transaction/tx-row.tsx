"use client";

import { ArrowDownLeft, ArrowLeftRight, Landmark, RefreshCw, Scale, type LucideIcon } from "lucide-react";
import { Fragment } from "react";
import { IconBubble, Dot } from "@/components/ui/icon-bubble";
import { cn } from "@/lib/utils";
import type { TxRowModel } from "@/server/views/tx-rows";
import { formatRelativeDay } from "@/lib/finance/dates";
import { useAddFlow } from "./add-flow";
import { useApp } from "@/components/app-provider";

const TYPE_VISUAL: Record<string, { icon: LucideIcon; color: string }> = {
  INCOME: { icon: ArrowDownLeft, color: "var(--c-in)" },
  TRANSFER: { icon: ArrowLeftRight, color: "var(--text-2)" },
  EXCHANGE: { icon: RefreshCw, color: "var(--text-2)" },
  OPENING: { icon: Landmark, color: "var(--text-2)" },
  ADJUSTMENT: { icon: Scale, color: "var(--text-2)" },
  REFUND: { icon: ArrowDownLeft, color: "var(--c-in)" },
};

function TypeBubble({ type, size }: { type: string; size: number }) {
  const v = TYPE_VISUAL[type] ?? TYPE_VISUAL.TRANSFER;
  const Icon = v.icon;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, backgroundColor: `color-mix(in srgb, ${v.color} 15%, transparent)`, color: v.color }}
    >
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={2.2} />
    </span>
  );
}

/** One transaction. Tapping it opens the same form used to add one, in edit mode. */
export function TxRow({ row, showDate, className }: { row: TxRowModel; showDate?: boolean; className?: string }) {
  const { openEdit } = useAddFlow();
  const { today } = useApp();
  // "$800.00 → ₼1,352.00" is too wide to sit beside a title on a phone, so it drops below it there.
  const stacked = row.amount.includes("→");
  return (
    <button
      type="button"
      onClick={() => openEdit(row.tx)}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left transition hover:bg-ink/[0.045] active:bg-ink/[0.07]",
        stacked && "max-sm:flex-wrap max-sm:gap-y-1.5",
        className,
      )}
    >
      {row.visual.kind === "category" ? <IconBubble icon={row.visual.icon} color={row.visual.color} size={42} /> : <TypeBubble type={row.type} size={42} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink">{row.title}</div>
        <div className="flex min-w-0 items-center gap-x-2 truncate text-[13px] text-ink-2">
          {showDate ? <span className="shrink-0">{formatRelativeDay(row.date, today)} ·</span> : null}
          <span className="truncate">{row.subtitle}</span>
        </div>
        {row.attribution.length > 0 ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
            {row.attribution.map((a, i) => (
              <Fragment key={`${a.name}-${i}`}>
                <span className="inline-flex items-center gap-1.5">
                  <Dot color={a.color} size={7} />
                  {a.name} <span className="num">{Math.round(a.pct)}%</span>
                </span>
              </Fragment>
            ))}
          </div>
        ) : null}
      </div>
      <div className={cn("shrink-0 text-right", stacked && "max-sm:flex max-sm:basis-full max-sm:items-baseline max-sm:justify-between max-sm:gap-3 max-sm:pl-14 max-sm:text-left")}>
        <div className={cn("num text-[15px] font-bold", row.tone === "in" ? "text-c-in" : "text-ink")}>{row.amount}</div>
        {row.secondary ? <div className="num text-[12.5px] text-ink-3">{row.secondary}</div> : null}
      </div>
    </button>
  );
}

/** A plain list of rows. */
export function TxList({ rows, showDate, className }: { rows: TxRowModel[]; showDate?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      {rows.map((row) => (
        <TxRow key={row.id} row={row} showDate={showDate} />
      ))}
    </div>
  );
}
