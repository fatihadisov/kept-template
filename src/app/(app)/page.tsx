import { Alerts } from "@/components/overview/alerts";
import { BudgetsCard, CategoriesCard } from "@/components/overview/categories-card";
import { OverviewCharts } from "@/components/overview/charts-card";
import { GettingStarted } from "@/components/overview/getting-started";
import { Hero, rangePhrase } from "@/components/overview/hero";
import { RecentCard } from "@/components/overview/recent-card";
import { SourcesCard } from "@/components/overview/sources-card";
import { StatStrip } from "@/components/overview/stat-strip";
import { UpcomingCard } from "@/components/overview/upcoming-card";
import { WalletsCard } from "@/components/overview/wallets-card";
import { describeRange } from "@/lib/finance/periods";
import { getState } from "@/server/session";
import { buildOverview } from "@/server/views/overview";

export default async function OverviewPage() {
  const s = await getState();
  const m = buildOverview(s);

  if (!m.hasAccounts) {
    return <GettingStarted hasAccounts={false} hasIncome={s.data.sources.some((x) => !x.isSystem)} />;
  }

  const base = s.data.settings.baseCurrency;
  const phrase = rangePhrase(s.preset, s.data.settings.reportingMode === "CYCLE");
  const rangeText = describeRange(s.range, s.today);

  return (
    <div className="flex flex-col gap-9 pt-1">
      <Alerts alerts={m.alerts} />
      <Hero model={m} fmt={s.fmt} base={base} phrase={phrase} />
      <StatStrip model={m} fmt={s.fmt} />
      <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-7">
          <SourcesCard sources={m.sources} fmt={s.fmt} base={base} total={m.total} />
        </div>
        <div className="lg:col-span-5">
          <WalletsCard wallets={m.wallets} fmt={s.fmt} base={base} />
        </div>
        <div className="lg:col-span-7">
          <OverviewCharts trend={m.trend} flows={m.flows} rangeText={rangeText} />
        </div>
        <div className="lg:col-span-5">
          <CategoriesCard categories={m.categories} total={m.categoriesTotal} fmt={s.fmt} />
        </div>
        <div className="lg:col-span-7">
          <RecentCard rows={m.recent} />
        </div>
        <div className="flex flex-col gap-9 lg:col-span-5">
          <UpcomingCard items={m.upcoming} />
          <BudgetsCard budgets={m.budgets} fmt={s.fmt} />
        </div>
      </div>
    </div>
  );
}
