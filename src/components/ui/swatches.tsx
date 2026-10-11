"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** A row of colour dots to pick from. `value` and the options are any CSS colour or token. */
export function Swatches({ options, value, onChange, label = "Colour" }: { options: { value: string; css: string; name?: string }[]; value: string | null; onChange: (v: string) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.name ?? o.value}
            title={o.name}
            onClick={() => onChange(o.value)}
            className={cn("grid size-9 place-items-center rounded-full transition active:scale-90", active && "ring-2 ring-offset-2 ring-offset-bg")}
            style={{ backgroundColor: o.css, ...(active ? { boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${o.css}` } : {}) }}
          >
            {active ? <Check className="size-4 text-white" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}
