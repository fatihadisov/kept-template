import { ArrowDownRight, ArrowUpRight, Landmark, Scale } from "lucide-react";
import { Amount } from "@/components/amount";
import { Sparkline } from "@/components/charts/sparkline";
import { ReserveMeter } from "./reserve-meter";
import type { Fmt } from "@/lib/fmt";
import type { RangePreset } from "@/lib/finance/periods";
import type { OverviewModel } from "@/server/views/overview";

export function rangePhrase(preset: RangePreset, cycle: boolean): string {
  switch (preset) {
    case "today":
      return "today";
    case "yesterday":
      return "yesterday";
    case "last7":
      return "in the last 7 days";
    case "thisMonth":
      return cycle ? "this cycle" : "this month";
    case "lastMonth":
      return cycle ? "last cycle" : "last month";
    case "last3m":
      return "in the last 3 months";
    case "last6m":
      return "in the last 6 months";
    case "thisYear":
      return "this year";
    case "lastYear":
      return "last year";
    case "all":
      return "since you started";
    default:
      return "in this range";
  }
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "bad" | "neutral" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
        tone === "good" ? "bg-accent-soft text-c-in" : tone === "bad" ? "bg-danger-soft text-c-out" : "bg-ink/[0.06] text-ink-2"
      }`}
    >
      {children}
    </span>
  );
}

/** The one number the page leads with, and how it moved. */
export function Hero({ model, fmt, base, phrase }: { model: OverviewModel; fmt: Fmt; base: string; phrase: string }) {
  const { movement: mv } = model;
  const savedSign = mv.saved.isZero() ? 0 : mv.saved.isPositive() ? 1 : -1;
  const fx = mv.fx;
  // exchange-rate effects only when something real happened (a rate moved, or a conversion cost money)
  const showFx = mv.hasFx && !fx.abs().lt("0.01");

  return (
    <section className="animate-rise pb-1 pt-1">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink-2">Total money</p>
          <h2 className="mt-1.5">
            <Amount value={model.total} currency={base} locale={fmt.locale} className="text-[52px] font-extrabold leading-none tracking-tight text-ink sm:text-[68px]" />
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {model.hasTransactions ? (
              <Chip tone={savedSign > 0 ? "good" : savedSign < 0 ? "bad" : "neutral"}>
                {savedSign < 0 ? <ArrowDownRight className="size-3.5" strokeWidth={2.6} /> : <ArrowUpRight className="size-3.5" strokeWidth={2.6} />}
                {savedSign < 0 ? `Spent ${fmt.inBase(mv.saved.abs())} more than earned ${phrase}` : `${fmt.inBase(mv.saved)} saved ${phrase}`}
              </Chip>
            ) : null}
            {showFx ? (
              <Chip>
                <Scale className="size-3.5" />
                {fx.isNegative() ? `${fmt.inBase(fx.abs())} lost to exchange rates` : `${fmt.inBase(fx)} gained from exchange rates`}
              </Chip>
            ) : null}
            {!mv.added.isZero() ? (
              <Chip>
                <Landmark className="size-3.5" />
                {fmt.inBase(mv.added)} existing funds added
              </Chip>
            ) : null}
          </div>
        </div>
        {model.trend.length > 2 ? (
          <div className="mt-2 hidden shrink-0 sm:block">
            <Sparkline values={model.trend.map((p) => p.value)} width={168} height={64} label={`Total money ${phrase}`} />
          </div>
        ) : null}
      </div>

      {model.reserved.gt(0) || model.billsDeducted.gt(0) ? (
        <ReserveMeter total={model.total} reserved={model.reserved} available={model.available} billsDeducted={model.billsDeducted} overReserved={model.overReserved} fmt={fmt} className="mt-7 max-w-2xl" />
      ) : null}
    </section>
  );
}
