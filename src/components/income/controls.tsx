"use client";

import { Pencil, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import { useAddFlow } from "@/components/transaction/add-flow";
import { Button } from "@/components/ui/button";
import type { SourceView } from "@/lib/app-types";
import type { LedgerTx } from "@/lib/finance/types";
import { IncomeSourceSheet } from "./source-sheet";

/** `autoOpen` is for the "?new=1" link from getting started: one button opens its sheet, then the link is cleaned up. */
export function AddIncomeButton({ autoOpen, label = "New income" }: { autoOpen?: boolean; label?: string }) {
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
        {label}
      </Button>
      {open ? <IncomeSourceSheet key="new" open={open} onOpenChange={onOpenChange} /> : null}
    </>
  );
}

export function EditIncomeButton({ source, hasHistory }: { source: SourceView; hasHistory: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${source.name}`}>
        <Pencil className="size-3.5" />
        Edit
      </Button>
      {open ? <IncomeSourceSheet key={source.id} open={open} onOpenChange={setOpen} source={source} hasHistory={hasHistory} /> : null}
    </>
  );
}

/** "Record this pay" with the stream, destination, amount and pay date already filled in. */
export function RecordPaymentButton({
  streamId,
  accountId,
  amount,
  dueDate,
  label = "Record payment",
  variant = "soft",
}: {
  streamId: string;
  accountId: string | null;
  amount: string | null;
  dueDate: string | null;
  label?: string;
  variant?: "soft" | "primary";
}) {
  const { openAdd } = useAddFlow();
  const { today } = useApp();
  return (
    <Button
      size="sm"
      variant={variant}
      onClick={() =>
        openAdd({
          type: "INCOME",
          initial: { type: "INCOME", date: today, accountId: accountId ?? "", incomeSourceId: streamId, amount: amount ?? "", ...(dueDate ? { expectedDate: dueDate } : {}) },
        })
      }
    >
      {label}
    </Button>
  );
}

/** One received payment, tap to edit. */
export function PaymentChip({ tx, text }: { tx: LedgerTx; text: string }) {
  const { openEdit } = useAddFlow();
  return (
    <button type="button" onClick={() => openEdit(tx)} className="num rounded-full bg-ink/[0.06] px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 transition hover:bg-ink/[0.1] hover:text-ink">
      {text}
    </button>
  );
}

/** Text that opens an entry for editing: used where the entry's own figure is the content. */
export function PaymentLink({ tx, children }: { tx: LedgerTx; children: React.ReactNode }) {
  const { openEdit } = useAddFlow();
  return (
    <button type="button" onClick={() => openEdit(tx)} className="text-left underline decoration-ink/20 decoration-1 underline-offset-4 transition hover:decoration-accent">
      {children}
    </button>
  );
}
