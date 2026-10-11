import { History } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/amount";
import { AccountGlyph } from "@/components/overview/wallets-card";
import { AddAccountButton, AsOfControl } from "@/components/wallets/controls";
import { Card, SectionTitle } from "@/components/ui/card";
import { Dot } from "@/components/ui/icon-bubble";
import { Empty } from "@/components/ui/empty";
import { StackedBar } from "@/components/ui/progress";
import { formatDateLong, isISODate } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";
import { getState } from "@/server/session";
import { type WalletRow, buildWallets } from "@/server/views/wallets";
import type { Fmt } from "@/lib/fmt";
import { Wallet as WalletIcon } from "lucide-react";

export const metadata = { title: "Wallets & cards" };

function Row({ w, fmt, base }: { w: WalletRow; fmt: Fmt; base: string }) {
  const foreign = w.currency !== base;
  const total = w.composition.reduce((a, c) => a + c.value, 0);
  return (
    <li>
      <Link href={`/wallets/${w.id}`} className="flex items-center gap-4 rounded-2xl px-3 py-3.5 transition hover:bg-ink/[0.045]">
        <AccountGlyph type={w.type} color={w.color} size={46} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-ink">
            {w.name}
            <span className="ml-2 text-[12.5px] font-semibold text-ink-3">{w.currency}</span>
          </p>
          {w.nickname ? <p className="truncate text-[12.5px] text-ink-3">{w.nickname}</p> : null}
          {w.composition.length > 0 && !w.negative ? (
            <div className="mt-2 max-w-md">
              <StackedBar size="sm" segments={w.composition.map((c) => ({ value: c.value, color: c.color, label: c.name }))} />
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                {w.composition.map((c) => (
                  <span key={c.sourceId} className="inline-flex items-center gap-1.5">
                    <Dot color={c.color} size={7} />
                    {c.name} <span className="num font-semibold text-ink-2">{total > 0 ? Math.round((c.value / total) * 100) : 0}%</span>
                  </span>
                ))}
              </p>
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("num text-[17px] font-bold", w.negative ? "text-c-out" : "text-ink")}>{fmt.money(w.balance, w.currency)}</p>
          {foreign ? <p className="num text-[12.5px] text-ink-3">≈ {fmt.inBase(w.baseValue)}</p> : null}
        </div>
      </Link>
    </li>
  );
}

export default async function WalletsPage({ searchParams }: { searchParams: Promise<{ asof?: string; new?: string }> }) {
  const q = await searchParams;
  const s = await getState();
  const asOf = q.asof && isISODate(q.asof) && q.asof < s.today ? q.asof : s.today;
  const m = buildWallets(s, asOf);
  const base = s.data.settings.baseCurrency;
  const f = s.fmt;

  const foreignRates = [...new Set(s.data.accounts.map((a) => a.currency))]
    .filter((c) => c !== base)
    .map((c) => ({ currency: c, rate: s.ledger.rates.toBase(c, s.today) }));

  return (
    <div className="flex flex-col gap-8 pt-1">
      <section className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-[14px] font-semibold text-ink-2">{m.isHistorical ? `Total on ${formatDateLong(m.asOf)}` : "Total across all accounts"}</p>
          <Amount value={m.total} currency={base} locale={f.locale} className="mt-1.5 text-[48px] font-extrabold leading-none tracking-tight text-ink" />
          {m.byCurrency.length > 1 ? (
            <p className="num mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-ink-2">
              {m.byCurrency.map((c) => (
                <span key={c.currency}>
                  <span className="font-semibold text-ink">{f.money(c.amount, c.currency, { decimals: 0 })}</span>
                  {c.currency !== base ? <span className="text-ink-3"> ≈ {f.inBase(c.baseValue, { decimals: 0 })}</span> : null}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          <AsOfControl value={m.asOf} />
          <AddAccountButton autoOpen={q.new === "1"} />
        </div>
      </section>

      {m.isHistorical ? (
        <div className="flex items-center gap-3 rounded-[18px] bg-accent-soft px-4 py-3 text-[14px] text-ink">
          <History className="size-[18px] shrink-0 text-accent" />
          <p className="flex-1">
            You&rsquo;re looking at <span className="font-semibold">{formatDateLong(m.asOf)}</span>, valued at the exchange rates of that day.
          </p>
          <Link href="/wallets" className="shrink-0 rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-semibold shadow-card hover:bg-surface-2">
            Back to today
          </Link>
        </div>
      ) : null}

      {m.groups.length === 0 ? (
        <Card>
          <Empty icon={<WalletIcon className="size-6" />} title="No accounts yet" action={<AddAccountButton />}>
            Add each card, cash wallet and savings account, with what&rsquo;s already in it.
          </Empty>
        </Card>
      ) : null}

      {m.groups.map((g) => (
        <section key={g.type}>
          <SectionTitle>{g.label}</SectionTitle>
          <Card className="p-2 sm:p-3">
            <ul>
              {g.rows.map((w) => (
                <Row key={w.id} w={w} fmt={f} base={base} />
              ))}
            </ul>
          </Card>
        </section>
      ))}

      {m.sources.length > 0 ? (
        <section>
          <SectionTitle>Whose money is it</SectionTitle>
          <Card className="p-5 sm:p-6">
            <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
              Every unit of money belongs to the income it came from, wherever it sits. {m.isHistorical ? "This is how it was split that day." : "Moving it between accounts never changes that."}
            </p>
            <StackedBar size="lg" segments={m.sources.map((x) => ({ value: x.value.toNumber(), color: x.color, label: x.name }))} />
            <ul className="mt-5 divide-y divide-line">
              {m.sources.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-3">
                  <Dot color={x.color} size={10} />
                  <span className="flex-1 text-[15px] font-semibold text-ink">{x.name}</span>
                  <span className="num text-[13px] text-ink-3">{f.pct(x.share, 0)}</span>
                  <span className="num w-28 text-right text-[15px] font-bold text-ink">{f.inBase(x.value)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {foreignRates.length > 0 ? (
        <section>
          <SectionTitle action={<Link href="/settings#rates" className="text-[13px] font-semibold text-accent hover:underline">Edit rates →</Link>}>Valuation rates</SectionTitle>
          <Card className="p-5">
            <p className="mb-3 text-[13.5px] text-ink-2">Foreign balances are shown in {base} at these rates. Past entries keep the rate they were recorded with.</p>
            <ul className="flex flex-wrap gap-x-8 gap-y-2">
              {foreignRates.map((r) => (
                <li key={r.currency} className="num text-[15px] font-semibold text-ink">
                  1 {r.currency} = {r.rate ? f.rate(r.rate) : "?"} {base}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {m.archived.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none px-1 text-[14px] font-semibold text-ink-2 hover:text-ink">Archived accounts ({m.archived.length})</summary>
          <Card className="mt-3 p-2 sm:p-3">
            <ul>
              {m.archived.map((w) => (
                <Row key={w.id} w={w} fmt={f} base={base} />
              ))}
            </ul>
          </Card>
        </details>
      ) : null}
    </div>
  );
}
