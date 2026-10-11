import { ChartNoAxesColumn } from "lucide-react";
import { CostsCard, FlowChartCard, ForecastCard, NetChartCard, SourceSpendCard, TrendCard } from "@/components/analytics/charts";
import { CategorySpendCard, CompareCard, InsightsStrip, MovementCard } from "@/components/analytics/sections";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { getState } from "@/server/session";
import { buildAnalytics } from "@/server/views/analytics";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ cmp?: string }> }) {
  const q = await searchParams;
  const s = await getState();
  const m = buildAnalytics(s, q.cmp === "year" ? "year" : "prev");
  const f = s.fmt;

  if (!m.hasData) {
    return (
      <Card>
        <Empty icon={<ChartNoAxesColumn className="size-6" />} title="Nothing to analyse yet">
          Charts, comparisons and a forecast appear as soon as you&rsquo;ve recorded some income and spending.
        </Empty>
      </Card>
    );
  }

  const fc = m.forecast;
  return (
    <div className="flex flex-col gap-6 pt-1">
      <InsightsStrip m={m} fmt={f} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <FlowChartCard data={m.flows} />
        <NetChartCard data={m.flows} />
        <TrendCard title="Savings balance over time" subtitle={m.rangeText} data={m.trend} series="Total money" />
        <TrendCard title="Cumulative savings" subtitle={`Income minus spending since ${m.rangeText.split(" – ")[0]}`} data={m.cumulative} series="Saved so far" zeroBased />
        <CategorySpendCard categories={m.categories} total={m.categoriesTotal} fmt={f} />
        <SourceSpendCard data={m.bySource.points} series={m.bySource.series} />
        <CostsCard data={m.costs.points} fees={f.inBase(m.costs.fees)} spread={f.inBase(m.costs.spread)} gains={m.costs.gains.toFixed(2)} />
        <MovementCard m={m} fmt={f} />
      </div>

      <CompareCard m={m} fmt={f} />

      <ForecastCard
        points={fc.points}
        todayLabel={fc.todayLabel}
        start={f.inBase(fc.start, { decimals: 0 })}
        end={f.inBase(fc.end, { decimals: 0 })}
        variable={f.inBase(fc.assumptions.variable, { decimals: 0 })}
        automatic={fc.assumptions.automatic}
        streams={fc.assumptions.streams}
        bills={fc.assumptions.bills}
        rows={fc.months.map((x) => ({ label: x.label, income: f.inBase(x.income, { decimals: 0 }), bills: f.inBase(x.bills, { decimals: 0 }), variable: f.inBase(x.variable, { decimals: 0 }), net: f.delta(x.net), end: f.inBase(x.end, { decimals: 0 }) }))}
      />
    </div>
  );
}
