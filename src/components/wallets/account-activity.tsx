"use client";

import { useAddFlow } from "@/components/transaction/add-flow";
import { useApp } from "@/components/app-provider";
import { formatRelativeDay } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  /** signed amount on this account, formatted */
  delta: string;
  positive: boolean;
  balanceAfter: string;
  tx: import("@/lib/finance/types").LedgerTx;
}

/** The statement view: what moved this account, and what was left after each entry. */
export function AccountActivity({ items }: { items: ActivityItem[] }) {
  const { openEdit } = useAddFlow();
  const { today } = useApp();
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" onClick={() => openEdit(i.tx)} className="flex w-full items-center gap-4 px-3 py-3 text-left transition hover:bg-ink/[0.04]">
            <span className="w-[88px] shrink-0 text-[13px] text-ink-3">{formatRelativeDay(i.date, today)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">{i.title}</span>
              <span className="block truncate text-[12.5px] text-ink-3">{i.subtitle}</span>
            </span>
            <span className={cn("num shrink-0 text-right text-[15px] font-bold", i.positive ? "text-c-in" : "text-ink")}>{i.delta}</span>
            <span className="num hidden w-28 shrink-0 text-right text-[13.5px] text-ink-2 sm:block">{i.balanceAfter}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
