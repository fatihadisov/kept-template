import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

const variants = {
  primary:
    "bg-accent text-on-accent shadow-[0_6px_14px_color-mix(in_srgb,var(--accent)_30%,transparent)] hover:brightness-[1.06]",
  soft: "bg-[color-mix(in_srgb,var(--accent)_17%,transparent)] text-accent hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)]",
  subtle: "bg-ink/[0.06] text-ink hover:bg-ink/[0.1]",
  ghost: "text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
  danger: "bg-danger-soft text-danger hover:bg-[color-mix(in_srgb,var(--danger)_24%,transparent)]",
  outline: "border border-line-strong text-ink hover:bg-ink/[0.04]",
} as const;

const sizes = {
  xs: "h-8 px-3 text-[13px]",
  sm: "h-9 px-4 text-[13.5px]",
  md: "h-11 px-5 text-[15px]",
  lg: "h-[54px] px-8 text-base",
  icon: "h-10 w-10",
  iconSm: "h-8 w-8",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
}

export function Button({ variant = "subtle", size = "md", asChild, className, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
