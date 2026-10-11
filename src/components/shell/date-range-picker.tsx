"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import { setRangeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RANGE_PRESETS, type RangePreset } from "@/lib/finance/periods";
import { cn } from "@/lib/utils";

export interface RangeInfo {
  preset: RangePreset;
  from: string;
  to: string;
  label: string;
  sub: string;
}

/** The global date filter: quick presets for the common questions, a custom range for the rest. */
export function DateRangePicker({ info }: { info: RangeInfo }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(info.from);
  const [to, setTo] = useState(info.to);

  function choose(value: string) {
    start(async () => {
      await setRangeAction(value);
      setOpen(false);
    });
  }

  const customValid = from && to && from <= to;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setFrom(info.from); setTo(info.to); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 items-center gap-2 rounded-full bg-surface px-3.5 text-[13.5px] font-semibold text-ink shadow-card ring-1 ring-line transition hover:ring-line-strong sm:px-4",
            pending && "opacity-60",
          )}
          aria-label={`Date range: ${info.label}`}
        >
          <CalendarDays className="size-4 text-accent" />
          <span className="max-w-[9.5rem] truncate">{info.label}</span>
          <span className="hidden text-ink-3 md:inline">{info.sub}</span>
          <ChevronDown className="size-3.5 text-ink-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,340px)] p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {RANGE_PRESETS.filter((p) => p.id !== "custom").map((p) => {
            const active = info.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => choose(p.id)}
                className={cn(
                  "h-10 rounded-xl px-3 text-left text-[14px] font-semibold transition",
                  active ? "bg-accent-soft text-accent" : "text-ink hover:bg-ink/[0.05]",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <p className={cn("mb-2 px-1 text-[12.5px] font-semibold", info.preset === "custom" ? "text-accent" : "text-ink-2")}>Custom range</p>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-10 px-3 text-[14px]" aria-label="From" />
            <span className="text-ink-3">–</span>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-10 px-3 text-[14px]" aria-label="To" />
          </div>
          <Button variant="primary" size="sm" className="mt-3 w-full" disabled={!customValid || pending} onClick={() => choose(`custom:${from}:${to}`)}>
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
