"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt } from "@/components/app-provider";
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE, TooltipCard, niceScale } from "./bits";

export interface ForecastPoint {
  date: string;
  label: string;
  /** what you actually had */
  actual?: number;
  /** what the forecast expects */
  projected?: number;
}

/**
 * Money so far (solid) and the projection (dotted, lighter). The projection is a different kind of
 * thing from your balance, so it is drawn differently, labelled, and never joined to the totals.
 */
export function ForecastChart({ data, todayLabel, height = 250 }: { data: ForecastPoint[]; todayLabel: string; height?: number }) {
  const fmt = useFmt();
  const values = data.flatMap((d) => [d.actual, d.projected]).filter((v): v is number => v !== undefined);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.01, 1);
  const { ticks, domain } = niceScale(lo - pad, hi + pad);
  const lastProjected = [...data].reverse().find((d) => d.projected !== undefined);

  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 14, right: 22, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: AXIS_STROKE }} tick={AXIS_TICK} minTickGap={28} tickMargin={8} />
          <YAxis domain={domain} ticks={ticks} width={52} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v: number) => fmt.compact(v)} />
          <ReferenceLine x={todayLabel} stroke="var(--text-3)" strokeOpacity={0.6} label={{ value: "Today", position: "insideTopLeft", fill: "var(--text-3)", fontSize: 12, fontWeight: 600 }} />
          <Tooltip
            cursor={{ stroke: "var(--text-3)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as ForecastPoint | undefined) : undefined;
              if (!p) return null;
              const forecast = p.actual === undefined && p.projected !== undefined;
              return (
                <TooltipCard
                  title={p.label}
                  rows={[{ label: forecast ? "Forecast" : "Actual", value: fmt.inBase(((forecast ? p.projected : p.actual) as number).toFixed(2)), color: "var(--accent)" }]}
                  footer={forecast ? "A projection, not money you have." : undefined}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="actual" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
          <Line
            type="monotone"
            dataKey="projected"
            stroke="var(--accent)"
            strokeOpacity={0.75}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="0.1 7"
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: ForecastPoint }) =>
              props.payload && props.payload === lastProjected && props.cx !== undefined && props.cy !== undefined ? (
                <circle key="end" cx={props.cx} cy={props.cy} r={5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 5, fill: "var(--surface)", stroke: "var(--accent)", strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
