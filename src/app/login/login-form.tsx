"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { type LoginState, loginAction } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * `pinLength` is set when the password is only digits (a 4-digit code, say). The phone then shows its number
 * pad, and the form signs in by itself as soon as the last digit is typed.
 */
export function LoginForm({ next, pinLength }: { next: string; pinLength: number | null }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // a wrong try clears the field: keep it focused (so the number pad stays open) for the next one
  useEffect(() => {
    if (state.error) inputRef.current?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-9 flex w-full max-w-sm flex-col gap-3 text-left">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password" className="sr-only">
        Password
      </label>
      <Input
        ref={inputRef}
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        inputMode={pinLength ? "numeric" : undefined}
        pattern={pinLength ? "[0-9]*" : undefined}
        maxLength={pinLength ?? undefined}
        placeholder={pinLength ? "•".repeat(pinLength) : "Password"}
        autoFocus
        required
        invalid={Boolean(state.error)}
        aria-describedby={state.error ? "login-error" : undefined}
        onInput={
          pinLength
            ? (event) => {
                const field = event.currentTarget;
                const digits = field.value.replace(/\D/g, "").slice(0, pinLength);
                if (digits !== field.value) field.value = digits;
                if (digits.length === pinLength && !pending) formRef.current?.requestSubmit();
              }
            : undefined
        }
        className={cn("h-14 text-center text-[17px]", pinLength && "text-[22px] tracking-[0.4em]")}
      />
      {state.error ? (
        <p id="login-error" role="alert" className="text-center text-[14px] font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full">
        {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
        {pending ? "Checking…" : "Open Kept"}
      </Button>
    </form>
  );
}
