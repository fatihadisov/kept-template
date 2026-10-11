import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { RankedBars } from "@/components/charts/ranked-bars";
import { Card, SectionTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon-bubble";
import { Progress } from "@/components/ui/progress";
import type { Fmt } from "@/lib/fmt";
import type { BudgetRow, CategoryRow } from "@/server/views/overview";
import { cn } from "@/lib/utils";

/** Where the spending went: ranked bars (one hue, one series), then any budgets that are close to their limit. */
export function CategoriesCard({ categories, total, fmt }: { categories: CategoryRow[]; total: import("@/lib/finance/money").Dec; fmt: Fmt }) {
  return (
    <section>
      <SectionTitle>Where it went</SectionTitle>
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-ink-2">Spending by category</p>
          <p className="num text-[13px] font-semibold text-ink">{fmt.inBase(total, { decimals: 0 })}</p>
        </div>
        <RankedBars
          emptyText="Nothing spent in this range."
          items={categories.map((c) => ({
            key: `${c.id ?? c.name}`,
            label: c.name,
            value: c.amount.toNumber(),
            valueText: fmt.inBase(c.amount, { decimals: 0 }),
            sub: `${fmt.pct(c.share, 0)} of spending`,
            href: c.href,
            icon: <IconBubble icon={c.icon} color={c.color} size={36} />,
          }))}
        />
      </Card>
    </section>
  );
}

/** Optional monthly limits, closest to their limit first. A meter's fill carries the state (ok / near / over) with words and an icon. */
export function BudgetsCard({ budgets, fmt }: { budgets: BudgetRow[]; fmt: Fmt }) {
  if (budgets.length === 0) return null;
  return (
    <section>
      <SectionTitle action={<Link href="/settings#budgets" className="text-[13px] font-semibold text-accent hover:underline">Edit</Link>}>Budgets this month</SectionTitle>
      <Card className="p-5 sm:p-6">
        <ul className="flex flex-col gap-5">
          {budgets.slice(0, 5).map((b) => {
            const left = b.limit.minus(b.used);
            const tone = b.state === "over" ? "danger" : b.state === "near" ? "warn" : "accent";
            return (
              <li key={b.id}>
                <div className="mb-2 flex items-center gap-2.5">
                  <IconBubble icon={b.icon} color={b.color} size={30} />
                  <p className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">{b.name}</p>
                  <p className="num shrink-0 text-[13px] text-ink-2">
                    <span className="font-bold text-ink">{fmt.inBase(b.used, { decimals: 0 })}</span> / {fmt.inBase(b.limit, { decimals: 0 })}
                  </p>
                </div>
                <Progress value={Math.min(1, b.ratio)} tone={tone} label={`${b.name} budget`} />
                {b.state !== "ok" ? (
                  <p className={cn("mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold", b.state === "over" ? "text-c-out" : "text-ink-2")}>
                    <TriangleAlert className="size-3.5" />
                    {b.state === "over" ? `Over by ${fmt.inBase(left.abs(), { decimals: 0 })}` : `${fmt.inBase(left, { decimals: 0 })} left, nearly there`}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
