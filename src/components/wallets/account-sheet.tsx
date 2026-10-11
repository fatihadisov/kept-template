"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addRateAction, archiveAccountAction, deleteAccountAction, saveAccountAction } from "@/app/actions";
import { useApp, useFmt } from "@/components/app-provider";
import { useAddFlow } from "@/components/transaction/add-flow";
import { parse, rateBookOf } from "@/components/transaction/form-logic";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Swatches } from "@/components/ui/swatches";
import { useForm } from "@/components/use-form";
import type { AccountKind, AccountView } from "@/lib/app-types";
import { ACCOUNT_COLORS } from "@/lib/defaults";
import { COMMON_CURRENCIES, currencyName } from "@/lib/finance/currency";

export interface OpeningInfo {
  amount: string;
  date: string;
  kind: string;
}

interface Values {
  name: string;
  type: AccountKind;
  currency: string;
  nickname: string;
  color: string;
  openingBalance: string;
  openingDate: string;
  openingKind: "EXISTING_FUNDS" | "PREVIOUS_SAVINGS";
  rateToBase: string;
  /** this card's own rates (optional): value of 1 unit in the reporting currency, and the reverse */
  cardSell: string;
  cardBuy: string;
}

/** Create or edit an account. Money you already own is recorded as existing funds, never as income. */
export function AccountSheet({
  open,
  onOpenChange,
  account,
  opening,
  hasHistory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountView | null;
  opening?: OpeningInfo | null;
  hasHistory?: boolean;
}) {
  const app = useApp();
  const fmt = useFmt();
  const router = useRouter();
  const { openAdd } = useAddFlow();
  const base = app.settings.baseCurrency;
  const editing = Boolean(account);

  const own = (from: string, to: string) =>
    account
      ? [...app.rates].filter((r) => r.accountId === account.id && r.from === from && r.to === to).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]?.rate ?? ""
      : "";

  const form = useForm<Values>({
    name: account?.name ?? "",
    type: account?.type ?? "CARD",
    currency: account?.currency ?? base,
    nickname: account?.nickname ?? "",
    color: account?.color ?? (ACCOUNT_COLORS[app.accounts.length % ACCOUNT_COLORS.length] as string),
    openingBalance: opening?.amount ?? "",
    openingDate: opening?.date ?? app.today,
    openingKind: opening?.kind === "PREVIOUS_SAVINGS" ? "PREVIOUS_SAVINGS" : "EXISTING_FUNDS",
    rateToBase: "",
    cardSell: account ? own(account.currency, base) : "",
    cardBuy: account ? own(base, account.currency) : "",
  });
  const { values: v, set, errors, formError, pending } = form;
  const [other, setOther] = useState(!COMMON_CURRENCIES.includes(v.currency));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Once an account has entries, "balance" in this form is only where it STARTED. Say so, and show
  // what it holds now and what the typed starting balance would make it hold.
  const startedWith = editing && hasHistory && opening ? parse(opening.amount) : null;
  const holdsNow = editing && hasHistory && account ? parse(app.balances[account.id] ?? "") : null;
  const typedStart = v.openingBalance.trim() ? parse(v.openingBalance) : parse("0");
  const holdsAfter = holdsNow && startedWith && typedStart ? holdsNow.minus(startedWith).plus(typedStart) : null;
  const startChanged = Boolean(startedWith && typedStart && !startedWith.equals(typedStart));

  const foreign = v.currency !== base && /^[A-Z]{3}$/.test(v.currency);
  const haveRate = foreign ? Boolean(rateBookOf(app).toBase(v.currency, app.today)) : true;
  const usual = foreign ? rateBookOf(app).toBase(v.currency, app.today) : null;

  function save() {
    form.submit(
      async (vals) => {
        const res = await saveAccountAction(account?.id ?? null, {
          name: vals.name,
          type: vals.type,
          currency: vals.currency,
          nickname: vals.nickname || null,
          color: vals.color,
          openingBalance: vals.openingBalance.trim() ? vals.openingBalance : null,
          openingDate: vals.openingDate || null,
          openingKind: vals.openingKind,
          rateToBase: !haveRate && vals.rateToBase.trim() ? vals.rateToBase : null,
        });
        if (!res.ok) return res;
        // the card's own conversion rates (only when they changed)
        const targetId = res.data.id;
        if (foreign) {
          for (const [text, from, to, prev] of [
            [vals.cardSell, vals.currency, base, own(vals.currency, base)],
            [vals.cardBuy, base, vals.currency, own(base, vals.currency)],
          ] as const) {
            if (text.trim() && text.trim() !== prev) {
              const r = await addRateAction({ from, to, rate: text, effectiveFrom: app.today, accountId: targetId, note: `${vals.name} preferred rate` });
              if (!r.ok) return { ok: false as const, error: r.error, fieldErrors: from === vals.currency ? { cardSell: r.error } : { cardBuy: r.error } };
            }
          }
        }
        return res;
      },
      {
        success: editing ? "Account saved" : "Account added",
        onOk: (data) => {
          onOpenChange(false);
          if (!editing) router.push(`/wallets/${data.id}`);
        },
      },
    );
  }

  async function archive(next: boolean) {
    if (!account) return;
    const res = await archiveAccountAction(account.id, next);
    if (res.ok) {
      toast.success(next ? "Archived. History stays intact." : "Restored");
      onOpenChange(false);
    } else toast.error(res.error);
  }

  async function remove() {
    if (!account) return;
    const res = await deleteAccountAction(account.id);
    if (res.ok) {
      setConfirmDelete(false);
      onOpenChange(false);
      toast.success("Account deleted");
      router.push("/wallets");
    } else {
      setConfirmDelete(false);
      toast.error(res.error);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? "Edit account" : "New account"}
        footer={
          <div className="flex items-center gap-2.5">
            {editing && account ? (
              <>
                <Button variant="subtle" size="icon" onClick={() => archive(!account.archived)} aria-label={account.archived ? "Restore account" : "Archive account"} title={account.archived ? "Restore" : "Archive"}>
                  {account.archived ? <ArchiveRestore className="size-[18px]" /> : <Archive className="size-[18px]" />}
                </Button>
                {!hasHistory ? (
                  <Button variant="danger" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete account">
                    <Trash2 className="size-[18px]" />
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button variant="primary" size="lg" className="flex-1" disabled={pending} onClick={save}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add account"}
            </Button>
          </div>
        }
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label="Name" error={errors.name} htmlFor="acc-name">
            <Input id="acc-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. USD card, Cash AZN, Savings" autoFocus={!editing} invalid={Boolean(errors.name)} />
          </Field>

          <Field label="Kind">
            <Segmented
              full
              value={v.type}
              onChange={(t) => set("type", t)}
              options={[
                { value: "CARD", label: "Card" },
                { value: "CASH", label: "Cash" },
                { value: "SAVINGS", label: "Savings" },
                { value: "OTHER", label: "Other" },
              ]}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Currency" error={errors.currency} hint={editing && hasHistory ? "Locked: this account already has history." : undefined}>
              {other ? (
                <Input value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().slice(0, 3))} placeholder="3-letter code" maxLength={3} disabled={editing && hasHistory} invalid={Boolean(errors.currency)} />
              ) : (
                <Select
                  value={v.currency}
                  onChange={(e) => (e.target.value === "__other" ? (setOther(true), set("currency", "")) : set("currency", e.target.value))}
                  disabled={editing && hasHistory}
                  aria-label="Currency"
                >
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c} · {currencyName(c)}
                    </option>
                  ))}
                  <option value="__other">Another currency…</option>
                </Select>
              )}
            </Field>
            <Field label="Nickname" hint="Optional. Never enter card numbers.">
              <Input value={v.nickname} onChange={(e) => set("nickname", e.target.value)} placeholder="e.g. Everyday" maxLength={40} />
            </Field>
          </div>

          {foreign && !haveRate ? (
            <Field label={`1 ${v.currency} is worth how many ${base}?`} error={errors.rateToBase} hint="Needed once, to value this balance. You can refine rates anytime in Settings.">
              <Input value={v.rateToBase} onChange={(e) => set("rateToBase", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder={v.currency === "USD" ? "e.g. 1.70" : "Rate"} invalid={Boolean(errors.rateToBase)} className="num" />
            </Field>
          ) : null}

          <div className="rounded-[20px] bg-surface p-4 ring-1 ring-line">
            <p className="text-[14px] font-semibold text-ink">{startedWith ? "Starting balance" : "Money already in it"}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">
              {startedWith
                ? "What it held when you began tracking it. Everything you record from that date on is added on top, so this is not today's balance."
                : "Counts toward your total but never as salary or income."}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={startedWith ? "Started with" : "Balance"} error={errors.openingBalance}>
                <Input value={v.openingBalance} onChange={(e) => set("openingBalance", e.target.value.replace(/[^\d.,\s]/g, ""))} inputMode="decimal" placeholder="0.00" className="num" invalid={Boolean(errors.openingBalance)} />
              </Field>
              <Field label={startedWith ? "Starting on" : "As of"} error={errors.openingDate}>
                <Input type="date" value={v.openingDate} onChange={(e) => set("openingDate", e.target.value)} max={app.today} />
              </Field>
            </div>
            <div className="mt-3">
              <Segmented
                full
                size="sm"
                value={v.openingKind}
                onChange={(k) => set("openingKind", k)}
                options={[
                  { value: "EXISTING_FUNDS", label: "Existing funds" },
                  { value: "PREVIOUS_SAVINGS", label: "Previous savings" },
                ]}
              />
            </div>
            {startedWith && holdsNow && account ? (
              <div className="mt-3 rounded-2xl bg-bg px-3.5 py-3 text-[13px] leading-snug text-ink-2">
                <p>
                  It holds <span className="num font-semibold text-ink">{fmt.money(holdsNow, account.currency)}</span> today, counting everything recorded since it started.
                </p>
                {startChanged && holdsAfter ? (
                  <p className="mt-1">
                    With this starting balance it would hold <span className="num font-semibold text-ink">{fmt.money(holdsAfter, account.currency)}</span>.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    openAdd({ type: "ADJUSTMENT", initial: { accountId: account.id } });
                  }}
                  className="mt-2 text-left font-semibold text-accent hover:underline"
                >
                  Want it to match what you really have? Update the balance instead →
                </button>
              </div>
            ) : null}
          </div>

          {foreign && editing ? (
            <div className="rounded-[20px] bg-surface p-4 ring-1 ring-line">
              <p className="text-[14px] font-semibold text-ink">This card&rsquo;s own rates</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">
                If it converts at a different rate than the market ({usual ? `${fmt.rate(usual)}` : "—"}), enter what it actually uses. It will be suggested whenever you convert or pay in another currency with this card.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={`1 ${v.currency} →  ${base}`} error={errors.cardSell}>
                  <Input value={v.cardSell} onChange={(e) => set("cardSell", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder={usual ? usual.toFixed() : ""} className="num" />
                </Field>
                <Field label={`1 ${base} → ${v.currency}`} error={errors.cardBuy}>
                  <Input value={v.cardBuy} onChange={(e) => set("cardBuy", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder={usual && !usual.isZero() ? (1 / usual.toNumber()).toFixed(6) : ""} className="num" />
                </Field>
              </div>
            </div>
          ) : null}

          <Field label="Colour">
            <Swatches value={v.color} onChange={(c) => set("color", c)} options={ACCOUNT_COLORS.map((c) => ({ value: c, css: c }))} />
          </Field>

          {formError && Object.keys(errors).length === 0 ? <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-c-out">{formError}</p> : null}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Sheet>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this account?" confirmLabel="Delete" danger onConfirm={remove}>
        <p>
          <span className="font-semibold text-ink">{account?.name}</span> has no activity yet, so nothing else is affected. Accounts with history can only be archived.
        </p>
      </ConfirmDialog>
    </>
  );
}
