"use client";

import { Pause, Plus, SkipForward, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRecurringAction, markRecurringPaidAction, saveRecurringAction, skipOccurrenceAction } from "@/app/actions";
import { useApp, useFmt } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/field";
import { Dot, IconBubble } from "@/components/ui/icon-bubble";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useForm } from "@/components/use-form";
import { useRunAction } from "@/components/use-action";
import type { RecurringView } from "@/lib/app-types";
import { sourceColor } from "@/lib/colors";
import { COMMON_CURRENCIES } from "@/lib/finance/currency";
import { formatDateShort, relativeDays } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";
import type { RecurringRow } from "@/server/views/settings";
import { Section } from "./parts";

interface Values {
  description: string;
  amount: string;
  currency: string;
  accountId: string;
  categoryId: string;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: string;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  split: boolean;
  shares: Record<string, string>;
}

function RecurringSheet({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: RecurringView | null }) {
  const app = useApp();
  const live = app.accounts.filter((a) => !a.archived);
  const sources = app.sources.filter((s) => !s.isSystem && s.isActive);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const firstAccount = item ? app.accounts.find((a) => a.id === item.accountId) : live[0];

  const form = useForm<Values>({
    description: item?.description ?? "",
    amount: item?.amount ?? "",
    currency: item?.currency ?? firstAccount?.currency ?? app.settings.baseCurrency,
    accountId: item?.accountId ?? firstAccount?.id ?? "",
    categoryId: item?.categoryId ?? "",
    frequency: item?.frequency ?? "MONTHLY",
    interval: String(item?.interval ?? 1),
    dayOfMonth: item?.dayOfMonth ? String(item.dayOfMonth) : "",
    startDate: item?.startDate ?? app.today,
    endDate: item?.endDate ?? "",
    isActive: item?.isActive ?? true,
    split: Boolean(item?.sourceShares),
    shares: Object.fromEntries(Object.entries(item?.sourceShares ?? {}).map(([k, v]) => [k, String(v)])),
  });
  const { values: v, set, errors, formError, pending } = form;
  const shareSum = Object.values(v.shares).reduce((a, x) => a + (Number(x) || 0), 0);

  function save() {
    form.submit(
      (vals) =>
        saveRecurringAction(item?.id ?? null, {
          description: vals.description,
          amount: vals.amount,
          currency: vals.currency,
          accountId: vals.accountId,
          categoryId: vals.categoryId || null,
          frequency: vals.frequency,
          interval: Math.max(1, Number(vals.interval) || 1),
          dayOfMonth: vals.frequency === "MONTHLY" && vals.dayOfMonth ? Number(vals.dayOfMonth) : null,
          startDate: vals.startDate,
          endDate: vals.endDate || null,
          isActive: vals.isActive,
          sourceShares: vals.split ? Object.fromEntries(Object.entries(vals.shares).map(([k, x]) => [k, Number(x) || 0])) : null,
        }),
      { success: item ? "Saved" : "Recurring payment added", onOk: () => onOpenChange(false) },
    );
  }

  async function remove() {
    if (!item) return;
    const res = await deleteRecurringAction(item.id);
    setConfirmDelete(false);
    if (res.ok) {
      toast.success("Deleted. Payments already recorded stay.");
      onOpenChange(false);
    } else toast.error(res.error);
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={item ? "Edit recurring payment" : "New recurring payment"}
        footer={
          <div className="flex items-center gap-2.5">
            {item ? (
              <Button variant="danger" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete">
                <Trash2 className="size-[18px]" />
              </Button>
            ) : null}
            <Button variant="primary" size="lg" className="flex-1" disabled={pending} onClick={save}>
              {pending ? "Saving…" : item ? "Save changes" : "Add"}
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
          <Field label="What is it?" error={errors.description}>
            <Input value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Rent, Internet, Gym" autoFocus={!item} invalid={Boolean(errors.description)} />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Amount" error={errors.amount}>
              <Input value={v.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.,\s]/g, ""))} inputMode="decimal" placeholder="0.00" className="num" invalid={Boolean(errors.amount)} />
            </Field>
            <Field label="Currency">
              <Select value={v.currency} onChange={(e) => set("currency", e.target.value)} aria-label="Currency" className="min-w-28">
                {[...new Set([app.settings.baseCurrency, ...COMMON_CURRENCIES, v.currency])].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Paid from" error={errors.accountId}>
              <Select
                value={v.accountId}
                onChange={(e) => {
                  set("accountId", e.target.value);
                  const a = app.accounts.find((x) => x.id === e.target.value);
                  if (a && !item) set("currency", a.currency);
                }}
                aria-label="Account"
              >
                {live.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)} aria-label="Category">
                <option value="">None</option>
                {app.categories.filter((c) => !c.archived || c.id === v.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Repeats">
            <Segmented full value={v.frequency} onChange={(f) => set("frequency", f)} options={[{ value: "WEEKLY", label: "Weekly" }, { value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly" }]} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Every">
              <div className="flex items-center gap-2.5">
                <Input value={v.interval} onChange={(e) => set("interval", e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" aria-label="Interval" className="num w-20 text-center" />
                <span className="text-[14px] text-ink-2">{v.frequency === "WEEKLY" ? "week(s)" : v.frequency === "MONTHLY" ? "month(s)" : "year(s)"}</span>
              </div>
            </Field>
            {v.frequency === "MONTHLY" ? (
              <Field label="On day of the month" hint="Short months use their last day.">
                <Input value={v.dayOfMonth} onChange={(e) => set("dayOfMonth", e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="Same as start" className="num" />
              </Field>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First due" error={errors.startDate}>
              <Input type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} invalid={Boolean(errors.startDate)} />
            </Field>
            <Field label="Ends" hint="Optional">
              <Input type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
          </div>
          {sources.length > 1 ? (
            <div className="rounded-[20px] bg-surface p-4 ring-1 ring-line">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block text-[14.5px] font-semibold text-ink">Split between incomes</span>
                  <span className="block text-[12.5px] text-ink-3">Otherwise it follows the money in the account you pay from.</span>
                </span>
                <Switch checked={v.split} onCheckedChange={(on) => set("split", on)} aria-label="Split between incomes" />
              </label>
              {v.split ? (
                <div className="mt-4 flex flex-col gap-3">
                  {sources.map((x) => (
                    <div key={x.id} className="flex items-center gap-3">
                      <Dot color={sourceColor(x.color)} size={9} />
                      <span className="flex-1 text-[14px] font-semibold text-ink">{x.name}</span>
                      <Input value={v.shares[x.id] ?? ""} onChange={(e) => set("shares", { ...v.shares, [x.id]: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="0" aria-label={`${x.name} share`} className="num h-10 w-20 text-right" />
                      <span className="w-4 text-[13px] text-ink-3">%</span>
                    </div>
                  ))}
                  <p className={cn("text-right text-[12.5px] font-semibold", Math.abs(shareSum - 100) < 0.01 ? "text-ink-3" : "text-c-out")}>{Math.abs(shareSum - 100) < 0.01 ? "Adds up to 100%" : `Adds up to ${shareSum}%`}</p>
                  {errors.sourceShares ? <p className="text-[13px] text-danger">{errors.sourceShares}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line">
            <span className="text-[14.5px] font-semibold text-ink">Active</span>
            <Switch checked={v.isActive} onCheckedChange={(on) => set("isActive", on)} aria-label="Active" />
          </div>
          <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">Nothing is deducted until you mark an occurrence as paid. Until then it only shows up as upcoming and in your forecast.</p>
          {formError && Object.keys(errors).length === 0 ? <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-c-out">{formError}</p> : null}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Sheet>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this recurring payment?" confirmLabel="Delete" danger onConfirm={remove}>
        <p>
          <span className="font-semibold text-ink">{item?.description}</span> will stop appearing as upcoming. Payments you already recorded stay in your history.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function RecurringSettings({ items, rows }: { items: RecurringView[]; rows: Record<string, RecurringRow> }) {
  const app = useApp();
  const fmt = useFmt();
  const { run, pending } = useRunAction();
  const [edit, setEdit] = useState<{ item: RecurringView | null; key: number } | null>(null);

  return (
    <Section
      id="recurring"
      title="Recurring payments"
      intro="Rent, subscriptions, memberships. They show up as upcoming and in your forecast, and only leave an account when you mark them paid."
      action={
        <Button variant="soft" size="sm" onClick={() => setEdit({ item: null, key: Date.now() })}>
          <Plus className="size-4" />
          Add
        </Button>
      }
    >
      {items.length === 0 ? <p className="px-4 py-8 text-center text-[14px] text-ink-3">Nothing recurring yet.</p> : null}
      <ul>
        {items.map((it) => {
          const r = rows[it.id];
          const category = it.categoryId ? app.categories.find((c) => c.id === it.categoryId) : null;
          return (
            <li key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line px-3 py-3 last:border-b-0 sm:px-4">
              <IconBubble icon={category?.icon ?? "repeat"} color={category?.color ?? "#5BB5A2"} size={40} />
              <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                <p className="flex items-center gap-2 truncate text-[15px] font-semibold text-ink">
                  {it.description}
                  {!it.isActive ? <Pause className="size-3.5 text-ink-3" aria-label="Paused" /> : null}
                </p>
                <p className="truncate text-[12.5px] text-ink-3">
                  {r?.scheduleText} · {r?.accountName}
                </p>
              </div>
              <div className="text-right">
                <p className="num text-[15px] font-bold text-ink">{fmt.money(it.amount, it.currency)}</p>
                {r?.next ? (
                  <p className={cn("text-[12.5px]", r.next.status === "overdue" ? "font-semibold text-c-out" : "text-ink-3")}>
                    {r.next.status === "overdue" ? "Overdue · " : "Next "}
                    {formatDateShort(r.next.dueDate, app.today)} · {relativeDays(r.next.dueDate, app.today)}
                  </p>
                ) : (
                  <p className="text-[12.5px] text-ink-3">{it.isActive ? "No more due dates" : "Paused"}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {r?.next && it.isActive && r.next.dueDate <= app.today ? (
                  <Button size="xs" variant="soft" disabled={pending} onClick={() => run((confirm) => markRecurringPaidAction(it.id, r.next!.dueDate, {}, confirm), { success: `${it.description} marked paid` })}>
                    Mark paid
                  </Button>
                ) : null}
                {r?.next && it.isActive ? (
                  <Button size="iconSm" variant="ghost" title="Skip this one" aria-label="Skip the next occurrence" disabled={pending} onClick={() => run(() => skipOccurrenceAction(it.id, r.next!.dueDate, true), { success: "Skipped" })}>
                    <SkipForward className="size-4" />
                  </Button>
                ) : null}
                <Button size="xs" variant="subtle" onClick={() => setEdit({ item: it, key: Date.now() })}>
                  Edit
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {edit ? <RecurringSheet key={edit.key} open onOpenChange={(o) => !o && setEdit(null)} item={edit.item} /> : null}
    </Section>
  );
}
