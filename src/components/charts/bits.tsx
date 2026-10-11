"use client";

import type { ReactNode } from "react";

/** Axis / label text: muted ink, never the series colour. */
export const AXIS_TICK = { fill: "var(--text-3)", fontSize: 12, fontWeight: 500 } as const;
export const GRID_STROKE = "var(--line)";
export const AXIS_STROKE = "var(--line-strong)";

export interface TooltipRow {
  label: string;
  value: string;
  /** colour of the short line key */
  color?: string;
  /** de-emphasise (e.g. a series that is not the focus) */
  muted?: boolean;
}

/**
 * One tooltip for every series at the hovered position. Values lead (strong), labels follow, and
 * rows are keyed by a short line of the series colour, not a filled box.
 */
export function TooltipCard({ title, rows, footer }: { title?: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="pointer-events-none min-w-[10rem] max-w-[17rem] rounded-2xl bg-surface px-3.5 py-3 text-ink shadow-pop ring-1 ring-line">
      {title ? <div className="mb-1.5 text-[12px] font-medium text-ink-2">{title}</div> : null}
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-5">
            <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-2">
              {row.color ? <span aria-hidden className="h-[3px] w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /> : null}
              <span className="truncate">{row.label}</span>
            </span>
            <span className={`num text-[14px] font-bold ${row.muted ? "text-ink-2" : "text-ink"}`}>{row.value}</span>
          </div>
        ))}
      </div>
      {footer ? <div className="mt-2 border-t border-line pt-2 text-[12px] text-ink-3">{footer}</div> : null}
    </div>
  );
}

/** SVG path of a rectangle whose DATA end (top for positive, bottom for negative) is rounded. */
export function endRoundedPath(x: number, y: number, w: number, h: number, r: number, end: "top" | "bottom"): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (rr === 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return end === "top"
    ? `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
    : `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  /** set by the chart: this segment is the visible top of its stack */
  isTop?: boolean;
  negative?: boolean;
}

/** A bar that is square at the baseline and has a 4px rounded data end (the spec). */
export function RoundedBar({ x = 0, y = 0, width = 0, height = 0, fill, negative, isTop = true }: BarShapeProps) {
  if (!width || !height) return null;
  const top = height < 0 ? y + height : y;
  const h = Math.abs(height);
  const neg = negative ?? height < 0;
  return <path d={endRoundedPath(x, top, width, h, isTop ? 4 : 0, neg ? "bottom" : "top")} fill={fill} />;
}

/**
 * Round, readable axis ticks (0 / 1K / 2K, never 904 / 1.7K): pick a 1-2-2.5-5-10 step, extend the
 * domain to whole steps, and return every tick explicitly.
 */
export function niceScale(min: number, max: number, count = 4): { ticks: number[]; domain: [number, number] } {
  let lo = min;
  let hi = max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ticks: [0, 1], domain: [0, 1] };
  if (lo === hi) {
    const bump = Math.abs(lo) * 0.05 || 1;
    lo -= bump;
    hi += bump;
  }
  const rough = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const f = rough / magnitude;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * magnitude;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { ticks, domain: [start, end] };
}
