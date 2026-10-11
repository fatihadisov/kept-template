import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Soft white card: no border, a whisper of shadow (none in dark mode). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[22px] bg-surface shadow-card", className)} {...props} />;
}

/** A small, quiet section label. */
export function SectionTitle({ className, children, action }: { className?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3 px-1", className)}>
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}
