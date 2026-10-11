import Link from "next/link";
import { Amount } from "@/components/amount";
import { Card, SectionTitle } from "@/components/ui/card";
import { Dot } from "@/components/ui/icon-bubble";
import { Progress, StackedBar } from "@/components/ui/progress";
import type { Fmt } from "@/lib/fmt";
import type { SourceRow } from "@/server/views/overview";

function Column({ s, fmt, base }: { s: SourceRow; fmt: Fmt; base: string }) {
  const used = s.received.gt(0) ? Math.min(1, s.spent.div(s.received).toNumber()) : s.spent.gt(0) ? 1 : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Dot color={s.color} size={10} />
        <p className="truncate text-[14.5px] font-semibold text-ink">{s.name}</p>
      </div>
      <Amount value={s.remaining} currency={base} locale={fmt.locale} className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-ink" decimals="never" />
      {s.holdings.length > 0 ? (
        <p className="num mt-0.5 text-[12.5px] text-ink-3">{s.holdings.map((h) => fmt.money(h.amount, h.currency, { decimals: 0 })).join(" · ")} held in foreign currency</p>
      ) : (
        <p className="mt-0.5 text-[12.5px] text-ink-3">remaining, carried over</p>
      )}
      <dl className="mt-4 space-y-1.5 text-[13.5px]">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">Received</dt>
          <dd className="num font-semibold text-ink">{fmt.inBase(s.received, { decimals: 0 })}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">Spent</dt>
          <dd className="num font-semibold text-ink">{fmt.inBase(s.spent, { decimals: 0 })}</dd>
        </div>
      </dl>
      {s.received.gt(0) ? <Progress value={used} color={s.color} className="mt-3" label={`${s.name}: share of income spent`} /> : null}
      <p className="mt-2 text-[12.5px] text-ink-3">{s.rate && s.received.gt(0) ? <>Kept <span className="num font-semibold text-ink-2">{fmt.pct(s.rate, 0)}</span> of what came in</> : "Nothing received in this range"}</p>
    </div>
  );
}

/** How much of each income is still around, wherever it sits: the "belongs to" view. */
export function SourcesCard({ sources, fmt, base, total }: { sources: SourceRow[]; fmt: Fmt; base: string; total: import("@/lib/finance/money").Dec }) {
  const main = sources.filter((s) => !s.isSystem).slice(0, 2);
  const rest = [...sources.filter((s) => !s.isSystem).slice(2), ...sources.filter((s) => s.isSystem)];
  const positive = sources.filter((s) => s.remaining.gt(0));
  return (
    <section>
      <SectionTitle action={<Link href="/income" className="text-[13px] font-semibold text-accent hover:underline">Income →</Link>}>Where it came from</SectionTitle>
      <Card className="p-5 sm:p-6">
        {positive.length > 0 ? (
          <>
            <StackedBar size="lg" segments={sources.map((s) => ({ value: s.remaining.toNumber(), color: s.color, label: s.name }))} />
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {positive.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                  <Dot color={s.color} />
                  {s.name}
                  <span className="num font-semibold text-ink">{total.gt(0) ? fmt.pct(s.remaining.div(total), 0) : "—"}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {main.length > 0 ? (
          <div className={`grid gap-8 ${positive.length > 0 ? "mt-6 border-t border-line pt-6" : ""} ${main.length > 1 ? "sm:grid-cols-2 sm:gap-10" : ""}`}>
            {main.map((s) => (
              <Column key={s.id} s={s} fmt={fmt} base={base} />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-ink-2">Add an income to see how much of it you have kept.</p>
        )}
        {rest.length > 0 ? (
          <ul className="mt-6 divide-y divide-line border-t border-line">
            {rest.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Dot color={s.color} size={10} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-ink">{s.name}</p>
                  <p className="num truncate text-[12.5px] text-ink-3">
                    {s.isSystem ? "Money you already had" : `Received ${fmt.inBase(s.received, { decimals: 0 })} · spent ${fmt.inBase(s.spent, { decimals: 0 })}`}
                  </p>
                </div>
                <p className="num text-[15px] font-bold text-ink">{fmt.inBase(s.remaining, { decimals: 0 })}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </section>
  );
}
