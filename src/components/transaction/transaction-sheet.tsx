"use client";

import { ChevronLeft, Copy, Ellipsis, Trash2, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteTransactionAction,
  duplicateTransactionAction,
  previewDeleteAction,
  saveTransactionAction,
} from "@/app/actions";
import { useApp, useFmt } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Empty } from "@/components/ui/empty";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { MenuTrigger } from "@/components/ui/menu";
import type { Warning } from "@/lib/app-types";
import type { TxType } from "@/lib/finance/types";
import { txToInput } from "@/lib/tx-input";
import type { AddRequest } from "./add-flow";
import { type FormState, blankState, buildInput, liveAccounts, parse, stateFromTx } from "./form-logic";
import { AdjustmentBody, ExchangeBody, ExpenseBody, IncomeBody, OpeningBody, RefundBody, TransferBody } from "./forms";

const MAIN: { value: TxType; label: string }[] = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
  { value: "EXCHANGE", label: "Exchange" },
  { value: "TRANSFER", label: "Transfer" },
];
const EXTRA: { value: TxType; label: string }[] = [
  { value: "REFUND", label: "Refund" },
  { value: "ADJUSTMENT", label: "Balance correction" },
  { value: "OPENING", label: "Opening balance" },
];
const TITLE: Record<TxType, string> = {
  EXPENSE: "expense",
  INCOME: "income",
  EXCHANGE: "exchange",
  TRANSFER: "transfer",
  REFUND: "refund",
  ADJUSTMENT: "balance correction",
  OPENING: "opening balance",
};
const SAVE_LABEL: Record<TxType, string> = {
  EXPENSE: "Add expense",
  INCOME: "Record income",
  EXCHANGE: "Convert",
  TRANSFER: "Move money",
  REFUND: "Record refund",
  ADJUSTMENT: "Save correction",
  OPENING: "Save",
};

function initialState(request: AddRequest, app: ReturnType<typeof useApp>): FormState {
  if (request.edit) return stateFromTx(request.edit, app);
  let s = blankState(request.type ?? "EXPENSE", app);
  const init = (request.initial ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof init[k] === "string" && init[k] !== "" ? (init[k] as string) : null);
  const accountId = str("accountId");
  if (accountId) s = { ...s, accountId };
  const toAccountId = str("toAccountId");
  if (toAccountId) s = { ...s, toAccountId };
  const amount = str("amount");
  if (amount) s = { ...s, amount };
  const date = str("date");
  if (date) s = { ...s, date };
  const source = str("incomeSourceId");
  if (source) s = { ...s, incomeSourceId: source };
  const expected = str("expectedDate");
  if (expected) s = { ...s, expected };
  const categoryId = str("categoryId");
  if (categoryId) s = { ...s, categoryId };
  const description = str("description");
  if (description) s = { ...s, description };
  const currency = str("currency");
  if (currency) s = { ...s, currency };
  return s;
}

export function TransactionSheet({ open, onOpenChange, request }: { open: boolean; onOpenChange: (open: boolean) => void; request: AddRequest }) {
  const app = useApp();
  const fmt = useFmt();
  const editing = request.edit;
  const [state, setState] = useState<FormState>(() => initialState(request, app));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<{ summary: string; warnings: Warning[]; linkedRefunds: number } | null>(null);
  const warnRef = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const patch = (p: Partial<FormState>) => {
    setState((s) => ({ ...s, ...p }));
    if (Object.keys(errors).length) {
      const cleared = { ...errors };
      for (const k of Object.keys(p)) delete cleared[k];
      // editing the account / amount invalidates stale split & charge messages too
      delete cleared.attribution;
      delete cleared.accountAmount;
      setErrors(cleared);
    }
    if (warnings.length) setWarnings([]);
  };

  const switchType = (type: TxType) => {
    if (type === state.type) return;
    const fresh = blankState(type, app);
    const carry = ["EXPENSE", "INCOME", "TRANSFER"].includes(type) && ["EXPENSE", "INCOME", "TRANSFER"].includes(state.type);
    setState({ ...fresh, date: state.date, description: state.description, amount: carry ? state.amount : "" });
    setErrors({});
    setWarnings([]);
    setFormError(null);
  };

  function summaryOf(s: FormState): string {
    const account = app.accounts.find((a) => a.id === s.accountId);
    const amount = parse(s.amount);
    const ccy = s.type === "EXPENSE" || s.type === "REFUND" ? s.currency : (account?.currency ?? app.settings.baseCurrency);
    const money = amount ? fmt.money(amount.abs(), ccy) : "";
    switch (s.type) {
      case "EXPENSE":
        return `Spent ${money}${s.description ? ` · ${s.description}` : ""}`;
      case "INCOME":
        return `Received ${money}`;
      case "EXCHANGE":
        return `Converted ${money}`;
      case "TRANSFER":
        return `Moved ${money}`;
      case "REFUND":
        return `Refund of ${money} recorded`;
      case "ADJUSTMENT":
        return "Balance corrected";
      case "OPENING":
        return `Opening balance ${money} saved`;
    }
  }

  function submit(confirm = false) {
    const built = buildInput(state, app, editing ? "edit" : "create");
    if (!built.ok) {
      setErrors(built.errors);
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    if (!confirm) setWarnings([]);
    const message = summaryOf(state);
    start(async () => {
      const res = await saveTransactionAction({ id: editing?.id, input: built.input, confirm });
      if (res.ok) {
        onOpenChange(false);
        const id = res.data.id;
        if (editing) {
          const previous = txToInput(editing);
          toast.success("Changes saved", {
            action: { label: "Undo", onClick: () => void saveTransactionAction({ id, input: previous, confirm: true }) },
          });
        } else {
          toast.success(message, { action: { label: "Undo", onClick: () => void deleteTransactionAction(id, true) } });
        }
        return;
      }
      if (res.warnings && res.warnings.length > 0) {
        setWarnings(res.warnings);
        requestAnimationFrame(() => warnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
        return;
      }
      setErrors(res.fieldErrors ?? {});
      setFormError(res.error);
    });
  }

  function askDelete() {
    if (!editing) return;
    start(async () => {
      const res = await previewDeleteAction(editing.id);
      if (res.ok) setConfirmDelete(res.data);
      else toast.error(res.error);
    });
  }

  function doDelete() {
    if (!editing) return;
    const snapshot = txToInput(editing);
    start(async () => {
      const res = await deleteTransactionAction(editing.id, true);
      if (res.ok) {
        setConfirmDelete(null);
        onOpenChange(false);
        toast.success("Deleted", { action: { label: "Undo", onClick: () => void saveTransactionAction({ input: snapshot, confirm: true }) } });
      } else toast.error(res.error);
    });
  }

  function duplicate() {
    if (!editing) return;
    start(async () => {
      const res = await duplicateTransactionAction(editing.id);
      if (res.ok) {
        onOpenChange(false);
        toast.success("Copied to today", { action: { label: "Undo", onClick: () => void deleteTransactionAction(res.data.id, true) } });
      } else toast.error(res.error);
    });
  }

  const noAccounts = liveAccounts(app).length === 0;
  const type = state.type;
  const isExtra = EXTRA.some((e) => e.value === type);
  const bodyProps = { state, patch, errors, editing: Boolean(editing) };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? `Edit ${TITLE[editing.type]}` : "Add"}
        hideTitle={!editing}
        footer={
          noAccounts ? null : (
            <div className="flex items-center gap-2.5">
              {editing ? (
                <>
                  <Button variant="danger" size="icon" onClick={askDelete} disabled={pending} aria-label="Delete">
                    <Trash2 className="size-[18px]" />
                  </Button>
                  <Button variant="subtle" size="icon" onClick={duplicate} disabled={pending} aria-label="Duplicate to today" title="Duplicate to today">
                    <Copy className="size-[18px]" />
                  </Button>
                </>
              ) : null}
              <Button variant="primary" size="lg" className="flex-1" disabled={pending} onClick={() => submit(false)}>
                {pending ? "Saving…" : editing ? "Save changes" : SAVE_LABEL[type]}
              </Button>
            </div>
          )
        }
      >
        {noAccounts ? (
          <Empty icon={<Wallet className="size-6" />} title="Add an account first" action={<Button asChild variant="primary" onClick={() => onOpenChange(false)}><Link href="/wallets?new=1">Add account</Link></Button>}>
            Money has to live somewhere: a card, a wallet of cash, a savings account.
          </Empty>
        ) : (
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
            className="flex flex-col gap-6"
          >
            {!editing ? (
              <div className="-mx-1 flex items-center justify-between gap-2">
                {isExtra ? (
                  // the rarer entry types have long names, so they replace the main tabs rather than squeeze in beside them
                  <>
                    <Button variant="subtle" size="icon" onClick={() => switchType("EXPENSE")} aria-label="Back to expense, income, exchange and transfer">
                      <ChevronLeft className="size-[18px]" />
                    </Button>
                    <p className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-ink/[0.06] px-5 text-[14.5px] font-semibold text-ink">
                      <span className="truncate">{EXTRA.find((e) => e.value === type)!.label}</span>
                    </p>
                  </>
                ) : (
                  <Segmented
                    value={type}
                    onChange={switchType}
                    label="Type of entry"
                    className="min-w-0 flex-1 [&>button]:flex-1 [&>button]:px-2"
                    options={MAIN}
                  />
                )}
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="subtle" size="icon" aria-label="More entry types">
                      <Ellipsis className="size-[18px]" />
                    </Button>
                  </MenuTrigger>
                  {/* picking a type mounts a form that focuses its own amount field; don't hand focus back to the "⋯" button */}
                  <MenuContent
                    onCloseAutoFocus={(e) => {
                      if (!picked.current) return;
                      picked.current = false;
                      e.preventDefault();
                      // the menu holds focus until it has closed, so move to the new form's amount afterwards
                      requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('input[inputmode="decimal"]')?.focus());
                    }}
                  >
                    {EXTRA.map((e) => (
                      <MenuItem
                        key={e.value}
                        onSelect={() => {
                          picked.current = true;
                          switchType(e.value);
                        }}
                      >
                        {e.label}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              </div>
            ) : null}

            {type === "EXPENSE" ? <ExpenseBody {...bodyProps} /> : null}
            {type === "INCOME" ? <IncomeBody {...bodyProps} /> : null}
            {type === "EXCHANGE" ? <ExchangeBody {...bodyProps} /> : null}
            {type === "TRANSFER" ? <TransferBody {...bodyProps} /> : null}
            {type === "REFUND" ? <RefundBody {...bodyProps} /> : null}
            {type === "ADJUSTMENT" ? <AdjustmentBody {...bodyProps} /> : null}
            {type === "OPENING" ? <OpeningBody {...bodyProps} /> : null}

            {formError && Object.keys(errors).length === 0 ? (
              <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-c-out">
                {formError}
              </p>
            ) : null}

            {warnings.length > 0 ? (
              <div ref={warnRef} role="alert" className="rounded-2xl bg-amber-soft p-4">
                <div className="flex gap-3">
                  <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-amber" />
                  <div className="flex flex-col gap-1.5 text-[14px] leading-snug text-ink">
                    {warnings.map((w) => (
                      <p key={w.message}>{w.message}</p>
                    ))}
                  </div>
                </div>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" disabled={pending} onClick={() => submit(true)}>
                    Save anyway
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setWarnings([])}>
                    Go back and change it
                  </Button>
                </div>
              </div>
            ) : null}
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete this entry?"
        confirmLabel="Delete"
        danger
        pending={pending}
        onConfirm={doDelete}
      >
        <p>
          <span className="font-semibold text-ink">{confirmDelete?.summary}</span> will be removed and every balance and report will be recalculated.
        </p>
        {confirmDelete && confirmDelete.linkedRefunds > 0 ? <p className="mt-2">{confirmDelete.linkedRefunds} refund{confirmDelete.linkedRefunds === 1 ? " is" : "s are"} linked to it and will stay, unlinked.</p> : null}
        {confirmDelete && confirmDelete.warnings.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-2xl bg-amber-soft p-3 text-[13.5px] text-ink">
            {confirmDelete.warnings.map((w) => (
              <li key={w.message} className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
                {w.message}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-[13px] text-ink-3">You can undo it right after.</p>
      </ConfirmDialog>
    </>
  );
}
