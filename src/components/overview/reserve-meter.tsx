import { StackedBar } from "@/components/ui/progress";
import type { Fmt } from "@/lib/fmt";
import type { Dec } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

const RESERVED = "color-mix(in srgb, var(--accent) 34%, transparent)";

/**
 * Total money split into "available to spend" and "reserved for goals". Reserving never reduces the total:
 * it only moves money between these two parts of the same bar.
 */
export function ReserveMeter({
  total,
  reserved,
  available,
  billsDeducted,
  overReserved,
  fmt,
  className,
}: {
  total: Dec;
  reserved: Dec;
  available: Dec;
  billsDeducted: Dec;
  overReserved: boolean;
  fmt: Fmt;
  className?: string;
}) {
  const reservedShare = total.gt(0) ? Math.min(1, Math.max(0, reserved.div(total).toNumber())) : 0;
  return (
    <div className={className}>
      <StackedBar
        size="lg"
        segments={[
          { value: Math.max(0, 1 - reservedShare), color: "var(--accent)", label: "Available to spend" },
          { value: reservedShare, color: RESERVED, label: "Reserved for goals" },
        ]}
      />
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1.5">
        <div className="flex items-center gap-2 text-[14px]">
          <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: "var(--accent)" }} aria-hidden />
          <span className="text-ink-2">Available to spend</span>
          <span className={cn("num font-bold", overReserved ? "text-c-out" : "text-ink")}>{fmt.inBase(available)}</span>
        </div>
        <div className="flex items-center gap-2 text-[14px]">
          <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: RESERVED }} aria-hidden />
          <span className="text-ink-2">Reserved for goals</span>
          <span className="num font-bold text-ink">{fmt.inBase(reserved)}</span>
        </div>
        {billsDeducted.gt(0) ? <p className="text-[14px] text-ink-2">after {fmt.inBase(billsDeducted)} of upcoming bills</p> : null}
      </div>
    </div>
  );
}
