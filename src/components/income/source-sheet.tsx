"use client";

import { Pause, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteIncomeSourceAction, saveIncomeSourceAction, setIncomeActiveAction } from "@/app/actions";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Swatches } from "@/components/ui/swatches";
import { useForm } from "@/components/use-form";
import type { SourceView } from "@/lib/app-types";
import { sourceColor } from "@/lib/colors";
import { SOURCE_SLOTS } from "@/lib/defaults";
import { COMMON_CURRENCIES } from "@/lib/finance/currency";

type ScheduleType = "MONTHLY" | "SEMI_MONTHLY" | "BIWEEKLY" | "WEEKLY" | "ONCE" | "NONE";

interface Values {
  name: string;
  kind: "SALARY" | "BONUS" | "SIDE" | "OTHER";
  currency: string;
  expectedAmount: string;
  scheduleType: ScheduleType;
  day1: string;
  day2: string;
  weekday: string;
  anchor: string;
  destinationAccountId: string;
  color: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Create or edit an income: a salary, bonus or side income. It is separate from the account it lands in. */
export function IncomeSourceSheet({ open, onOpenChange, source, hasHistory }: { open: boolean; onOpenChange: (o: boolean) => void; source?: SourceView | null; hasHistory?: boolean }) {
  const app = useApp();
  const editing = Boolean(source);
  const live = app.accounts.filter((a) => !a.archived);
  const used = app.sources.filter((s) => !s.isSystem).map((s) => s.color);
  const firstFreeSlot = SOURCE_SLOTS.find((slot) => !used.includes(slot)) ?? "a";

  const form = useForm<Values>({
    name: source?.name ?? "",
    kind: (source?.kind as Values["kind"]) ?? "SALARY",
    currency: source?.currency ?? app.settings.baseCurrency,
    expectedAmount: source?.expectedAmount ?? "",
    scheduleType: (source?.scheduleType as ScheduleType) ?? "MONTHLY",
    day1: source?.scheduleDays[0] !== undefined && source.scheduleType !== "WEEKLY" ? String(source.scheduleDays[0]) : "",
    day2: source?.scheduleDays[1] !== undefined ? String(source.scheduleDays[1]) : "",
    weekday: source?.scheduleType === "WEEKLY" ? String(source.scheduleDays[0] ?? 5) : "5",
    anchor: source?.scheduleAnchor ?? "",
    destinationAccountId: source?.destinationAccountId ?? "",
    color: source?.color ?? firstFreeSlot,
  });
  const { values: v, set, errors, formError, pending } = form;
  const [confirmDelete, setConfirmDelete] = useState(false);

  // choose the receiving account that matches the income's currency, unless one is already chosen
  const sensibleAccount = v.destinationAccountId || live.find((a) => a.currency === v.currency)?.id || live[0]?.id || "";

  function save() {
    form.submit(
      (vals) => {
        const days =
          vals.scheduleType === "MONTHLY" ? [Number(vals.day1)] : vals.scheduleType === "SEMI_MONTHLY" ? [Number(vals.day1), Number(vals.day2)] : vals.scheduleType === "WEEKLY" ? [Number(vals.weekday)] : [];
        return saveIncomeSourceAction(source?.id ?? null, {
          name: vals.name,
          kind: vals.kind,
          currency: vals.currency,
          expectedAmount: vals.expectedAmount.trim() ? vals.expectedAmount : null,
          scheduleType: vals.scheduleType,
          scheduleDays: days.filter((d) => Number.isFinite(d) && (d > 0 || vals.scheduleType === "WEEKLY")),
          scheduleAnchor: vals.anchor || null,
          destinationAccountId: vals.destinationAccountId || sensibleAccount || null,
          color: vals.color,
          isActive: source?.isActive ?? true,
        });
      },
      { success: editing ? "Income saved" : "Income added", onOk: () => onOpenChange(false) },
    );
  }

  async function toggle() {
    if (!source) return;
    const res = await setIncomeActiveAction(source.id, !source.isActive);
    if (res.ok) {
      toast.success(source.isActive ? "Paused. History stays; no more reminders." : "Resumed");
      onOpenChange(false);
    } else toast.error(res.error);
  }

  async function remove() {
    if (!source) return;
    const res = await deleteIncomeSourceAction(source.id);
    setConfirmDelete(false);
    if (res.ok) {
      toast.success("Income deleted");
      onOpenChange(false);
    } else toast.error(res.error);
  }

  const needsAnchor = v.scheduleType === "BIWEEKLY" || v.scheduleType === "ONCE";

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? "Edit income" : "New income"}
        footer={
          <div className="flex items-center gap-2.5">
            {editing && source ? (
              <>
                <Button variant="subtle" size="icon" onClick={toggle} aria-label={source.isActive ? "Pause income" : "Resume income"} title={source.isActive ? "Pause" : "Resume"}>
                  {source.isActive ? <Pause className="size-[18px]" /> : <Play className="size-[18px]" />}
                </Button>
                {!hasHistory ? (
                  <Button variant="danger" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete income">
                    <Trash2 className="size-[18px]" />
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button variant="primary" size="lg" className="flex-1" disabled={pending} onClick={save}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add income"}
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
          <Field label="Name" error={errors.name} htmlFor="inc-name">
            <Input id="inc-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Remote job, Main salary, Freelance" autoFocus={!editing} invalid={Boolean(errors.name)} />
          </Field>

          <Field label="Kind">
            <Segmented
              full
              value={v.kind}
              onChange={(k) => set("kind", k)}
              options={[
                { value: "SALARY", label: "Salary" },
                { value: "BONUS", label: "Bonus" },
                { value: "SIDE", label: "Side" },
                { value: "OTHER", label: "Other" },
              ]}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Paid in" error={errors.currency}>
              <Select value={v.currency} onChange={(e) => set("currency", e.target.value)} aria-label="Currency">
                {[...new Set([app.settings.baseCurrency, ...COMMON_CURRENCIES, v.currency])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Usual amount" error={errors.expectedAmount} hint="Optional. Used to spot partial or late pay.">
              <Input value={v.expectedAmount} onChange={(e) => set("expectedAmount", e.target.value.replace(/[^\d.,\s]/g, ""))} inputMode="decimal" placeholder="0.00" className="num" invalid={Boolean(errors.expectedAmount)} />
            </Field>
          </div>

          <Field label="How often">
            <Select value={v.scheduleType} onChange={(e) => set("scheduleType", e.target.value as ScheduleType)} aria-label="Schedule">
              <option value="MONTHLY">Once a month</option>
              <option value="SEMI_MONTHLY">Twice a month</option>
              <option value="BIWEEKLY">Every two weeks</option>
              <option value="WEEKLY">Every week</option>
              <option value="ONCE">One time</option>
              <option value="NONE">No fixed schedule (bonus, side income)</option>
            </Select>
          </Field>

          {v.scheduleType === "MONTHLY" || v.scheduleType === "SEMI_MONTHLY" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={v.scheduleType === "MONTHLY" ? "On day of the month" : "First pay day"} error={errors.scheduleDays}>
                <Input value={v.day1} onChange={(e) => set("day1", e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="e.g. 5" className="num" invalid={Boolean(errors.scheduleDays)} />
              </Field>
              {v.scheduleType === "SEMI_MONTHLY" ? (
                <Field label="Second pay day">
                  <Input value={v.day2} onChange={(e) => set("day2", e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="e.g. 20" className="num" />
                </Field>
              ) : null}
            </div>
          ) : null}
          {v.scheduleType === "WEEKLY" ? (
            <Field label="On">
              <Select value={v.weekday} onChange={(e) => set("weekday", e.target.value)} aria-label="Weekday">
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {needsAnchor ? (
            <Field label={v.scheduleType === "ONCE" ? "Pay date" : "A pay date to count from"} error={errors.scheduleAnchor}>
              <Input type="date" value={v.anchor} onChange={(e) => set("anchor", e.target.value)} invalid={Boolean(errors.scheduleAnchor)} />
            </Field>
          ) : null}

          <Field label="Lands in" hint="The account is separate from the income: both salaries can land in one card and still be tracked on their own.">
            <Select value={sensibleAccount} onChange={(e) => set("destinationAccountId", e.target.value)} aria-label="Destination account">
              {live.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Colour">
            <Swatches
              value={v.color}
              onChange={(c) => set("color", c)}
              options={SOURCE_SLOTS.map((slot) => ({ value: slot, css: sourceColor(slot), name: `Colour ${slot.toUpperCase()}` }))}
            />
          </Field>

          {formError && Object.keys(errors).length === 0 ? <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-c-out">{formError}</p> : null}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Sheet>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this income?" confirmLabel="Delete" danger onConfirm={remove}>
        <p>
          <span className="font-semibold text-ink">{source?.name}</span> has no payments recorded, so nothing else changes. Incomes with history can only be paused.
        </p>
      </ConfirmDialog>
    </>
  );
}
