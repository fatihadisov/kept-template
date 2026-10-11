import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A settings section: an anchor, a quiet heading, one card. */
export function Section({ id, title, intro, action, children, className }: { id: string; title: string; intro?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h2 className="text-[18px] font-extrabold tracking-tight text-ink">{title}</h2>
          {intro ? <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{intro}</p> : null}
        </div>
        {action}
      </div>
      <Card className={cn("p-2 sm:p-3", className)}>{children}</Card>
    </section>
  );
}

/** label on the left, control on the right, hairlines between rows */
export function Row({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b border-line px-3 py-3.5 last:border-b-0 sm:px-4", className)}>
      <div className="min-w-[200px] flex-1">
        <p className="text-[15px] font-semibold text-ink">{label}</p>
        {hint ? <p className="mt-0.5 max-w-md text-[12.5px] leading-snug text-ink-3">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">{children}</div>
    </div>
  );
}
