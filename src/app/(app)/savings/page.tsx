import { Target } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/amount";
import { OverviewCharts } from "@/components/overview/charts-card";
import { ReserveMeter } from "@/components/overview/reserve-meter";
import { AddGoalButton } from "@/components/savings/add-goal-button";
import { GoalCard } from "@/components/savings/goal-card";
import { StrategyPanel } from "@/components/savings/strategy-panel";
import { Card, SectionTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { describeRange } from "@/lib/finance/periods";
import { formatDateShort } from "@/lib/finance/dates";
import { getState } from "@/server/session";
import { lookups } from "@/server/views/common";
import { buildSavings } from "@/server/views/savings";
import { rangePhrase } from "@/components/overview/hero";
import { cn } from "@/lib/utils";

export const metadata = { title: "Savings & goals" };

function Row({ label, value, sign, strong, hint }: { label: string; value: string; sign?: "+" | "−" | "="; strong?: boolean; hint?: string }) {
  return (
    <li className={cn("flex items-baseline gap-3 py-3", strong && "pt-4")}>
      <span className="w-5 shrink-0 text-center text-[16px] font-semibold text-ink-3">{sign}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px]", strong ? "font-bold text-ink" : "text-ink-2")}>{label}</span>
        {hint ? <span className="block text-[12.5px] text-ink-3">{hint}</span> : null}
      </span>
      <span className={cn("num text-[16px]", strong ? "text-[20px] font-extrabold text-ink" : "font-semibold text-ink")}>{value}</span>
    </li>
  );
}

export default async function SavingsPage() {
  const s = await getState();
  const m = buildSavings(s);
  const f = s.fmt;
  const base = s.data.settings.baseCurrency;
  const lk = lookups(s);
  const sources = Object.fromEntries(s.data.sources.map((x) => [x.id, { name: x.name, color: lk.source(x.id).color }]));
  const L = m.lifetime;
  const phrase = rangePhrase(s.preset, s.data.settings.reportingMode === "CYCLE");
  const rangeText = describeRange(s.range, s.today);

  return (
    <div className="flex flex-col gap-9 pt-1">
      <section>
        <p className="text-[14px] font-semibold text-ink-2">Total savings</p>
        <Amount value={m.total} currency={base} locale={f.locale} className="mt-1.5 text-[52px] font-extrabold leading-none tracking-tight text-ink sm:text-[64px]" />
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-2">
          Everything you own and haven&rsquo;t spent. Setting money aside for a goal never reduces this: it only decides what is free to spend.{" "}
          <Link href="/wallets" className="font-semibold text-accent hover:underline">
            Not what you really have? Update a balance →
          </Link>
        </p>
        <ReserveMeter className="mt-6 max-w-2xl" total={m.total} reserved={m.reserved} available={m.available} billsDeducted={m.billsDeducted} overReserved={m.overReserved} fmt={f} />
      </section>

      <StrategyPanel title={m.strategy.title} blurb={m.strategy.blurb} report={m.strategy.report} fmt={f} sources={sources} rangeText={`${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} (${rangeText})`} />

      <section>
        <SectionTitle action={<AddGoalButton label="New goal" variant="soft" />}>Goals</SectionTitle>
        {m.goals.length === 0 ? (
          <Card>
            <Empty icon={<Target className="size-6" />} title="What are you saving for?" action={<AddGoalButton label="Add a goal" />}>
              A car, a trip, a six-month cushion. Set money aside without spending it and watch the bar fill.
            </Empty>
          </Card>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            {m.goals.map((g) => (
              <GoalCard
                key={g.goal.id}
                availableBase={m.available.toFixed(2)}
                data={{
                  goal: g.goal,
                  ratio: g.ratio,
                  current: g.progress.current.toFixed(2),
                  target: g.progress.target.toFixed(2),
                  remaining: g.progress.remaining.toFixed(2),
                  reserved: g.reserved.toFixed(2),
                  done: g.progress.done,
                  status: g.progress.status,
                  requiredMonthlyBase: g.progress.requiredMonthlyBase ? g.progress.requiredMonthlyBase.toFixed(2) : null,
                  estimatedCompletion: g.progress.estimatedCompletion,
                  monthsLeft: g.progress.monthsLeft,
                }}
              />
            ))}
          </div>
        )}
        {m.goals.length > 0 ? (
          <p className="mt-3 px-1 text-[12.5px] text-ink-3">
            Estimates assume you keep saving about {f.inBase(m.avgMonthly, { decimals: 0 })} a month (your last three full months) and fund goals in priority order.
          </p>
        ) : null}
      </section>

      <section>
        <SectionTitle>How your savings add up</SectionTitle>
        <Card className="p-5 sm:p-6">
          <p className="mb-2 text-[13.5px] leading-relaxed text-ink-2">
            Everything since {L.since ? formatDateShort(L.since, s.today) : "you started"}, reconciled. What you earned and spent is kept apart from money you already had and from exchange-rate moves, so none of them can pass for savings.
          </p>
          <ul className="divide-y divide-line">
            <Row sign="+" label="Starting savings" hint="Money you already had when you began" value={f.inBase(L.starting)} />
            <Row sign="+" label="Earned" hint="Salaries, bonuses and other income" value={f.inBase(L.earned)} />
            <Row sign="−" label="Spent" hint="After refunds" value={f.inBase(L.spent)} />
            {!L.costs.isZero() ? <Row sign="−" label="Fees & conversion costs" hint="Commissions and the spread banks keep" value={f.inBase(L.costs)} /> : null}
            {!L.revaluation.abs().lt("0.01") ? <Row sign={L.revaluation.isNegative() ? "−" : "+"} label="Exchange-rate changes" hint="What your foreign money is worth now vs when it arrived" value={f.inBase(L.revaluation.abs())} /> : null}
            {!L.corrections.isZero() ? <Row sign={L.corrections.isNegative() ? "−" : "+"} label="Balance corrections" value={f.inBase(L.corrections.abs())} /> : null}
            <Row sign="=" strong label="Saved today" value={f.inBase(L.saved)} />
          </ul>
        </Card>
      </section>

      <OverviewCharts trend={m.trend} flows={m.flows} rangeText="Since you started" />
    </div>
  );
}
