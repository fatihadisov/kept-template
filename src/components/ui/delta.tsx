import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A signed change. The colour says whether the change is good (direction × whether up is good) and an
 * arrow + the text say the rest, so it never relies on colour alone.
 */
export function Delta({
  sign,
  goodWhen = "up",
  note,
  children,
  className,
}: {
  /** the sign of the change: > 0 up, < 0 down, 0 flat */
  sign: number;
  goodWhen?: "up" | "down";
  /** quieter trailing words ("vs last month"); wraps below the figure when space is short */
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const flat = sign === 0 || Number.isNaN(sign);
  const good = !flat && (sign > 0) === (goodWhen === "up");
  const Icon = flat ? Minus : sign > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] font-semibold", flat ? "text-ink-3" : good ? "text-c-in" : "text-c-out", className)}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Icon className="size-3.5" strokeWidth={2.6} aria-hidden />
        {children}
      </span>
      {note ? <span className="font-medium text-ink-3">{note}</span> : null}
    </span>
  );
}
