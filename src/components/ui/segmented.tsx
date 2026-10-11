"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/** Pill-shaped switcher: the quiet way to choose one of a few things. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  full,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  size?: "sm" | "md";
  full?: boolean;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5 rounded-full bg-ink/[0.06] p-1", full && "flex w-full", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-all duration-150 disabled:opacity-40",
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-9 px-4 text-[14px]",
              full && "flex-1",
              active ? "bg-surface text-ink shadow-[0_1px_4px_rgb(0_0_0/0.08)]" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A selectable pill (category, source, account...). */
export function Chip({
  active,
  onClick,
  children,
  color,
  className,
  disabled,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  color?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40",
        active ? "bg-accent-soft text-accent" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink",
        className,
      )}
      style={active && color ? { backgroundColor: `color-mix(in srgb, ${color} 17%, transparent)`, color } : undefined}
    >
      {children}
    </button>
  );
}
