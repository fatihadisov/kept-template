import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A calm empty state: one icon, one sentence, one next step. */
export function Empty({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent">{icon}</div> : null}
      <p className="text-[16px] font-bold text-ink">{title}</p>
      {children ? <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-ink-2">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
