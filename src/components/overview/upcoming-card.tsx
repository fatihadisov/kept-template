"use client";

import { CalendarCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { markRecurringPaidAction } from "@/app/actions";
import { useApp } from "@/components/app-provider";
import { useAddFlow } from "@/components/transaction/add-flow";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { useRunAction } from "@/components/use-action";
import { monthNameShort, parseISO } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";
import type { UpcomingItem } from "@/server/views/overview";

function DateBadge({ date, overdue }: { date: string; overdue: boolean }) {
  const { m, d } = parseISO(date);
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl text-center leading-none", overdue ? "bg-danger-soft text-c-out" : "bg-ink/[0.06] text-ink")}>
      <span>
        <span className="block text-[10.5px] font-bold uppercase tracking-wide opacity-70">{monthNameShort(m)}</span>
        <span className="mt-0.5 block text-[16px] font-extrabold">{d}</span>
      </span>
    </span>
  );
}

/** What's coming up: bills to pay and salaries to expect. Nothing here touches a balance until it's recorded. */
export function UpcomingCard({ items }: { items: UpcomingItem[] }) {
  const { openAdd } = useAddFlow();
  const { today } = useApp();
  const { run, pending } = useRunAction();

  return (
    <section>
      <SectionTitle action={<Link href="/settings#recurring" className="text-[13px] font-semibold text-accent hover:underline">Manage</Link>}>Coming up</SectionTitle>
      <Card className="p-2 sm:p-3">
        {items.length === 0 ? (
          <Empty icon={<CalendarCheck className="size-6" />} title="All clear">
            No bills or pay expected in the next two weeks.
          </Empty>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3.5 rounded-2xl px-3 py-2.5">
                <DateBadge date={item.date} overdue={item.overdue} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{item.title}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
                    <span className={cn("num font-semibold", item.kind === "income" ? "text-c-in" : "text-ink-2")}>
                      {item.kind === "income" ? "+" : "\u2212"}
                      {item.amount}
                    </span>
                    <span aria-hidden>·</span>
                    <span className={cn("inline-flex items-center gap-1", item.overdue && "font-semibold text-c-out")}>
                      {item.overdue ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
                      {item.overdue ? `Overdue · ${item.when}` : item.when}
                    </span>
                  </p>
                </div>
                {item.kind === "bill" && item.bill ? (
                  <Button
                    size="xs"
                    variant="soft"
                    className="shrink-0"
                    disabled={pending}
                    onClick={() => run((confirm) => markRecurringPaidAction(item.bill!.billId, item.bill!.dueDate, {}, confirm), { success: `${item.title} marked as paid` })}
                  >
                    Mark paid
                  </Button>
                ) : null}
                {item.kind === "income" && item.income ? (
                  <Button
                    size="xs"
                    variant="soft"
                    className="shrink-0"
                    onClick={() =>
                      openAdd({
                        type: "INCOME",
                        initial: {
                          type: "INCOME",
                          date: today,
                          accountId: item.income!.accountId ?? "",
                          incomeSourceId: item.income!.streamId,
                          amount: item.income!.amount,
                          expectedDate: item.income!.dueDate,
                        },
                      })
                    }
                  >
                    Record
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
