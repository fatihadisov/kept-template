"use client";

import { Archive, ArchiveRestore, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { allocateGoalAction, archiveGoalAction, deleteGoalAction, removeAllocationAction, saveGoalAction } from "@/app/actions";
import { useApp, useFmt } from "@/components/app-provider";
import { AmountHero } from "@/components/transaction/fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { IconBubble } from "@/components/ui/icon-bubble";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Swatches } from "@/components/ui/swatches";
import { useForm } from "@/components/use-form";
import type { GoalView } from "@/lib/app-types";
import { COMMON_CURRENCIES } from "@/lib/finance/currency";
import { formatDateShort } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";

const GOAL_ICONS = ["target", "car", "plane", "house", "mountain", "life-buoy", "piggy-bank", "gift", "graduation-cap", "laptop", "heart", "rocket", "star", "gem", "tent", "briefcase"];
const GOAL_COLORS = ["#4E8D6E", "#7487DA", "#EA9B4E", "#E58BA0", "#9A7BD6", "#4FA8C7", "#D4A24C"];

interface GoalValues {
  name: string;
  kind: "RESERVE" | "TOTAL" | "EMERGENCY";
  targetAmount: string;
  currency: string;
  targetDate: string;
  priority: "1" | "2" | "3";
  icon: string;
  color: string;
  note: string;
  isPrimary: boolean;
}

/** Create or edit a savings goal. Reserving money for it never moves or spends anything. */
export function GoalSheet({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (o: boolean) => void; goal?: GoalView | null }) {
  const app = useApp();
  const fmt = useFmt();
  const editing = Boolean(goal);
  const form = useForm<GoalValues>({
    name: goal?.name ?? "",
    kind: goal?.kind ?? "RESERVE",
    targetAmount: goal?.targetAmount ?? "",
    currency: goal?.currency ?? app.settings.baseCurrency,
    targetDate: goal?.targetDate ?? "",
    priority: String(goal?.priority ?? 2) as GoalValues["priority"],
    icon: goal?.icon ?? "target",
    color: goal?.color ?? GOAL_COLORS[0],
    note: goal?.note ?? "",
    isPrimary: goal?.isPrimary ?? false,
  });
  const { values: v, set, errors, formError, pending } = form;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = Boolean(goal && goal.allocations.length > 0);

  function save() {
    form.submit(
      (vals) =>
        saveGoalAction(goal?.id ?? null, {
          name: vals.name,
          kind: vals.kind,
          targetAmount: vals.targetAmount,
          currency: vals.currency,
          targetDate: vals.targetDate || null,
          priority: Number(vals.priority),
          icon: vals.icon,
          color: vals.color,
          note: vals.note || null,
          isPrimary: vals.isPrimary,
        }),
      { success: editing ? "Goal saved" : "Goal added", onOk: () => onOpenChange(false) },
    );
  }

  async function archive(next: boolean) {
    if (!goal) return;
    const res = await archiveGoalAction(goal.id, next);
    if (res.ok) {
      toast.success(next ? "Archived. Its reserved money is free again." : "Restored");
      onOpenChange(false);
    } else toast.error(res.error);
  }

  async function remove() {
    if (!goal) return;
    const res = await deleteGoalAction(goal.id);
    setConfirmDelete(false);
    if (res.ok) {
      toast.success("Goal deleted. Its reserved money is free again.");
      onOpenChange(false);
    } else toast.error(res.error);
  }

  async function removeEntry(id: string) {
    const res = await removeAllocationAction(id);
    if (res.ok) toast.success("Entry removed");
    else toast.error(res.error);
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? "Edit goal" : "New goal"}
        footer={
          <div className="flex items-center gap-2.5">
            {editing && goal ? (
              <>
                <Button variant="subtle" size="icon" onClick={() => archive(!goal.archived)} aria-label={goal.archived ? "Restore goal" : "Archive goal"} title={goal.archived ? "Restore" : "Archive"}>
                  {goal.archived ? <ArchiveRestore className="size-[18px]" /> : <Archive className="size-[18px]" />}
                </Button>
                <Button variant="danger" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete goal">
                  <Trash2 className="size-[18px]" />
                </Button>
              </>
            ) : null}
            <Button variant="primary" size="lg" className="flex-1" disabled={pending} onClick={save}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add goal"}
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
          <Field label="What are you saving for?" error={errors.name}>
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Car, Summer trip, 6-month cushion" autoFocus={!editing} invalid={Boolean(errors.name)} />
          </Field>

          <Field label="How it works">
            <Segmented
              full
              value={v.kind}
              onChange={(k) => set("kind", k)}
              options={[
                { value: "RESERVE", label: "Set aside" },
                { value: "EMERGENCY", label: "Emergency" },
                { value: "TOTAL", label: "Milestone" },
              ]}
            />
            <p className="mt-2 px-1 text-[12.5px] leading-snug text-ink-3">
              {v.kind === "TOTAL"
                ? "Tracks your total savings against a number, like “reach 50,000”. Nothing is set aside."
                : v.kind === "EMERGENCY"
                  ? "A cushion for the unexpected. Money you reserve stays in your total but is not available to spend."
                  : "You reserve part of your existing savings for it. It stays in your total but leaves “available to spend”."}
            </p>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Target" error={errors.targetAmount}>
              <Input value={v.targetAmount} onChange={(e) => set("targetAmount", e.target.value.replace(/[^\d.,\s]/g, ""))} inputMode="decimal" placeholder="0.00" className="num" invalid={Boolean(errors.targetAmount)} />
            </Field>
            <Field label="Currency" error={errors.currency} hint={locked ? "Locked while money is reserved." : undefined}>
              <Select value={v.currency} onChange={(e) => set("currency", e.target.value)} disabled={locked} aria-label="Currency" className="min-w-28">
                {[...new Set([app.settings.baseCurrency, ...COMMON_CURRENCIES, v.currency])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="By when" hint="Optional. Shows how much to put aside each month." error={errors.targetDate}>
              <Input type="date" value={v.targetDate} min={app.today} onChange={(e) => set("targetDate", e.target.value)} />
            </Field>
            <Field label="Priority">
              <Segmented
                full
                value={v.priority}
                onChange={(p) => set("priority", p)}
                options={[
                  { value: "1", label: "High" },
                  { value: "2", label: "Medium" },
                  { value: "3", label: "Low" },
                ]}
              />
            </Field>
          </div>

          <Field label="Look">
            <div className="flex flex-wrap gap-2">
              {GOAL_ICONS.map((key) => (
                <button key={key} type="button" onClick={() => set("icon", key)} aria-pressed={v.icon === key} aria-label={key} className={cn("rounded-full p-0.5 transition active:scale-90", v.icon === key ? "ring-2 ring-accent" : "opacity-70 hover:opacity-100")}>
                  <IconBubble icon={key} color={v.color} size={38} />
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Swatches value={v.color} onChange={(c) => set("color", c)} options={GOAL_COLORS.map((c) => ({ value: c, css: c }))} />
            </div>
          </Field>

          <Field label="Note">
            <Textarea value={v.note} onChange={(e) => set("note", e.target.value)} placeholder="Optional" maxLength={500} className="min-h-[68px]" />
          </Field>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line">
            <span>
              <span className="block text-[14.5px] font-semibold text-ink">Show on the overview</span>
              <span className="block text-[12.5px] text-ink-3">Your main goal gets the progress tile at the top.</span>
            </span>
            <input type="checkbox" checked={v.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} className="size-5 accent-[var(--accent)]" />
          </label>

          {editing && goal && goal.allocations.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-[13px] font-semibold text-ink-2">Set aside so far</p>
              <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
                {[...goal.allocations].reverse().map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 text-[13.5px] text-ink-2">{formatDateShort(a.date, app.today)}</span>
                    <span className={cn("num text-[14px] font-bold", a.amount.startsWith("-") ? "text-c-out" : "text-ink")}>{fmt.money(a.amount, goal.currency, { sign: "always" })}</span>
                    <button type="button" onClick={() => removeEntry(a.id)} aria-label="Remove this entry" className="grid size-7 place-items-center rounded-full text-ink-3 hover:bg-ink/[0.06] hover:text-ink">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {formError && Object.keys(errors).length === 0 ? <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-c-out">{formError}</p> : null}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Sheet>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this goal?" confirmLabel="Delete" danger onConfirm={remove}>
        <p>
          <span className="font-semibold text-ink">{goal?.name}</span> will be removed. Money reserved for it stays in your savings and becomes available again; nothing is spent.
        </p>
      </ConfirmDialog>
    </>
  );
}

/** Set money aside for a goal (or take it back). Total savings never change. */
export function ReserveSheet({
  open,
  onOpenChange,
  goal,
  mode,
  availableBase,
  reserved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal: GoalView;
  mode: "reserve" | "release";
  /** unreserved savings, in the reporting currency (decimal string) */
  availableBase: string;
  /** currently reserved for this goal, in the goal's currency */
  reserved: string;
}) {
  const app = useApp();
  const fmt = useFmt();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = app.settings.baseCurrency;

  const max = mode === "reserve" ? availableBase : reserved;
  const maxCurrency = mode === "reserve" ? base : goal.currency;

  async function save() {
    setPending(true);
    setError(null);
    const res = await allocateGoalAction({ goalId: goal.id, amount: mode === "reserve" ? amount : `-${amount.replace("-", "")}`, date: app.today });
    setPending(false);
    if (res.ok) {
      toast.success(mode === "reserve" ? `Set aside for ${goal.name}` : `Released from ${goal.name}`);
      onOpenChange(false);
    } else setError(res.fieldErrors?.amount ?? res.error);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={mode === "reserve" ? `Set aside for ${goal.name}` : `Release from ${goal.name}`}
      footer={
        <Button variant="primary" size="lg" className="w-full" disabled={pending || !amount.trim()} onClick={save}>
          {pending ? "Saving…" : mode === "reserve" ? "Set aside" : "Release"}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-5 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount.trim()) void save();
        }}
      >
        <AmountHero value={amount} onChange={setAmount} currency={goal.currency} error={error ?? undefined} autoFocus label="Amount" />
        <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-[14px] ring-1 ring-line">
          <span className="text-ink-2">{mode === "reserve" ? "Free to set aside" : "Set aside for it now"}</span>
          <button type="button" className="num font-bold text-accent hover:underline" onClick={() => setAmount(Number(max) > 0 && maxCurrency === goal.currency ? Number(max).toFixed(2) : "")} title={maxCurrency === goal.currency ? "Use all" : undefined}>
            {fmt.money(max, maxCurrency)}
          </button>
        </div>
        <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
          {mode === "reserve"
            ? "Your total savings stay exactly the same. The money just stops counting as available to spend."
            : "The money goes back to “available to spend”. Your total savings stay the same."}
        </p>
      </form>
    </Sheet>
  );
}
