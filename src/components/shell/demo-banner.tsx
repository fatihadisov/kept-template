"use client";

import { FlaskConical } from "lucide-react";
import { useTransition } from "react";
import { resetDemoAction, setModeAction } from "@/app/actions";

/** Always visible while exploring demo data, so nobody mistakes it for their real numbers. */
export function DemoBanner() {
  const [pending, start] = useTransition();
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-amber-soft px-4 py-2.5 text-[13.5px] text-ink">
      <FlaskConical className="size-4 shrink-0 text-amber" />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold">Demo data.</span> <span className="text-ink-2">Everything here is made up; your own data is untouched.</span>
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => resetDemoAction())}
        className="hidden shrink-0 rounded-full px-3 py-1.5 font-semibold text-ink-2 hover:bg-ink/[0.06] sm:block disabled:opacity-50"
      >
        Reset
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => setModeAction("real"))}
        className="shrink-0 rounded-full bg-surface px-3.5 py-1.5 font-semibold text-ink shadow-card hover:bg-surface-2 disabled:opacity-50"
      >
        Exit demo
      </button>
    </div>
  );
}
