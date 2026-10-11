import { HandCoins } from "lucide-react";
import { AddIncomeButton } from "@/components/income/controls";
import { StreamCardView } from "@/components/income/stream-card";
import { TxList } from "@/components/transaction/tx-row";
import { Card, SectionTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { getState } from "@/server/session";
import { buildIncome } from "@/server/views/income";

export const metadata = { title: "Income" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const q = await searchParams;
  const s = await getState();
  const m = buildIncome(s);

  return (
    <div className="flex flex-col gap-8 pt-1">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-xl text-[14.5px] leading-relaxed text-ink-2">
          Each income is tracked on its own, whichever account it lands in. Expected pay is a promise, not money you have: it only counts once you record that it arrived.
        </p>
        <AddIncomeButton autoOpen={q.new === "1"} />
      </section>

      {m.hasStreams ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          {m.streams.map((card) => (
            <StreamCardView
              key={card.source.id}
              card={card}
              fmt={s.fmt}
              today={s.today}
              hasHistory={s.data.transactions.some((t) => t.incomeSourceId === card.source.id || t.allocations.some((a) => a.sourceId === card.source.id))}
            />
          ))}
        </div>
      ) : (
        <Card>
          <Empty icon={<HandCoins className="size-6" />} title="No incomes yet" action={<AddIncomeButton label="Add your first income" />}>
            Add each salary separately (what it is, when it arrives, where it lands) and see how much of each you&rsquo;ve kept.
          </Empty>
        </Card>
      )}

      {m.receipts.length > 0 ? (
        <section>
          <SectionTitle>Everything received</SectionTitle>
          <Card className="p-2 sm:p-3">
            <TxList rows={m.receipts} showDate />
          </Card>
        </section>
      ) : null}
    </div>
  );
}
