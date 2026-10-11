"use client";

import { History, Pencil, Plus, Scale } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { useAddFlow } from "@/components/transaction/add-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AccountView } from "@/lib/app-types";
import { addDays, addMonths, endOfMonth, startOfYear } from "@/lib/finance/dates";
import { AccountSheet, type OpeningInfo } from "./account-sheet";

/** `autoOpen` is for the "?new=1" link from getting started: one button opens its sheet, then the link is cleaned up. */
export function AddAccountButton({ autoOpen }: { autoOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  const router = useRouter();
  const pathname = usePathname();
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && autoOpen) router.replace(pathname, { scroll: false });
  };
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-[18px]" strokeWidth={2.6} />
        Add account
      </Button>
      {open ? <AccountSheet key="new" open={open} onOpenChange={onOpenChange} /> : null}
    </>
  );
}

export function EditAccountButton({ account, opening, hasHistory }: { account: AccountView; opening: OpeningInfo | null; hasHistory: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="subtle" onClick={() => setOpen(true)}>
        <Pencil className="size-4" />
        Edit
      </Button>
      {open ? <AccountSheet key={account.id} open={open} onOpenChange={setOpen} account={account} opening={opening} hasHistory={hasHistory} /> : null}
    </>
  );
}

/**
 * "My real balance is X": opens the balance-correction form for this account. This is the way to
 * bring a balance in line with the bank or the wallet; editing the starting balance is not.
 */
export function UpdateBalanceButton({ accountId }: { accountId: string }) {
  const { openAdd } = useAddFlow();
  return (
    <Button variant="soft" onClick={() => openAdd({ type: "ADJUSTMENT", initial: { accountId } })}>
      <Scale className="size-4" />
      Update balance
    </Button>
  );
}

/** "Take me back to…": see every balance and who it belonged to on any past date. */
export function AsOfControl({ value }: { value: string }) {
  const { today } = useApp();
  const router = useRouter();
  const go = (d: string) => router.push(d >= today ? "/wallets" : `/wallets?asof=${d}`);
  const presets = [
    { label: "Today", date: today },
    { label: "End of last month", date: endOfMonth(addMonths(today, -1)) },
    { label: "End of last year", date: addDays(startOfYear(today), -1) },
    { label: "A year ago", date: addMonths(today, -12) },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="subtle">
          <History className="size-4" />
          {value === today ? "As of today" : `As of ${value}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,300px)] p-3">
        <p className="px-1 pb-2 text-[12.5px] leading-snug text-ink-2">See your balances, and which income each unit of money belonged to, on any day.</p>
        <div className="flex flex-col gap-0.5">
          {presets.map((p) => (
            <PopoverClose asChild key={p.label}>
              <button type="button" onClick={() => go(p.date)} className="rounded-xl px-3 py-2 text-left text-[14px] font-semibold text-ink transition hover:bg-ink/[0.05]">
                {p.label}
              </button>
            </PopoverClose>
          ))}
        </div>
        <div className="mt-2 border-t border-line pt-3">
          <Input type="date" value={value} max={today} onChange={(e) => e.target.value && go(e.target.value)} aria-label="Pick a date" className="h-10 text-[14px]" />
        </div>
      </PopoverContent>
    </Popover>
  );
}
