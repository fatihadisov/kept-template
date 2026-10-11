"use client";

import { useRouter } from "next/navigation";
import { useFmt } from "@/components/app-provider";
import { FlowBars, NetBars, StackedBars, type FlowPoint, type StackPoint, type StackSeries } from "@/components/charts/bar-charts";
import { ChartFrame } from "@/components/charts/chart-frame";
import { ForecastChart, type ForecastPoint } from "@/components/charts/forecast-chart";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { formatDateLong } from "@/lib/finance/dates";

const drill = (router: ReturnType<typeof useRouter>, p: { from?: string; to?: string }) => {
  if (p.from && p.to) router.push(`/transactions?from=${p.from}&to=${p.to}`);
};

export function FlowChartCard({ data }: { data: FlowPoint[] }) {
  const fmt = useFmt();
  const router = useRouter();
  return (
    <ChartFrame
      title="Income vs spending"
      subtitle="Per month. Tap a pair to see its transactions."
      legend={[
        { label: "Income", color: "var(--c-in)" },
        { label: "Spent", color: "var(--c-out)" },
      ]}
      table={{ columns: ["Period", "Income", "Spent", "Kept"], rows: data.map((p) => [p.title, fmt.inBase(p.income.toFixed(2)), fmt.inBase(p.spent.toFixed(2)), fmt.delta(p.net.toFixed(2))]) }}
    >
      <FlowBars data={data} onSelect={(p) => drill(router, p)} />
    </ChartFrame>
  );
}

export function NetChartCard({ data }: { data: FlowPoint[] }) {
  const fmt = useFmt();
  const router = useRouter();
  return (
    <ChartFrame
      title="Kept each month"
      subtitle="Income minus spending: your automatic savings"
      table={{ columns: ["Period", "Kept", "Income", "Spent"], rows: data.map((p) => [p.title, fmt.delta(p.net.toFixed(2)), fmt.inBase(p.income.toFixed(2)), fmt.inBase(p.spent.toFixed(2))]) }}
    >
      <NetBars data={data} onSelect={(p) => drill(router, p)} />
    </ChartFrame>
  );
}

export function TrendCard({ title, subtitle, data, series, zeroBased }: { title: string; subtitle: string; data: TrendPoint[]; series: string; zeroBased?: boolean }) {
  const fmt = useFmt();
  return (
    <ChartFrame title={title} subtitle={subtitle} table={{ columns: ["Date", series], rows: data.map((p) => [p.date, fmt.inBase(p.value.toFixed(2))]) }}>
      {data.length > 1 ? <TrendChart data={data} seriesLabel={series} formatTitle={(p) => formatDateLong(p.date)} zeroBased={zeroBased} /> : <p className="py-16 text-center text-[14px] text-ink-3">Not enough history yet.</p>}
    </ChartFrame>
  );
}

export function SourceSpendCard({ data, series }: { data: StackPoint[]; series: StackSeries[] }) {
  const fmt = useFmt();
  const router = useRouter();
  return (
    <ChartFrame
      title="Spending by income"
      subtitle="Which income each month's spending came out of"
      legend={series.map((s) => ({ label: s.label, color: s.color }))}
      table={{ columns: ["Period", ...series.map((s) => s.label)], rows: data.map((p) => [p.title, ...series.map((s) => fmt.inBase(((p[s.key] as number) ?? 0).toFixed(2)))]) }}
    >
      {series.length > 0 ? <StackedBars data={data} series={series} onSelect={(p) => drill(router, p)} /> : <p className="py-16 text-center text-[14px] text-ink-3">Nothing spent in this range.</p>}
    </ChartFrame>
  );
}

export function CostsCard({ data, fees, spread, gains }: { data: StackPoint[]; fees: string; spread: string; gains: string }) {
  const fmt = useFmt();
  const router = useRouter();
  const series: StackSeries[] = [
    { key: "fees", label: "Fees charged", color: "var(--c-out)" },
    { key: "spread", label: "Rate spread", color: "color-mix(in srgb, var(--c-out) 42%, var(--surface))" },
  ];
  const any = data.some((d) => (d.fees as number) > 0 || (d.spread as number) > 0);
  return (
    <ChartFrame
      title="Fees and conversion costs"
      subtitle={`${fees} in fees · ${spread} lost to rates${Number(gains) > 0 ? ` · ${gains} gained` : ""}`}
      legend={series.map((s) => ({ label: s.label, color: s.color }))}
      table={{ columns: ["Period", "Fees", "Rate spread"], rows: data.map((p) => [p.title, fmt.inBase(((p.fees as number) ?? 0).toFixed(2)), fmt.inBase(((p.spread as number) ?? 0).toFixed(2))]) }}
    >
      {any ? <StackedBars data={data} series={series} onSelect={(p) => drill(router, p)} /> : <p className="py-16 text-center text-[14px] text-ink-3">No fees or conversion costs here. Nice.</p>}
    </ChartFrame>
  );
}

export function ForecastCard({ points, todayLabel, rows, start, end, variable, automatic, streams, bills }: { points: ForecastPoint[]; todayLabel: string; rows: { label: string; income: string; bills: string; variable: string; net: string; end: string }[]; start: string; end: string; variable: string; automatic: boolean; streams: number; bills: number }) {
  return (
    <ChartFrame
      title="Forecast"
      subtitle={
        <>
          <span className="mr-2 rounded-full bg-amber-soft px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-ink">Projection</span>
          Not your balance. {start} today → about {end} in six months.
        </>
      }
      legend={[
        { label: "What you had", color: "var(--accent)", shape: "line" },
        { label: "Forecast", color: "color-mix(in srgb, var(--accent) 70%, transparent)", shape: "dot" },
      ]}
      table={{ columns: ["Month", "Expected pay", "Bills", "Everyday", "Net", "Money at end"], rows: rows.map((r) => [r.label, r.income, r.bills, r.variable, r.net, r.end]) }}
    >
      <ForecastChart data={points} todayLabel={todayLabel} />
      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
        Built from {streams} expected {streams === 1 ? "income" : "incomes"} and {bills} recurring {bills === 1 ? "bill" : "bills"} on their due dates, plus about {variable} a month of everyday spending {automatic ? "(your recent average)" : "(your setting)"}. Expected pay is never counted as money you already have.
      </p>
    </ChartFrame>
  );
}
