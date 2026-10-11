"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setStrategyAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Chip } from "@/components/ui/segmented";
import { STRATEGY_IDS, STRATEGY_INFO, type StrategyConfigs, type StrategyId } from "@/lib/finance/savings";
import { cn } from "@/lib/utils";
import { Section } from "./parts";

const digits = (v: string) => v.replace(/[^\d.,]/g, "");

/** Pick how you want to look at your savings. Strategies are lenses: switching never changes a single transaction. */
export function StrategySettings({ active, configs, base }: { active: StrategyId; configs: StrategyConfigs; base: string }) {
  const [selected, setSelected] = useState<StrategyId>(active);
  const [pending, start] = useTransition();
  const [pct, setPct] = useState(String(configs.PERCENT_TARGET.percent));
  const [fixed, setFixed] = useState(configs.FIXED_MONTHLY.amount === "0" ? "" : configs.FIXED_MONTHLY.amount);
  const [needs, setNeeds] = useState(String(configs.BUDGET_50_30_20.needs));
  const [wants, setWants] = useState(String(configs.BUDGET_50_30_20.wants));
  const [sav, setSav] = useState(String(configs.BUDGET_50_30_20.savings));
  const [essential, setEssential] = useState(configs.EMERGENCY_FIRST.essentialMonthly === "0" ? "" : configs.EMERGENCY_FIRST.essentialMonthly);
  const [months, setMonths] = useState(String(configs.EMERGENCY_FIRST.months));

  const num = (t: string) => Number(t.replace(",", ".")) || 0;
  const sum = num(needs) + num(wants) + num(sav);

  function save() {
    const config =
      selected === "PERCENT_TARGET"
        ? { PERCENT_TARGET: { percent: Math.min(100, Math.max(0, num(pct))) } }
        : selected === "FIXED_MONTHLY"
          ? { FIXED_MONTHLY: { amount: fixed.trim() || "0" } }
          : selected === "BUDGET_50_30_20"
            ? { BUDGET_50_30_20: { needs: num(needs), wants: num(wants), savings: num(sav) } }
            : selected === "EMERGENCY_FIRST"
              ? { EMERGENCY_FIRST: { essentialMonthly: essential.trim() || "0", months: Math.max(1, Math.round(num(months))) } }
              : undefined;
    start(async () => {
      const res = await setStrategyAction(selected, config);
      if (res.ok) toast.success(`Now using “${STRATEGY_INFO[selected].title}”`);
      else toast.error(res.error);
    });
  }

  return (
    <Section id="strategy" title="Savings strategy" intro="Everything you don't spend counts as savings by default. Pick another strategy only if you want a target to measure against. It never moves or deducts any money.">
      <div role="radiogroup" aria-label="Savings strategy" className="flex flex-col gap-2 p-1 sm:p-1.5">
        {STRATEGY_IDS.map((id) => {
          const on = id === selected;
          const info = STRATEGY_INFO[id];
          return (
            <div key={id} className={cn("rounded-[20px] ring-1 transition", on ? "bg-accent-soft/60 ring-accent/50" : "bg-transparent ring-line hover:ring-line-strong")}>
              <button type="button" role="radio" aria-checked={on} onClick={() => setSelected(id)} className="flex w-full items-start gap-3.5 px-4 py-3.5 text-left">
                <span className={cn("mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full ring-2 transition", on ? "bg-accent text-on-accent ring-accent" : "ring-ink/20")}>{on ? <Check className="size-3.5" strokeWidth={3.5} /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-[15.5px] font-bold text-ink">
                    {info.title}
                    {id === "SAVE_ALL" ? <span className="rounded-full bg-ink/[0.07] px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">Default</span> : null}
                    {id === active ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-semibold text-accent">In use</span> : null}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{info.blurb}</span>
                </span>
              </button>

              {on && id === "PERCENT_TARGET" ? (
                <div className="border-t border-line px-4 pb-4 pt-3.5 pl-[3.4rem]">
                  <Label>Share of each salary to keep</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {[20, 30, 40, 50].map((p) => (
                      <Chip key={p} active={num(pct) === p} onClick={() => setPct(String(p))}>{p}%</Chip>
                    ))}
                    <Input value={pct} onChange={(e) => setPct(digits(e.target.value))} inputMode="decimal" aria-label="Percent" className="num h-9 w-20 rounded-full text-center" />
                    <span className="text-[14px] text-ink-2">%</span>
                  </div>
                  <p className="mt-2 text-[12.5px] text-ink-3">A goal to compare against, never a deduction from your balances.</p>
                </div>
              ) : null}
              {on && id === "FIXED_MONTHLY" ? (
                <div className="border-t border-line px-4 pb-4 pt-3.5 pl-[3.4rem]">
                  <Label>Amount to save each month ({base})</Label>
                  <Input value={fixed} onChange={(e) => setFixed(digits(e.target.value))} inputMode="decimal" placeholder="e.g. 3000" aria-label="Monthly amount" className="num h-11 w-44" />
                </div>
              ) : null}
              {on && id === "BUDGET_50_30_20" ? (
                <div className="border-t border-line px-4 pb-4 pt-3.5 pl-[3.4rem]">
                  <div className="grid max-w-md grid-cols-3 gap-3">
                    {[
                      ["Needs", needs, setNeeds],
                      ["Wants", wants, setWants],
                      ["Savings", sav, setSav],
                    ].map(([label, value, setter]) => (
                      <div key={label as string}>
                        <Label>{label as string} %</Label>
                        <Input value={value as string} onChange={(e) => (setter as (v: string) => void)(digits(e.target.value))} inputMode="decimal" aria-label={`${label as string} percent`} className="num h-11 text-center" />
                      </div>
                    ))}
                  </div>
                  <p className={cn("mt-2 text-[12.5px]", sum === 100 ? "text-ink-3" : "font-semibold text-c-out")}>
                    {sum === 100 ? "Adds up to 100%. Mark each category as a need or a want under Categories." : `Adds up to ${sum}%, not 100%.`}
                  </p>
                </div>
              ) : null}
              {on && id === "EMERGENCY_FIRST" ? (
                <div className="border-t border-line px-4 pb-4 pt-3.5 pl-[3.4rem]">
                  <div className="grid grid-cols-1 max-w-md gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Essential costs per month ({base})</Label>
                      <Input value={essential} onChange={(e) => setEssential(digits(e.target.value))} inputMode="decimal" placeholder="Rent, food, bills…" aria-label="Essential monthly costs" className="num h-11" />
                    </div>
                    <div>
                      <Label>Months to cover</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {[3, 6, 12].map((m) => (
                          <Chip key={m} active={num(months) === m} onClick={() => setMonths(String(m))}>{m}</Chip>
                        ))}
                        <Input value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Months" className="num h-9 w-16 rounded-full text-center" />
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[12.5px] text-ink-3">Creates an “Emergency fund” goal with the target worked out for you. Other goals keep working alongside it.</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end px-3 pb-3 pt-2 sm:px-4">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : selected === active ? "Save" : "Use this strategy"}
        </Button>
      </div>
    </Section>
  );
}
