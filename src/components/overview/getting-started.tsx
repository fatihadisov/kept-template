"use client";

import { ArrowRight, Check, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { setModeAction } from "@/app/actions";
import { useAddFlow } from "@/components/transaction/add-flow";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A first-run checklist that replaces the dashboard until there is something to show. */
export function GettingStarted({ hasAccounts, hasIncome }: { hasAccounts: boolean; hasIncome: boolean }) {
  const { openAdd } = useAddFlow();
  const [pending, start] = useTransition();
  const steps = [
    { done: hasAccounts, title: "Add where your money is", text: "Cards, cash, a savings account, with what's already in them.", href: "/wallets?new=1" },
    { done: hasIncome, title: "Add your incomes", text: "Each salary on its own, so you can see which one you've kept.", href: "/income?new=1" },
    { done: false, title: "Record your first expense", text: "Everything you don't spend is saved automatically.", onClick: () => openAdd() },
  ];
  return (
    <div className="mx-auto max-w-xl pt-6">
      <h2 className="text-[30px] font-extrabold leading-tight tracking-tight text-ink">Let&rsquo;s set you up.</h2>
      <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">Three steps, about two minutes. You can change everything later.</p>
      <Card className="mt-7 divide-y divide-line overflow-hidden">
        {steps.map((step, i) => {
          const body = (
            <>
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-extrabold", step.done ? "bg-accent text-on-accent" : "bg-ink/[0.07] text-ink-2")}>
                {step.done ? <Check className="size-[18px]" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[16px] font-bold text-ink">{step.title}</span>
                <span className="block text-[13.5px] text-ink-2">{step.text}</span>
              </span>
              <ArrowRight className="size-[18px] shrink-0 text-ink-3" />
            </>
          );
          return step.href ? (
            <Link key={step.title} href={step.href} className="flex items-center gap-4 px-5 py-4 transition hover:bg-ink/[0.03]">
              {body}
            </Link>
          ) : (
            <button key={step.title} type="button" onClick={step.onClick} className="flex w-full items-center gap-4 px-5 py-4 transition hover:bg-ink/[0.03]">
              {body}
            </button>
          );
        })}
      </Card>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => setModeAction("demo"))}
        className="mt-6 inline-flex items-center gap-2 rounded-full px-1 py-2 text-[14px] font-semibold text-ink-2 transition hover:text-ink disabled:opacity-50"
      >
        <FlaskConical className="size-4" />
        Or explore with demo data first
      </button>
    </div>
  );
}
