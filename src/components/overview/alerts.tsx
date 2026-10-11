import { Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Alert } from "@/server/views/overview";

/** Things that need attention. Each one pairs an icon with words: colour is never the only signal. */
export function Alerts({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Needs your attention">
      {alerts.map((a) => {
        const Icon = a.tone === "info" ? Info : TriangleAlert;
        return (
          <li
            key={a.id}
            className={cn(
              "flex items-start gap-3.5 rounded-[18px] px-4 py-3.5",
              a.tone === "danger" ? "bg-danger-soft" : a.tone === "warn" ? "bg-amber-soft" : "bg-accent-soft",
            )}
          >
            <Icon className={cn("mt-0.5 size-[18px] shrink-0", a.tone === "danger" ? "text-c-out" : a.tone === "warn" ? "text-amber" : "text-accent")} />
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold text-ink">{a.title}</p>
              {a.body ? <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{a.body}</p> : null}
            </div>
            {a.href && a.actionLabel ? (
              <Link href={a.href} className="shrink-0 self-center rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-card hover:bg-surface-2">
                {a.actionLabel}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
