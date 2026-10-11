import { Check, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Dot } from "@/components/ui/icon-bubble";
import { Progress } from "@/components/ui/progress";
import { clampRatio, type StrategyReport } from "@/lib/finance/savings";
import type { Fmt } from "@/lib/fmt";
import { cn } from "@/lib/utils";

type SourceMap = Record<string, { name: string; color: string }>;

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold", ok ? "bg-accent-soft text-c-in" : "bg-amber-soft text-ink")}>
      {ok ? <Check className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
      {children}
    </span>
  );
}

function Equation({ items }: { items: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-3">
      {items.map((it, i) => (
        <div key={it.label} className="flex items-end gap-3">
          {i > 0 ? <span className="pb-0.5 text-[20px] font-semibold text-ink-3">{i === items.length - 1 ? "=" : "−"}</span> : null}
          <div>
            <p className="text-[12.5px] text-ink-3">{it.label}</p>
            <p className={cn("num text-[20px] font-extrabold tracking-tight", it.strong ? "text-c-in" : "text-ink")}>{it.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The active savings strategy as a live read-out. It only measures: it never changes a balance. */
export function StrategyPanel({ title, blurb, report, fmt, sources, rangeText }: { title: string; blurb: string; report: StrategyReport; fmt: Fmt; sources: SourceMap; rangeText: string }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-3">Savings strategy</p>
          <h3 className="mt-1 text-[20px] font-extrabold tracking-tight text-ink">{title}</h3>
          <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-ink-2">{blurb}</p>
        </div>
        <Link href="/settings#strategy" className="shrink-0 rounded-full bg-ink/[0.06] px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-ink/[0.1]">
          Change
        </Link>
      </div>

      {report.strategy === "SAVE_ALL" ? (
        <>
          <Equation
            items={[
              { label: "Income", value: fmt.inBase(report.income, { decimals: 0 }) },
              { label: "Spent", value: fmt.inBase(report.spent, { decimals: 0 }) },
              { label: "Saved", value: fmt.inBase(report.saved, { decimals: 0 }), strong: !report.saved.isNegative() },
            ]}
          />
          <p className="mt-3 text-[13.5px] text-ink-2">
            {rangeText}
            {report.rate ? <> · you kept <span className="font-bold text-ink">{fmt.pct(report.rate, 0)}</span> of what came in</> : null}
          </p>
        </>
      ) : null}

      {report.strategy === "PERCENT_TARGET" ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="num text-[15px] text-ink-2">
              Target <span className="font-bold text-ink">{fmt.inBase(report.target, { decimals: 0 })}</span> ({report.percent}% of {fmt.inBase(report.income, { decimals: 0 })} earned)
            </p>
            <Status ok={!report.delta.isNegative()}>{report.delta.isNegative() ? `${fmt.inBase(report.delta.abs(), { decimals: 0 })} behind` : `${fmt.inBase(report.delta, { decimals: 0 })} ahead`}</Status>
          </div>
          <Progress className="mt-3" size="lg" value={clampRatio(report.achieved)} tone={report.delta.isNegative() ? "warn" : "accent"} label="Progress toward the savings target" />
          <p className="num mt-2 text-[13.5px] text-ink-2">
            Saved <span className="font-bold text-ink">{fmt.inBase(report.actual, { decimals: 0 })}</span>
            {report.achieved ? ` · ${fmt.pct(report.achieved, 0)} of the target` : ""}. {rangeText}.
          </p>
          {report.bySource.length > 1 ? (
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {report.bySource.map((x) => (
                <li key={x.sourceId} className="flex items-center gap-3 py-3 text-[14px]">
                  <Dot color={sources[x.sourceId]?.color ?? "var(--src-0)"} size={9} />
                  <span className="flex-1 font-semibold text-ink">{sources[x.sourceId]?.name ?? "Income"}</span>
                  <span className="num text-ink-3">target {fmt.inBase(x.target, { decimals: 0 })}</span>
                  <span className="num w-24 text-right font-bold text-ink">{fmt.inBase(x.actual, { decimals: 0 })}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {report.strategy === "FIXED_MONTHLY" ? (
        <div className="mt-5">
          {report.target.isZero() ? (
            <p className="text-[14px] text-ink-2">Set the monthly amount you want to save in <Link className="font-semibold text-accent hover:underline" href="/settings#strategy">settings</Link>.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="num text-[15px] text-ink-2">
                  <span className="text-[26px] font-extrabold tracking-tight text-ink">{fmt.inBase(report.actual, { decimals: 0 })}</span> of {fmt.inBase(report.target, { decimals: 0 })} this month
                </p>
                <Status ok={report.remaining.isZero()}>{report.remaining.isZero() ? "Target reached" : `${fmt.inBase(report.remaining, { decimals: 0 })} to go`}</Status>
              </div>
              <Progress className="mt-3" size="lg" value={clampRatio(report.achieved)} label="Progress toward this month's savings amount" />
              {report.neededPerDay ? (
                <p className="num mt-2 text-[13.5px] text-ink-2">
                  {report.daysLeft} days left: about <span className="font-bold text-ink">{fmt.inBase(report.neededPerDay, { decimals: 0 })}</span> a day to get there.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {report.strategy === "BUDGET_50_30_20" ? (
        <div className="mt-5 flex flex-col gap-5">
          {report.lines.map((l) => {
            const ratio = l.allocated.gt(0) ? l.actual.div(l.allocated).toNumber() : 0;
            const over = l.id !== "SAVINGS" && ratio > 1;
            return (
              <div key={l.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <p className="text-[14.5px] font-semibold text-ink">
                    {l.label} <span className="font-medium text-ink-3">{l.percent}%</span>
                  </p>
                  <p className="num text-[13.5px] text-ink-2">
                    <span className="font-bold text-ink">{fmt.inBase(l.actual, { decimals: 0 })}</span> of {fmt.inBase(l.allocated, { decimals: 0 })}
                    {l.share ? <span className="text-ink-3"> · {fmt.pct(l.share, 0)} of income</span> : null}
                  </p>
                </div>
                <Progress value={Math.min(1, ratio)} tone={over ? "danger" : l.id === "SAVINGS" ? "accent" : "ink"} label={`${l.label}: actual against plan`} />
                <p className={cn("mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold", over ? "text-c-out" : "text-ink-3")}>
                  {over ? <TriangleAlert className="size-3.5" /> : null}
                  {l.id === "SAVINGS"
                    ? l.delta.isNegative()
                      ? `${fmt.inBase(l.delta.abs(), { decimals: 0 })} short of the plan`
                      : `${fmt.inBase(l.delta, { decimals: 0 })} more than planned`
                    : l.delta.isNegative()
                      ? `Over plan by ${fmt.inBase(l.delta.abs(), { decimals: 0 })}`
                      : `${fmt.inBase(l.delta, { decimals: 0 })} under plan`}
                </p>
              </div>
            );
          })}
          {report.unclassified.gt(0) ? <p className="num text-[12.5px] text-ink-3">{fmt.inBase(report.unclassified, { decimals: 0 })} was spent in categories not marked as a need or a want.</p> : null}
          {report.percentSum !== 100 ? <p className="text-[12.5px] font-semibold text-c-out">The three shares add up to {report.percentSum}%, not 100%.</p> : null}
        </div>
      ) : null}

      {report.strategy === "EMERGENCY_FIRST" ? (
        <div className="mt-5">
          {report.target.isZero() ? (
            <p className="text-[14px] text-ink-2">Tell the app your essential monthly costs in <Link className="font-semibold text-accent hover:underline" href="/settings#strategy">settings</Link> and it will work out your target.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="num text-[15px] text-ink-2">
                  <span className="text-[26px] font-extrabold tracking-tight text-ink">{fmt.inBase(report.reserved, { decimals: 0 })}</span> of {fmt.inBase(report.target, { decimals: 0 })}
                </p>
                <Status ok={report.done}>{report.done ? "Fully funded" : `${fmt.inBase(report.remaining, { decimals: 0 })} to go`}</Status>
              </div>
              <Progress className="mt-3" size="lg" value={clampRatio(report.progress)} label="Emergency fund progress" />
              <p className="num mt-2 text-[13.5px] text-ink-2">
                Covers <span className="font-bold text-ink">{report.monthsCovered ? report.monthsCovered.toFixed(1) : "0"}</span> of {report.months} months of {fmt.inBase(report.essentialMonthly, { decimals: 0 })} essentials.
              </p>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
