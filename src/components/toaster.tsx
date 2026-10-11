"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset={16}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(92vw,380px)] items-start gap-3 rounded-2xl bg-surface px-4 py-3 text-[14px] font-medium text-ink shadow-pop ring-1 ring-line",
          title: "text-[14px] font-semibold",
          description: "text-[13px] text-ink-2",
          actionButton: "ml-auto rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent",
          error: "text-danger",
        },
      }}
    />
  );
}
