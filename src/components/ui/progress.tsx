import { cn } from "@/lib/utils";

const tones = {
  accent: "var(--accent)",
  out: "var(--c-out)",
  in: "var(--c-in)",
  warn: "var(--amber)",
  danger: "var(--danger)",
  ink: "var(--text-3)",
} as const;

/**
 * Thick pill meter. The unfilled track is a lighter step of the fill's own colour (a "same-ramp"
 * track), so state reads across the whole bar. `value` is 0..1 (clamped).
 */
export function Progress({
  value,
  tone = "accent",
  color,
  className,
  size = "md",
  label,
}: {
  value: number;
  tone?: keyof typeof tones;
  /** any CSS colour; overrides `tone` */
  color?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  const fill = color ?? tones[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("w-full overflow-hidden rounded-full", size === "sm" ? "h-1.5" : size === "md" ? "h-2.5" : "h-3.5", className)}
      style={{ backgroundColor: `color-mix(in srgb, ${fill} 17%, transparent)` }}
    >
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: fill }} />
    </div>
  );
}

export interface Segment {
  value: number;
  color: string;
  label?: string;
}

/**
 * One bar divided into coloured parts (how a balance is made up). A 2px surface-coloured gap separates
 * the parts — the gap does the separating, never a border. Zero / negative parts are skipped.
 */
export function StackedBar({ segments, className, size = "md" }: { segments: Segment[]; className?: string; size?: "sm" | "md" | "lg" }) {
  const parts = segments.filter((s) => s.value > 0);
  const total = parts.reduce((a, s) => a + s.value, 0);
  return (
    <div className={cn("flex w-full gap-[2px] overflow-hidden rounded-full", size === "sm" ? "h-1.5" : size === "md" ? "h-2.5" : "h-3.5", className)}>
      {total === 0 ? <div className="h-full w-full rounded-full bg-ink/[0.07]" /> : null}
      {parts.map((s, i) => (
        <div
          key={`${s.label ?? ""}-${i}`}
          title={s.label}
          className="h-full min-w-[4px] first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
    </div>
  );
}
