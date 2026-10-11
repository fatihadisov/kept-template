"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";
import { cn } from "@/lib/utils";

/** Locks this browser again (only shown when a password protects the app). */
export function SignOutButton({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <form action={logoutAction} className={className}>
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className={cn(
          compact
            ? "grid size-10 place-items-center rounded-full text-ink-2 transition hover:bg-ink/[0.05] hover:text-ink"
            : "flex h-10 w-full min-w-0 items-center gap-2 rounded-2xl px-3 text-left text-[13.5px] font-semibold text-ink-2 transition hover:bg-ink/[0.05] hover:text-ink",
        )}
      >
        <LogOut className="size-4 shrink-0" />
        {compact ? null : <span className="truncate">Sign out</span>}
      </button>
    </form>
  );
}
