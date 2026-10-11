"use client";

import { Switch as S } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative h-7 w-12 shrink-0 cursor-pointer rounded-full bg-ink/15 transition-colors data-[state=checked]:bg-accent disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.25)] transition-transform data-[state=checked]:translate-x-[22px]" />
    </S.Root>
  );
}
