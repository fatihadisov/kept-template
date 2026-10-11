"use client";

import { ArrowRight, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { addRateAction, deleteRateAction } from "@/app/actions";
import { useApp, useFmt } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useForm } from "@/components/use-form";
import type { RateRecord } from "@/lib/app-types";
import { COMMON_CURRENCIES } from "@/lib/finance/currency";
import { formatDateShort } from "@/lib/finance/dates";
import { dec, formatRate } from "@/lib/finance/money";
import { cn } from "@/lib/utils";
import type { RatePair } from "@/server/views/settings";
import { Section } from "./parts";

function RateSheet({
  open,
  onOpenChange,
  preset,
  pairs,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preset: { from: string; to: string; accountId?: string | null; note?: string };
  pairs: RatePair[];
}) {
  const app = useApp();
  const fmt = useFmt();
  const form = useForm({ from: preset.from, to: preset.to, rate: "", effectiveFrom: app.today, note: preset.note ?? "" });
  const { values: v, set, errors, formError, pending } = form;
  const parsed = Number(v.rate.replace(",", "."));
  const inverse = parsed > 0 ? formatRate(dec(1).div(parsed), 2, 6) : null;
  const currencies = [...new Set([app.settings.baseCurrency, ...COMMON_CURRENCIES, preset.from, preset.to])];

  // Setting USD → AZN usually means AZN → USD changed too. Offer to move both, unless the opposite
  // direction was set on purpose to something other than the reciprocal (a bank's buy/sell spread).
  const here = pairs.find((p) => p.from === v.from && p.to === v.to)?.current?.rate ?? null;
  const opposite = pairs.find((p) => p.from === v.to && p.to === v.from)?.current?.rate ?? null;
  const inStep = !here || !opposite || dec(here).isZero() || dec(1).div(dec(here)).minus(dec(opposite)).abs().lte(dec(opposite).times("0.002"));
  const [alsoChoice, setAlsoChoice] = useState<boolean | null>(null);
  const alsoInverse = !preset.accountId && (alsoChoice ?? inStep);
  const alsoNote = alsoInverse
    ? opposite && !inStep
      ? `Replaces the rate set for that direction (now ${fmt.rate(opposite)}).`
      : "Keeps both directions in step."
    : opposite && !inStep
      ? "That direction keeps its own rate."
      : "Only this direction changes, so you can use a different buy and sell rate.";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Exchange rate"
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() =>
            form.submit((vals) => addRateAction({ from: vals.from, to: vals.to, rate: vals.rate, effectiveFrom: vals.effectiveFrom, accountId: preset.accountId ?? null, note: vals.note || null, alsoInverse }), {
              success: "Rate saved",
              onOk: () => onOpenChange(false),
            })
          }
        >
          {pending ? "Saving…" : "Save rate"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <Field label="From">
            <Select value={v.from} onChange={(e) => set("from", e.target.value)} aria-label="From currency" disabled={Boolean(preset.accountId)}>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <ArrowRight className="mb-3.5 size-5 text-ink-3" aria-hidden />
          <Field label="To" error={errors.to}>
            <Select value={v.to} onChange={(e) => set("to", e.target.value)} aria-label="To currency" disabled={Boolean(preset.accountId)}>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={`1 ${v.from} =`} error={errors.rate} hint="Up to 10 decimal places are kept.">
          <div className="flex items-center gap-3">
            <Input value={v.rate} onChange={(e) => set("rate", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="1.700000" autoFocus className="num h-14 text-[22px] font-bold" invalid={Boolean(errors.rate)} />
            <span className="text-[16px] font-bold text-ink-2">{v.to}</span>
          </div>
        </Field>
        {!preset.accountId ? (
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-bg px-4 py-3.5">
            <span className="min-w-0">
              <span className="num block text-[14.5px] font-semibold text-ink">
                Also set 1 {v.to} = {inverse ?? "…"} {v.from}
              </span>
              <span className="block text-[12.5px] leading-snug text-ink-3">{alsoNote}</span>
            </span>
            <Switch checked={alsoInverse} onCheckedChange={setAlsoChoice} aria-label="Also set the opposite direction" />
          </label>
        ) : null}
        <Field label="Applies from" error={errors.effectiveFrom} hint="Earlier entries keep the rate they were recorded with; this only affects what comes next (and how balances are valued from this date).">
          <Input type="date" value={v.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} invalid={Boolean(errors.effectiveFrom)} />
        </Field>
        <Field label="Note">
          <Input value={v.note} onChange={(e) => set("note", e.target.value)} placeholder="Optional, e.g. bank's rate this week" maxLength={120} />
        </Field>
        {formError && Object.keys(errors).length === 0 ? <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-c-out">{formError}</p> : null}
      </div>
    </Sheet>
  );
}

export function RatesSettings({ pairs, cardRates }: { pairs: RatePair[]; cardRates: (RateRecord & { accountName: string })[] }) {
  const app = useApp();
  const fmt = useFmt();
  const base = app.settings.baseCurrency;
  const [sheet, setSheet] = useState<{ from: string; to: string; key: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function remove(id: string) {
    const res = await deleteRateAction(id);
    if (res.ok) toast.success("Rate removed");
    else toast.error(res.error);
  }

  return (
    <Section
      id="rates"
      title="Exchange rates"
      intro="Used to show foreign money in your reporting currency and to suggest conversions. Every entry freezes the rate it was recorded with, so changing a rate here never rewrites the past."
      action={
        <Button variant="soft" size="sm" onClick={() => setSheet({ from: base === "AZN" ? "USD" : "AZN", to: base, key: Date.now() })}>
          <Plus className="size-4" />
          Add rate
        </Button>
      }
    >
      {pairs.length === 0 ? <p className="px-4 py-8 text-center text-[14px] text-ink-3">Everything is in {base}, so no rates are needed yet.</p> : null}
      {pairs.map((p) => {
        const id = `${p.from}>${p.to}`;
        return (
          <div key={id} className="border-b border-line last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3.5 sm:px-4">
              <div className="min-w-0">
                {p.current ? (
                  <p className="num text-[17px] font-extrabold tracking-tight text-ink">
                    1 {p.from} = {fmt.rate(p.current.rate)} {p.to}
                  </p>
                ) : (
                  <p className="text-[15px] font-bold text-c-out">1 {p.from} → {p.to}: no rate yet</p>
                )}
                <p className="mt-0.5 text-[12.5px] text-ink-3">
                  {p.current ? `since ${formatDateShort(p.current.effectiveFrom, app.today)}` : "Balances in this currency can't be valued"}
                  {p.history.length > 1 ? ` · ${p.history.length - 1} earlier` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.history.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
                    History
                    <ChevronDown className={cn("size-4 transition-transform", open === id && "rotate-180")} />
                  </Button>
                ) : null}
                <Button variant="subtle" size="sm" onClick={() => setSheet({ from: p.from, to: p.to, key: Date.now() })}>
                  {p.current ? "Update" : "Set rate"}
                </Button>
              </div>
            </div>
            {open === id ? (
              <ul className="mx-3 mb-3 divide-y divide-line rounded-2xl bg-bg sm:mx-4">
                {p.history.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-28 shrink-0 text-[13px] text-ink-3">{formatDateShort(h.effectiveFrom, app.today)}</span>
                    <span className="num flex-1 text-[14px] font-bold text-ink">{fmt.rate(h.rate)}</span>
                    {h.note ? <span className="hidden truncate text-[12.5px] text-ink-3 sm:block">{h.note}</span> : null}
                    <button type="button" onClick={() => remove(h.id)} aria-label="Remove this rate" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-c-out">
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}

      {cardRates.length > 0 ? (
        <div className="px-3 pb-3 pt-4 sm:px-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Rates a specific card uses</p>
          <ul className="divide-y divide-line rounded-2xl bg-bg">
            {cardRates.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{r.accountName}</span>
                <span className="num text-[14px] text-ink-2">
                  1 {r.from} = {fmt.rate(r.rate)} {r.to}
                </span>
                <span className="hidden w-24 text-right text-[12.5px] text-ink-3 sm:block">{formatDateShort(r.effectiveFrom, app.today)}</span>
                <button type="button" onClick={() => remove(r.id)} aria-label="Remove this rate" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-c-out">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sheet ? <RateSheet key={sheet.key} open onOpenChange={(o) => !o && setSheet(null)} preset={{ from: sheet.from, to: sheet.to }} pairs={pairs} /> : null}
    </Section>
  );
}
