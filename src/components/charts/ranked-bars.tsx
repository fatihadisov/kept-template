import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RankedItem {
  key: string;
  label: string;
  /** numeric size of the bar */
  value: number;
  valueText: string;
  /** secondary text beside the value (e.g. "34%") */
  hint?: string;
  icon?: ReactNode;
  href?: string;
  /** small text under the label */
  sub?: string;
}

/**
 * Ranked horizontal bars: the honest way to show "where did it go". One series, so every bar wears the
 * same single hue; the value sits at the bar end, the label above.
 */
export function RankedBars({ items, color = "var(--c-out)", className, emptyText }: { items: RankedItem[]; color?: string; className?: string; emptyText?: string }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  if (items.length === 0) return emptyText ? <p className="py-6 text-center text-[14px] text-ink-3">{emptyText}</p> : null;
  return (
    <ul className={cn("flex flex-col gap-4", className)}>
      {items.map((item) => {
        const body = (
          <>
            <div className="flex items-center gap-3">
              {item.icon}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14.5px] font-semibold text-ink">{item.label}</span>
                  <span className="num shrink-0 text-[14.5px] font-bold text-ink">
                    {item.valueText}
                    {item.hint ? <span className="ml-2 text-[12.5px] font-semibold text-ink-3">{item.hint}</span> : null}
                  </span>
                </div>
                {item.sub ? <div className="truncate text-[12.5px] text-ink-3">{item.sub}</div> : null}
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                  <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (item.value / max) * 100) : 0}%`, backgroundColor: color }} />
                </div>
              </div>
            </div>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="-mx-2 block rounded-2xl px-2 py-1.5 transition hover:bg-ink/[0.04]">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
