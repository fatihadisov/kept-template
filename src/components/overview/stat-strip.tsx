import Link from "next/link";
import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { IconBubble } from "@/components/ui/icon-bubble";
import { Progress } from "@/components/ui/progress";
import type { Fmt } from "@/lib/fmt";
import type { OverviewModel } from "@/server/views/overview";
import { cn } from "@/lib/utils";

function Tile({ label, corner, children, className }: { label: string; corner?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 p-5", className)}>
      <div className="flex h-[22px] items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink-2">{label}</p>
        {corner}
      </div>
      {children}
    </div>
  );
}

const signOf = (n: number | null | undefined) => (n === null || n === undefined || Math.abs(n) < 0.005 ? 0 : n > 0 ? 1 : -1);

/** Four numbers, no boxes inside the box: hairlines do the dividing. */
export function StatStrip({ model, fmt }: { model: OverviewModel; fmt: Fmt }) {
  const k = model.kpi;
  const spentSign = signOf(k.spentDelta);
  const savedSign = k.savedDelta.isZero() ? 0 : k.savedDelta.isPositive() ? 1 : -1;
  const rateSign = signOf(k.rateDeltaPts);
  const goal = model.goal;

  return (
    <Card className="grid grid-cols-2 divide-line max-lg:[&>*:nth-child(n+3)]:border-t max-lg:[&>*:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x [&>*]:border-line">
      <Tile label="Spent" corner={<Sparkline values={k.spentSpark} width={56} height={22} color="var(--c-out)" label="Spending by period" />}>
        <p className="truncate text-[28px] font-extrabold leading-tight tracking-tight text-ink">{fmt.inBase(k.spent, { decimals: 0 })}</p>
        {k.spentDelta !== null ? (
          <Delta sign={spentSign} goodWhen="down" note={`vs ${k.comparedTo}`}>
            {fmt.pct(Math.abs(k.spentDelta))}
          </Delta>
        ) : (
          <span className="text-[13px] text-ink-3">No earlier period to compare</span>
        )}
      </Tile>
      <Tile label="Saved" corner={<Sparkline values={k.savedSpark} width={56} height={22} color="var(--c-in)" label="Savings by period" />}>
        <p className={cn("truncate text-[28px] font-extrabold leading-tight tracking-tight", k.saved.isNegative() ? "text-c-out" : "text-ink")}>
          {fmt.inBase(k.saved, { decimals: 0 })}
        </p>
        {model.hasTransactions && !k.savedDelta.isZero() ? (
          <Delta sign={savedSign} note={`vs ${k.comparedTo}`}>
            {fmt.inBase(k.savedDelta.abs(), { decimals: 0 })}
          </Delta>
        ) : (
          <span className="text-[13px] text-ink-3">Income minus spending</span>
        )}
      </Tile>
      <Tile label="Savings rate" className="max-lg:border-t">
        <p className="text-[28px] font-extrabold leading-tight tracking-tight text-ink">{k.rate ? fmt.pct(k.rate, 0) : "—"}</p>
        {k.rate && k.rateDeltaPts !== null ? (
          <Delta sign={rateSign} note={`vs ${k.comparedTo}`}>
            {fmt.points(k.rateDeltaPts)}
          </Delta>
        ) : (
          <span className="text-[13px] text-ink-3">{k.income.isZero() ? "No income in this range" : "Share of income kept"}</span>
        )}
      </Tile>
      <Tile label={goal ? "Main goal" : "Goals"} className="max-lg:border-t">
        {goal ? (
          <Link href="/savings" className="group flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <IconBubble icon={goal.icon} color={goal.color ?? "#4E8D6E"} size={30} />
              <p className="line-clamp-2 text-[15px] font-bold leading-snug text-ink group-hover:text-accent">{goal.name}</p>
            </div>
            <Progress value={goal.ratio} size="lg" label={`${goal.name} progress`} />
            <p className="text-[13px] text-ink-2">
              <span className="font-bold text-ink">{fmt.pct(goal.ratio, 0)}</span> · {fmt.money(goal.current, goal.currency, { decimals: 0 })} of {fmt.money(goal.target, goal.currency, { decimals: 0 })}
            </p>
          </Link>
        ) : (
          <Link href="/savings" className="text-[14.5px] font-semibold text-accent hover:underline">
            Set your first goal →
          </Link>
        )}
      </Tile>
    </Card>
  );
}
