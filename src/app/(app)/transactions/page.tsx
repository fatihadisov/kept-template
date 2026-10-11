import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { TxList } from "@/components/transaction/tx-row";
import { CalendarView } from "@/components/transactions/calendar";
import { TransactionFilters } from "@/components/transactions/filters";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { formatDateShort, formatRelativeDay } from "@/lib/finance/dates";
import { getState } from "@/server/session";
import { type RawParams, buildTransactions, parseTxParams } from "@/server/views/transactions";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const s = await getState();
  const q = parseTxParams(sp, s);
  const m = buildTransactions(s, q);
  const f = s.fmt;
  const allCount = s.data.transactions.length;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length) params.set(k, v.join(","));
  }
  const more = new URLSearchParams(params);
  more.set("limit", String(q.limit + 80));

  const dateLabel = q.filter.from === q.filter.to ? formatDateShort(q.filter.from as string, s.today) : `${formatDateShort(q.filter.from as string, s.today)} – ${formatDateShort(q.filter.to as string, s.today)}`;

  return (
    <div className="flex flex-col gap-5 pt-1">
      <Suspense fallback={<div className="h-28" />}>
        <TransactionFilters total={allCount} count={m.total} dateLabel={dateLabel} explicitDates={q.explicitDates} />
      </Suspense>

      {m.total > 0 && q.view === "list" ? (
        <div className="flex flex-wrap gap-x-8 gap-y-1 px-1">
          <p className="text-[14px] text-ink-2">
            Spent <span className="num font-bold text-ink">{f.inBase(m.spent)}</span>
          </p>
          <p className="text-[14px] text-ink-2">
            Income <span className="num font-bold text-c-in">{f.inBase(m.income)}</span>
          </p>
        </div>
      ) : null}

      {q.view === "calendar" && m.calendar ? (
        <CalendarView model={m.calendar} fmt={f} today={s.today} weekStartsOn={s.data.settings.weekStartsOn} baseParams={params} />
      ) : m.total === 0 ? (
        <Card>
          <Empty icon={<ReceiptText className="size-6" />} title={allCount === 0 ? "Nothing recorded yet" : "No entries match"} action={allCount > 0 ? <Link href="/transactions" className="rounded-full bg-accent-soft px-4 py-2 text-[14px] font-semibold text-accent">Clear filters</Link> : undefined}>
            {allCount === 0 ? "Add your first expense or income with the + button." : "Try a wider date range or fewer filters."}
          </Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {m.groups.map((g) => (
            <section key={g.date}>
              <div className="mb-2 flex items-baseline justify-between gap-3 px-2">
                <h3 className="text-[14px] font-bold text-ink">{formatRelativeDay(g.date, s.today)}</h3>
                <p className="num text-[13px] text-ink-3">
                  {g.spent.gt(0) ? `${f.inBase(g.spent)} spent` : ""}
                  {g.spent.gt(0) && g.income.gt(0) ? " · " : ""}
                  {g.income.gt(0) ? <span className="text-c-in">{f.delta(g.income)}</span> : null}
                </p>
              </div>
              <Card className="p-1.5 sm:p-2">
                <TxList rows={g.rows} />
              </Card>
            </section>
          ))}
          {m.hasMore ? (
            <Link href={`/transactions?${more}`} scroll={false} className="mx-auto rounded-full bg-surface px-6 py-3 text-[14px] font-semibold text-ink shadow-card ring-1 ring-line hover:bg-surface-2">
              Show more ({m.total - m.shown} left)
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
