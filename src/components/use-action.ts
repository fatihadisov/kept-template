"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/app-types";

/**
 * Runs a server action with a pending flag and sensible feedback. Actions that need the user's go-ahead
 * (an overdraft, an unusual rate) answer with warnings: the toast then offers "Do it anyway", which runs
 * the same action again with `confirm = true`.
 */
export function useRunAction() {
  const [pending, start] = useTransition();

  function run<T>(
    fn: (confirm: boolean) => Promise<ActionResult<T>>,
    opts: { success?: string; onOk?: (data: T) => void; confirmLabel?: string } = {},
    confirm = false,
  ) {
    start(async () => {
      const res = await fn(confirm);
      if (res.ok) {
        if (opts.success) toast.success(opts.success);
        opts.onOk?.(res.data);
        return;
      }
      if (res.warnings && res.warnings.length > 0 && !confirm) {
        toast.warning(res.warnings.map((w) => w.message).join("\n"), {
          duration: 12_000,
          action: { label: opts.confirmLabel ?? "Do it anyway", onClick: () => run(fn, opts, true) },
        });
        return;
      }
      toast.error(res.error);
    });
  }

  return { run, pending };
}
