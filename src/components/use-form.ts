"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/app-types";

/**
 * Tiny form state for the entity editors (accounts, incomes, goals...): values, per-field errors from the
 * server, and a submit that reports problems next to the field they belong to.
 */
export function useForm<T extends object>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof T>(key: K, value: T[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!(key as string in e)) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  function submit<R>(fn: (values: T) => Promise<ActionResult<R>>, opts: { success?: string; onOk?: (data: R) => void } = {}) {
    setFormError(null);
    start(async () => {
      const res = await fn(values);
      if (res.ok) {
        if (opts.success) toast.success(opts.success);
        opts.onOk?.(res.data);
      } else {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
      }
    });
  }

  return { values, set, setValues, errors, formError, pending, submit, setErrors };
}
