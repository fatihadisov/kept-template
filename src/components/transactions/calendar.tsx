import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { Fmt } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { type TransactionsModel, weekdayHeaders } from "@/server/views/transactions";
import { parseISO } from "@/lib/finance/dates";

/** Daily spending at a glance: intensity is one hue, light to dark (more spent = darker). Tap a day to see its entries. */
export function CalendarView({ model, fmt, today, weekStartsOn, baseParams }: { model: NonNullable<TransactionsModel["calendar"]>; fmt: Fmt; today: string; weekStartsOn: number; baseParams: URLSearchParams }) {
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(baseParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/transactions?${p}`;
  };
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-extrabold tracking-tight text-ink">{model.label}</h3>
          <p className="num mt-0.5 text-[13.5px] text-ink-2">{fmt.inBase(model.monthSpent, { decimals: 0 })} spent</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={href({ month: model.prev })} aria-label="Previous month" className="grid size-9 place-items-center rounded-full bg-ink/[0.06] text-ink-2 hover:bg-ink/[0.1] hover:text-ink">
            <ChevronLeft className="size-[18px]" />
          </Link>
          <Link href={href({ month: model.next })} aria-label="Next month" className="grid size-9 place-items-center rounded-full bg-ink/[0.06] text-ink-2 hover:bg-ink/[0.1] hover:text-ink">
            <ChevronRight className="size-[18px]" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid" aria-label={`Spending in ${model.label}`}>
        {weekdayHeaders(weekStartsOn).map((d) => (
          <div key={d} className="pb-1 text-center text-[11.5px] font-semibold text-ink-3">
            {d}
          </div>
        ))}
        {model.weeks.flat().map((cell) => {
          const day = parseISO(cell.date).d;
          const pct = Math.round(10 + cell.intensity * 62);
          return (
            <Link
              key={cell.date}
              href={href({ from: cell.date, to: cell.date, view: null, month: null })}
              role="gridcell"
              aria-label={`${cell.date}: ${cell.count} entries, ${fmt.inBase(cell.spent, { decimals: 0 })} spent`}
              className={cn(
                "group relative flex aspect-square min-h-[46px] flex-col justify-between rounded-xl p-1.5 text-left transition hover:ring-2 hover:ring-accent/50 sm:min-h-[64px] sm:p-2",
                !cell.inMonth && "opacity-30",
                cell.date === today && "ring-2 ring-ink/40",
              )}
              style={{ backgroundColor: cell.spent.gt(0) ? `color-mix(in srgb, var(--c-out) ${pct}%, var(--surface))` : "color-mix(in srgb, var(--text) 4%, var(--surface))" }}
            >
              <span className="text-[12px] font-bold text-ink">{day}</span>
              <span className="flex items-end justify-between gap-1">
                {cell.income.gt(0) ? <span className="mb-0.5 size-1.5 shrink-0 rounded-full bg-c-in" aria-label="Income received" /> : <span />}
                {cell.spent.gt(0) ? <span className="num text-[10.5px] font-bold leading-none text-ink sm:text-[11.5px]">{fmt.compact(cell.spent.toFixed(0))}</span> : null}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2 text-[12px] text-ink-3">
        Less
        {[10, 28, 46, 64, 82].map((p) => (
          <span key={p} className="size-3.5 rounded-[5px]" style={{ backgroundColor: `color-mix(in srgb, var(--c-out) ${p}%, var(--surface))` }} aria-hidden />
        ))}
        More
        <span className="ml-3 inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-c-in" /> income
        </span>
      </div>
    </Card>
  );
}
