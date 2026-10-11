"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt } from "@/components/app-provider";
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE, RoundedBar, TooltipCard, niceScale } from "./bits";

type ShapeProps = Parameters<typeof RoundedBar>[0] & { dataKey?: string; payload?: Record<string, unknown> };

const margin = { top: 12, right: 8, bottom: 0, left: 0 };

/** A value axis with round ticks (0 / 2K / 4K), always reaching the data and the zero line. */
function yAxis(fmt: ReturnType<typeof useFmt>, values: number[]) {
  const { ticks, domain } = niceScale(Math.min(0, ...values), Math.max(0, ...values));
  return (
    <YAxis width={52} domain={domain} ticks={ticks} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v: number) => fmt.compact(v)} />
  );
}

/* ---------------------------------------------------------------- */
/* Income vs spending, one pair of bars per period                    */
/* ---------------------------------------------------------------- */

export interface FlowPoint {
  key: string;
  label: string;
  title: string;
  /** the period's first and last day (the last is clamped to today): used to open its transactions */
  from: string;
  to: string;
  income: number;
  spent: number;
  net: number;
}

export function FlowBars({ data, height = 230, onSelect }: { data: FlowPoint[]; height?: number; onSelect?: (p: FlowPoint) => void }) {
  const fmt = useFmt();
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={margin} barCategoryGap="18%" barGap={2} onClick={(state) => { const p = data[Number(state?.activeTooltipIndex)]; if (p && onSelect) onSelect(p); }} style={{ cursor: onSelect ? "pointer" : undefined }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: AXIS_STROKE }} tick={AXIS_TICK} tickMargin={8} />
          {yAxis(fmt, data.flatMap((d) => [d.income, d.spent]))}
          <Tooltip
            cursor={{ fill: "var(--line)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as FlowPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <TooltipCard
                  title={p.title}
                  rows={[
                    { label: "Income", value: fmt.inBase(p.income.toFixed(2)), color: "var(--c-in)" },
                    { label: "Spent", value: fmt.inBase(p.spent.toFixed(2)), color: "var(--c-out)" },
                    { label: "Kept", value: fmt.delta(p.net.toFixed(2)), muted: true },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="income" fill="var(--c-in)" maxBarSize={24} isAnimationActive={false} shape={(p: unknown) => <RoundedBar {...(p as ShapeProps)} />} />
          <Bar dataKey="spent" fill="var(--c-out)" maxBarSize={24} isAnimationActive={false} shape={(p: unknown) => <RoundedBar {...(p as ShapeProps)} />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Net saved per period: diverging around zero                        */
/* ---------------------------------------------------------------- */

export function NetBars({ data, height = 230, onSelect }: { data: FlowPoint[]; height?: number; onSelect?: (p: FlowPoint) => void }) {
  const fmt = useFmt();
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={margin} barCategoryGap="34%" onClick={(state) => { const p = data[Number(state?.activeTooltipIndex)]; if (p && onSelect) onSelect(p); }} style={{ cursor: onSelect ? "pointer" : undefined }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} tickMargin={8} />
          {yAxis(fmt, data.map((d) => d.net))}
          <ReferenceLine y={0} stroke={AXIS_STROKE} />
          <Tooltip
            cursor={{ fill: "var(--line)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as FlowPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <TooltipCard
                  title={p.title}
                  rows={[
                    { label: "Kept", value: fmt.delta(p.net.toFixed(2)), color: p.net >= 0 ? "var(--c-in)" : "var(--c-out)" },
                    { label: "Income", value: fmt.inBase(p.income.toFixed(2)), muted: true },
                    { label: "Spent", value: fmt.inBase(p.spent.toFixed(2)), muted: true },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="net"
            maxBarSize={24}
            isAnimationActive={false}
            shape={(p: unknown) => {
              const props = p as ShapeProps & { value?: number };
              const negative = (props.payload?.net as number) < 0;
              return <RoundedBar {...props} negative={negative} fill={negative ? "var(--c-out)" : "var(--c-in)"} />;
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Stacked bars by series (income source, cost type...)               */
/* ---------------------------------------------------------------- */

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackPoint {
  label: string;
  title: string;
  from?: string;
  to?: string;
  [seriesKey: string]: number | string | undefined;
}

export function StackedBars({ data, series, height = 230, onSelect }: { data: StackPoint[]; series: StackSeries[]; height?: number; onSelect?: (p: StackPoint) => void }) {
  const fmt = useFmt();
  // which series is the visible top of each stack (so only that segment gets a rounded end)
  const withTop = data.map((d) => {
    let top = "";
    for (const s of series) if ((d[s.key] as number) > 0) top = s.key;
    return { ...d, __top: top };
  });
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={withTop} margin={margin} barCategoryGap="34%" onClick={(state) => { const p = data[Number(state?.activeTooltipIndex)]; if (p && onSelect) onSelect(p); }} style={{ cursor: onSelect ? "pointer" : undefined }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: AXIS_STROKE }} tick={AXIS_TICK} tickMargin={8} />
          {yAxis(fmt, data.map((d) => series.reduce((a, s) => a + ((d[s.key] as number) || 0), 0)))}
          <Tooltip
            cursor={{ fill: "var(--line)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as StackPoint | undefined) : undefined;
              if (!p) return null;
              const rows = series.filter((s) => (p[s.key] as number) !== 0).map((s) => ({ label: s.label, value: fmt.inBase((p[s.key] as number).toFixed(2)), color: s.color }));
              const total = series.reduce((a, s) => a + (p[s.key] as number), 0);
              return <TooltipCard title={p.title} rows={[...rows, { label: "Total", value: fmt.inBase(total.toFixed(2)), muted: true }]} />;
            }}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="stack"
              fill={s.color}
              maxBarSize={24}
              isAnimationActive={false}
              shape={(p: unknown) => {
                const props = p as ShapeProps;
                const isTop = props.payload?.__top === s.key;
                if (!props.width || !props.height) return <g />;
                const top = (props.height ?? 0) < 0 ? (props.y ?? 0) + (props.height ?? 0) : (props.y ?? 0);
                return (
                  <g>
                    <RoundedBar {...props} y={top} height={Math.abs(props.height ?? 0)} isTop={isTop} />
                    {/* the 2px surface-coloured gap that separates touching segments */}
                    <rect x={props.x} y={top + Math.abs(props.height ?? 0) - 1} width={props.width} height={2} fill="var(--surface)" />
                  </g>
                );
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
