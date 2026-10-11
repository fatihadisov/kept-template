"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt } from "@/components/app-provider";
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE, TooltipCard, niceScale } from "./bits";

export interface TrendPoint {
  /** ISO date for the tooltip title */
  date: string;
  /** short axis label */
  label: string;
  value: number;
}

/**
 * A single series over time: a 2px line with a ~10% wash beneath, a crosshair that snaps to the nearest
 * date, and a ringed end-dot. Used for money over time and cumulative savings.
 */
export function TrendChart({
  data,
  height = 220,
  seriesLabel,
  color = "var(--accent)",
  formatTitle,
  zeroBased = false,
}: {
  data: TrendPoint[];
  height?: number;
  seriesLabel: string;
  color?: string;
  formatTitle?: (p: TrendPoint) => string;
  /** include zero on the axis (cumulative flows that start at 0) */
  zeroBased?: boolean;
}) {
  const fmt = useFmt();
  const values = data.map((d) => d.value);
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const pad = Math.max((hi0 - lo0) * 0.1, Math.abs(hi0) * 0.01, 1);
  const { ticks, domain } = zeroBased ? niceScale(Math.min(0, lo0), Math.max(0, hi0)) : niceScale(lo0 - pad, hi0 + pad);
  const last = data.length - 1;

  return (
    <div style={{ height }} className="-ml-2 text-ink">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: AXIS_STROKE }} tick={AXIS_TICK} minTickGap={32} tickMargin={8} />
          <YAxis
            domain={domain}
            ticks={ticks}
            width={52}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={(v: number) => fmt.compact(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--text-3)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
              if (!p) return null;
              return <TooltipCard title={formatTitle ? formatTitle(p) : p.date} rows={[{ label: seriesLabel, value: fmt.inBase(p.value.toFixed(2)), color }]} />;
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={color}
            fillOpacity={0.1}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === last && props.cx !== undefined && props.cy !== undefined ? (
                <circle key="end" cx={props.cx} cy={props.cy} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 5, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
