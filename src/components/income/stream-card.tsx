import { CheckCircle2, CircleDashed, Clock3, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dot } from "@/components/ui/icon-bubble";
import { formatDateShort, relativeDays } from "@/lib/finance/dates";
import type { Fmt } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import type { OccurrenceRow, StreamCard } from "@/server/views/income";
import { EditIncomeButton, PaymentChip, PaymentLink, RecordPaymentButton } from "./controls";

function StatusChip({ status, late, paused }: { status: OccurrenceRow["status"] | "paused" | "none"; late?: boolean; paused?: boolean }) {
  if (paused) return <Pill icon={<CircleDashed className="size-3.5" />} text="Paused" tone="neutral" />;
  switch (status) {
    case "received":
      return <Pill icon={<CheckCircle2 className="size-3.5" />} text={late ? "Received late" : "Received"} tone="good" />;
    case "partial":
      return <Pill icon={<TriangleAlert className="size-3.5" />} text="Partly paid" tone="warn" />;
    case "overdue":
      return <Pill icon={<TriangleAlert className="size-3.5" />} text="Not recorded yet" tone="bad" />;
    case "upcoming":
      return <Pill icon={<Clock3 className="size-3.5" />} text="Upcoming" tone="neutral" />;
    default:
      return null;
  }
}

function Pill({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
        tone === "good" && "bg-accent-soft text-c-in",
        tone === "warn" && "bg-amber-soft text-ink",
        tone === "bad" && "bg-danger-soft text-c-out",
        tone === "neutral" && "bg-ink/[0.06] text-ink-2",
      )}
    >
      {icon}
      {text}
    </span>
  );
}

/** One income: its schedule, what's next, what actually arrived, and what's still yours from it. */
export function StreamCardView({ card, fmt, today, hasHistory }: { card: StreamCard; fmt: Fmt; today: string; hasHistory: boolean }) {
  const { source, next } = card;
  const money = (v: import("@/lib/finance/money").Dec | null, c: string) => (v ? fmt.money(v, c) : "—");

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Dot color={card.color} size={11} />
            <h3 className="truncate text-[18px] font-extrabold tracking-tight text-ink">{source.name}</h3>
          </div>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {card.scheduleText}
            {source.expectedAmount ? <span> · {fmt.money(source.expectedAmount, source.currency, { decimals: 0 })}</span> : null}
            {card.destination ? <span className="text-ink-3"> → {card.destination}</span> : null}
          </p>
        </div>
        <div className="-mr-2 -mt-1 shrink-0">
          <EditIncomeButton source={source} hasHistory={hasHistory} />
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-bg px-4 py-3.5">
        {!source.isActive ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] text-ink-2">This income is paused: no reminders, history kept.</p>
            <StatusChip status="none" paused />
          </div>
        ) : next ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-ink-3">{next.status === "overdue" ? "Expected, not recorded" : next.status === "partial" ? "Partly received" : "Next payment"}</p>
              <p className="mt-0.5 text-[15.5px] font-bold text-ink">
                {next.when} <span className="font-semibold text-ink-3">· {relativeDays(next.dueDate, today)}</span>
              </p>
              <p className="num mt-0.5 text-[13.5px] text-ink-2">
                {next.expected ? `${money(next.expected, source.currency)} expected` : "Amount varies"}
                {next.status === "partial" && next.received ? ` · ${money(next.received, next.currency)} received` : ""}
              </p>
            </div>
            <RecordPaymentButton
              streamId={source.id}
              accountId={source.destinationAccountId}
              amount={next.expected ? (next.received && next.status === "partial" ? next.expected.minus(next.received).toFixed() : next.expected.toFixed()) : null}
              dueDate={next.dueDate}
              variant={next.status === "overdue" ? "primary" : "soft"}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] text-ink-2">{card.scheduleText === "No fixed schedule" ? "No fixed schedule: record each payment when it arrives." : "No upcoming payment found."}</p>
            <RecordPaymentButton streamId={source.id} accountId={source.destinationAccountId} amount={source.expectedAmount} dueDate={null} label="Record" />
          </div>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4 text-[13px]">
        <div>
          <dt className="text-ink-3">Received</dt>
          <dd className="num mt-0.5 text-[16px] font-bold text-ink">{fmt.inBase(card.rangeReceived, { decimals: 0 })}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Spent from it</dt>
          <dd className="num mt-0.5 text-[16px] font-bold text-ink">{fmt.inBase(card.rangeSpent, { decimals: 0 })}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Still yours</dt>
          <dd className="num mt-0.5 text-[16px] font-bold text-ink">{fmt.inBase(card.remaining, { decimals: 0 })}</dd>
        </div>
      </dl>

      {card.occurrences.length > 0 ? (
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Pay history</p>
          <ul className="divide-y divide-line">
            {card.occurrences.map((o) => (
              <li key={o.dueDate} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14.5px] font-semibold text-ink">{formatDateShort(o.dueDate, today)}</span>
                  <StatusChip status={o.status} late={o.late} />
                </div>
                <p className="num mt-1 text-[13.5px] text-ink-2">
                  {o.payments.length === 0 ? (
                    <span className="text-ink-3">{o.expected ? `${money(o.expected, source.currency)} expected, nothing received` : "Nothing received"}</span>
                  ) : (
                    <>
                      {o.payments.length === 1 ? <PaymentLink tx={o.payments[0].tx}>{money(o.received, o.currency)}</PaymentLink> : money(o.received, o.currency)}
                      {o.expected ? <span className="text-ink-3"> of {money(o.expected, source.currency)}</span> : null}
                      {o.variance && !o.variance.isZero() ? (
                        <span className={cn("ml-2 font-semibold", o.variance.isNegative() ? "text-c-out" : "text-c-in")}>{fmt.money(o.variance, o.currency, { sign: "exceptZero" })}</span>
                      ) : null}
                      {o.late && o.lateDays > 0 ? <span className="ml-2 text-ink-3">· {o.lateDays} {o.lateDays === 1 ? "day" : "days"} late</span> : null}
                      {o.earlyDays > 0 ? <span className="ml-2 text-ink-3">· {o.earlyDays} {o.earlyDays === 1 ? "day" : "days"} early</span> : null}
                    </>
                  )}
                </p>
                {o.payments.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {o.payments.map((p) => (
                      <PaymentChip key={p.id} tx={p.tx} text={`${fmt.money(p.amount, p.currency, { decimals: 0 })} · ${formatDateShort(p.date, today)}`} />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
