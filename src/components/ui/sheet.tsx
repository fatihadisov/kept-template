"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A modal that is a bottom drawer on phones and a centred dialog on larger screens — the same
 * content, the right shape for each device. The background matches the page (paper) so the white
 * cards and fields inside read like a continuation of the app, not a box-in-a-box.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  hideTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  hideTitle?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-[28px] bg-bg shadow-pop outline-none",
            "data-[state=open]:animate-sheet-in",
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100vw-48px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:max-h-[88dvh]",
            size === "sm" && "md:max-w-[440px]",
            size === "md" && "md:max-w-[540px]",
            size === "lg" && "md:max-w-[720px]",
            className,
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-ink/15 md:hidden" aria-hidden />
          <div className={cn("flex items-start justify-between gap-4 px-6 pb-2 pt-4 md:pt-6", hideTitle && "pb-0")}>
            <div className={cn(hideTitle && "sr-only")}>
              <Dialog.Title className="text-[19px] font-bold tracking-tight text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[13.5px] text-ink-2">{description}</Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 -mt-1 ml-auto grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-ink/[0.06] hover:text-ink"
            >
              <X className="size-[18px]" />
            </Dialog.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
          {footer ? <div className="safe-bottom border-t border-line bg-bg px-6 py-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
