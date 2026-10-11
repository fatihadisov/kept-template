"use client";

import { ChevronDown } from "lucide-react";
import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-2xl bg-surface px-4 text-[15px] text-ink ring-1 ring-line placeholder:text-ink-3 transition focus:ring-2 focus:ring-accent/45 disabled:opacity-50 outline-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return <input ref={ref} className={cn(control, "h-12", invalid && "ring-2 ring-danger/60", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-[84px] resize-none py-3", invalid && "ring-2 ring-danger/60", className)} {...props} />;
  },
);

/** A native <select> (best on phones) dressed to match. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(control, "h-12 cursor-pointer appearance-none pr-10", invalid && "ring-2 ring-danger/60", className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      </div>
    );
  },
);

export function Label({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block px-1 text-[13px] font-medium text-ink-2", className)}>
      {children}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 px-1 text-[13px] text-danger">{children}</p>;
}

/** Label + control + error, the unit every form is made of. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {error ? <FieldError>{error}</FieldError> : hint ? <p className="mt-1.5 px-1 text-[12.5px] text-ink-3">{hint}</p> : null}
    </div>
  );
}
