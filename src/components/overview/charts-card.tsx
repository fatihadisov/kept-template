"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFmt } from "@/components/app-provider";
import { FlowBars, NetBars, type FlowPoint } from "@/components/charts/bar-charts";
import { ChartFrame } from "@/components/charts/chart-frame";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { Segmented } from "@/components/ui/segmented";
import { formatDateLong } from "@/lib/finance/dates";

type Tab = "money" | "flow" | "net";

/** The three pictures people ask for first, behind one switch so the page stays calm. */
export function OverviewCharts({ trend, flows, rangeText }: { trend: TrendPoint[]; flows: FlowPoint[]; rangeText: string }) {
  const fmt = useFmt();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("money");
  const open = (p: FlowPoint) => router.push(`/transactions?from=${p.from}&to=${p.to}`);

  const toolbar = (
    <Segmented
      value={tab}
      onChange={setTab}
      size="sm"
      label="Chart"
      options={[
        { value: "money", label: "Money" },
        { value: "flow", label: "In vs out" },
        { value: "net", label: "Kept" },
      ]}
    />
  );

  if (tab === "money") {
    return (
      <ChartFrame
        title="Money over time"
        subtitle={rangeText}
        toolbar={toolbar}
        table={{ columns: ["Date", "Total money"], rows: trend.map((p) => [p.date, fmt.inBase(p.value.toFixed(2))]) }}
      >
        {trend.length > 1 ? <TrendChart data={trend} seriesLabel="Total money" formatTitle={(p) => formatDateLong(p.date)} /> : <p className="py-16 text-center text-[14px] text-ink-3">Not enough history yet.</p>}
      </ChartFrame>
    );
  }
  if (tab === "flow") {
    return (
      <ChartFrame
        title="Income vs spending"
        subtitle="Per month, in your reporting currency"
        toolbar={toolbar}
        legend={[
          { label: "Income", color: "var(--c-in)" },
          { label: "Spent", color: "var(--c-out)" },
        ]}
        table={{ columns: ["Period", "Income", "Spent", "Kept"], rows: flows.map((p) => [p.title, fmt.inBase(p.income.toFixed(2)), fmt.inBase(p.spent.toFixed(2)), fmt.delta(p.net.toFixed(2))]) }}
      >
        <FlowBars data={flows} onSelect={open} />
      </ChartFrame>
    );
  }
  return (
    <ChartFrame
      title="Kept each month"
      subtitle="Income minus spending: your automatic savings"
      toolbar={toolbar}
      table={{ columns: ["Period", "Kept", "Income", "Spent"], rows: flows.map((p) => [p.title, fmt.delta(p.net.toFixed(2)), fmt.inBase(p.income.toFixed(2)), fmt.inBase(p.spent.toFixed(2))]) }}
    >
      <NetBars data={flows} onSelect={open} />
    </ChartFrame>
  );
}
