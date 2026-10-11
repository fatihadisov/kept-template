import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { RankedBars } from "@/components/charts/ranked-bars";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { IconBubble } from "@/components/ui/icon-bubble";
import type { Fmt } from "@/lib/fmt";
import { type Dec, ZERO } from "@/lib/finance/money";
import { cn } from "@/lib/utils";
import type { AnalyticsModel } from "@/server/views/analytics";
import type { CategoryRow } from "@/server/views/overview";
import { CompareToggle } from "./compare-toggle";

const sign = (d: Dec) => (d.isZero() ? 0 : d.isPositive() ? 1 : -1);

function Tile({ label, value, sub, children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 p-5">
      <p className="text-[13px] font-semibold text-ink-2">{label}</p>
      <p className="num truncate text-[24px] font-extrabold leading-tight tracking-tight text-ink">{value}</p>
      {sub ? <p className="text-[13px] text-ink-3">{sub}</p> : null}
      {children}
    </div>
  );
}

/** The headline statistics: what's typical, what stands out, which way things are heading. */
export function InsightsStrip({ m, fmt }: { m: AnalyticsModel; fmt: Fmt }) {
  const ins = m.insights;
  const n = ins.periods.length;
  if (n < 1) {
    return (
      <Card className="p-6">
        <p className="text-[15px] font-semibold text-ink">Your trends will appear after your first full month.</p>
        <p className="mt-1 text-[13.5px] text-ink-2">Averages, your highest-spending month and your savings-rate trend need at least one completed month of entries.</p>
      </Card>
    );
  }
  const trend = ins.savingsRateTrend;
  return (
    <Card className="grid grid-cols-2 lg:grid-cols-4 [&>*]:border-line max-lg:[&>*:nth-child(even)]:border-l max-lg:[&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+5)]:border-t lg:[&>*:not(:nth-child(4n+1))]:border-l">
      <Tile label="Average monthly spending" value={fmt.inBase(ins.avgSpent, { decimals: 0 })} sub={`over ${n} completed ${n === 1 ? "month" : "months"}`} />
      <Tile label="Average saved a month" value={fmt.inBase(ins.avgSavings, { decimals: 0 })} sub={ins.avgSavingsRate ? `${fmt.pct(ins.avgSavingsRate, 0)} of income` : "No income yet"} />
      <Tile label="Savings rate trend" value={ins.avgSavingsRate ? fmt.pct(ins.avgSavingsRate, 0) : "—"}>
        {trend ? (
          <span className={cn("inline-flex items-center gap-1 text-[13px] font-semibold", trend.direction === "up" ? "text-c-in" : trend.direction === "down" ? "text-c-out" : "text-ink-3")}>
            {trend.direction === "up" ? <ArrowUpRight className="size-3.5" strokeWidth={2.6} /> : trend.direction === "down" ? <ArrowDownRight className="size-3.5" strokeWidth={2.6} /> : <Minus className="size-3.5" />}
            {trend.direction === "up" ? "Rising" : trend.direction === "down" ? "Falling" : "Steady"}
            <span className="font-medium text-ink-3">({fmt.points(trend.delta.times(100).toNumber())})</span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-3">Needs two months</span>
        )}
      </Tile>
      <Tile
        label={`${ins.periods[n - 1].period.label} spending`}
        value={fmt.inBase(ins.periods[n - 1].stats.spent, { decimals: 0 })}
        sub={ins.spendingGrowth ? undefined : "Needs two months to compare"}
      >
        {ins.spendingGrowth && n >= 2 ? (
          <Delta sign={sign(ins.spendingGrowth)} goodWhen="down" note={`than ${ins.periods[n - 2].period.label}`}>
            {ins.spendingGrowth.isZero() ? "The same" : `${fmt.pct(ins.spendingGrowth.abs(), 0)} ${ins.spendingGrowth.isNegative() ? "less" : "more"}`}
          </Delta>
        ) : null}
      </Tile>
      <Tile label="Highest-spending month" value={ins.highestSpending ? fmt.inBase(ins.highestSpending.stats.spent, { decimals: 0 }) : "—"} sub={ins.highestSpending?.period.label} />
      <Tile label="Best savings month" value={ins.bestSavings ? fmt.inBase(ins.bestSavings.stats.netSavings, { decimals: 0 }) : "—"} sub={ins.bestSavings?.period.label} />
      <Tile label="Lowest-spending month" value={ins.lowestSpending ? fmt.inBase(ins.lowestSpending.stats.spent, { decimals: 0 }) : "—"} sub={ins.lowestSpending?.period.label} />
      <Tile label="Recurring, next 30 days" value={fmt.inBase(m.nextRecurring, { decimals: 0 })} sub="Bills and subscriptions due" />
    </Card>
  );
}

export function CategorySpendCard({ categories, total, fmt }: { categories: CategoryRow[]; total: Dec; fmt: Fmt }) {
  const top = categories.slice(0, 8);
  const rest = categories.slice(8).reduce((a, c) => a.plus(c.amount), ZERO);
  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-[15px] font-semibold text-ink">Spending by category</h3>
      <p className="mt-0.5 text-[13px] text-ink-2">
        <span className="num font-semibold text-ink">{fmt.inBase(total, { decimals: 0 })}</span> in this range. Tap a category to see its transactions.
      </p>
      <div className="mt-5">
        <RankedBars
          emptyText="Nothing spent in this range."
          items={[
            ...top.map((c) => ({
              key: c.id ?? c.name,
              label: c.name,
              value: c.amount.toNumber(),
              valueText: fmt.inBase(c.amount, { decimals: 0 }),
              sub: `${fmt.pct(c.share, 0)} of spending`,
              href: c.href,
              icon: <IconBubble icon={c.icon} color={c.color} size={34} />,
            })),
            ...(rest.gt(0) ? [{ key: "rest", label: `${categories.length - 8} more`, value: rest.toNumber(), valueText: fmt.inBase(rest, { decimals: 0 }), sub: `${fmt.pct(total.gt(0) ? rest.div(total) : 0, 0)} of spending`, icon: <IconBubble icon="circle-ellipsis" color="#A5A8AE" size={34} /> }] : []),
          ]}
        />
      </div>
    </Card>
  );
}

const fmtVal = (fmt: Fmt, v: Dec, kind: "money" | "percent") => (kind === "percent" ? fmt.pct(v, 0) : fmt.inBase(v, { decimals: 0 }));

/**
 * One line of a comparison. On a phone the earlier figure sits under the label ("was ₼2,805") so
 * nothing scrolls sideways; from `sm` up it becomes its own column, in step with the header.
 */
function CompareRow({ icon, label, was, now, delta }: { icon?: React.ReactNode; label: string; was: string; now: string; delta: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-ink">{label}</p>
        <p className="num text-[12.5px] text-ink-3 sm:hidden">was {was}</p>
      </div>
      <span className="num hidden w-28 text-right text-[14px] text-ink-2 sm:block">{was}</span>
      <div className="flex flex-col items-end gap-0.5 sm:contents">
        <span className="num text-[15px] font-bold text-ink sm:w-28 sm:text-right">{now}</span>
        <span className="sm:w-28 sm:text-right">{delta}</span>
      </div>
    </li>
  );
}

/** This range against another, line by line, then category by category. */
export function CompareCard({ m, fmt }: { m: AnalyticsModel; fmt: Fmt }) {
  const c = m.compare;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Compare</h3>
          <p className="mt-0.5 text-[13px] text-ink-2">
            <span className="font-semibold text-ink">{c.aText}</span> against <span className="font-semibold text-ink">{c.bText}</span>
          </p>
        </div>
        <CompareToggle value={c.mode} />
      </div>

      <div className="mt-4">
        <div className="hidden items-center gap-3 border-b border-line pb-2 text-[12.5px] font-semibold text-ink-3 sm:flex" aria-hidden>
          <span className="flex-1" />
          <span className="w-28 truncate text-right">{c.bText}</span>
          <span className="w-28 truncate text-right">{c.aText}</span>
          <span className="w-28 text-right">Change</span>
        </div>
        <ul className="divide-y divide-line">
          {c.rows.map((r) => {
            const d = r.a.minus(r.b);
            return (
              <CompareRow
                key={r.label}
                label={r.label}
                was={fmtVal(fmt, r.b, r.kind)}
                now={fmtVal(fmt, r.a, r.kind)}
                delta={
                  <Delta sign={sign(d)} goodWhen={r.good === "down" ? "down" : "up"} className="justify-end">
                    <span className="num">{r.kind === "percent" ? fmt.points(d.times(100).toNumber()) : fmt.inBase(d.abs(), { decimals: 0 })}</span>
                  </Delta>
                }
              />
            );
          })}
        </ul>
      </div>

      {c.categories.length > 0 ? (
        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-1 text-[13px] font-semibold text-ink-2">By category</p>
          <ul className="divide-y divide-line">
            {c.categories.map((x) => {
              const d = x.a.minus(x.b);
              return (
                <CompareRow
                  key={x.id ?? x.name}
                  icon={<IconBubble icon={x.icon} color={x.color} size={30} />}
                  label={x.name}
                  was={fmt.inBase(x.b, { decimals: 0 })}
                  now={fmt.inBase(x.a, { decimals: 0 })}
                  delta={
                    <Delta sign={sign(d)} goodWhen="down" className="justify-end">
                      <span className="num">{fmt.inBase(d.abs(), { decimals: 0 })}</span>
                    </Delta>
                  }
                />
              );
            })}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function Line({ label, value, op, strong, hint }: { label: string; value: string; op?: string; strong?: boolean; hint?: string }) {
  return (
    <li className={cn("flex items-baseline gap-3 py-2.5", strong && "pt-3.5")}>
      <span className="w-5 shrink-0 text-center text-[15px] font-semibold text-ink-3">{op}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14.5px]", strong ? "font-bold text-ink" : "text-ink-2")}>{label}</span>
        {hint ? <span className="block text-[12px] text-ink-3">{hint}</span> : null}
      </span>
      <span className={cn("num", strong ? "text-[19px] font-extrabold text-ink" : "text-[15px] font-semibold text-ink")}>{value}</span>
    </li>
  );
}

/** Why your total moved. Spending, income and exchange-rate effects each get their own line. */
export function MovementCard({ m, fmt }: { m: AnalyticsModel; fmt: Fmt }) {
  const v = m.movement;
  const fxTiny = v.fx.abs().lt("0.01");
  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-[15px] font-semibold text-ink">Where the change came from</h3>
      <p className="mt-0.5 text-[13px] text-ink-2">Savings you made are kept apart from exchange-rate moves, so a rate change never looks like earning more.</p>
      <ul className="mt-3 divide-y divide-line">
        <Line label={`Total money before`} hint={v.startDate} value={fmt.inBase(v.start)} />
        {!v.opening.isZero() ? <Line op="+" label="Existing funds added" value={fmt.inBase(v.opening)} /> : null}
        <Line op="+" label="Income" value={fmt.inBase(v.income)} />
        <Line op="−" label="Spent" value={fmt.inBase(v.spent)} />
        {!v.costs.isZero() ? <Line op={v.costs.isNegative() ? "+" : "−"} label="Fees & conversion costs" value={fmt.inBase(v.costs.abs())} /> : null}
        {!fxTiny && (v.ratesMoved || !v.fx.abs().lt("0.05")) ? <Line op={v.fx.isNegative() ? "−" : "+"} label="Exchange-rate changes" hint="What your foreign money is worth now vs before" value={fmt.inBase(v.fx.abs())} /> : null}
        {!v.corrections.isZero() ? <Line op={v.corrections.isNegative() ? "−" : "+"} label="Balance corrections" value={fmt.inBase(v.corrections.abs())} /> : null}
        <Line op="=" strong label="Total money now" value={fmt.inBase(v.end)} />
      </ul>
    </Card>
  );
}
