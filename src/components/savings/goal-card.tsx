"use client";

import { ArrowDownToLine, ArrowUpFromLine, CalendarClock, Check, Pencil, Star, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useApp, useFmt } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon-bubble";
import { Progress } from "@/components/ui/progress";
import type { GoalView } from "@/lib/app-types";
import { formatDateShort, relativeDays } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";
import { GoalSheet, ReserveSheet } from "./goal-sheets";

export interface GoalCardData {
  goal: GoalView;
  ratio: number;
  /** all strings: decimals can't cross the server/client boundary */
  current: string;
  target: string;
  remaining: string;
  reserved: string;
  done: boolean;
  status: "done" | "on_track" | "behind" | "no_deadline" | "unknown";
  requiredMonthlyBase: string | null;
  estimatedCompletion: string | null;
  monthsLeft: number | null;
}

/** A goal: how far along, what's left, what pace it needs, and when your current pace gets there. */
export function GoalCard({ data, availableBase }: { data: GoalCardData; availableBase: string }) {
  const { goal } = data;
  const app = useApp();
  const fmt = useFmt();
  const [edit, setEdit] = useState(false);
  const [mode, setMode] = useState<"reserve" | "release" | null>(null);
  const color = goal.color ?? "#4E8D6E";
  const isTotal = goal.kind === "TOTAL";

  const status =
    data.status === "done"
      ? { text: "Reached", icon: <Check className="size-3.5" />, cls: "bg-accent-soft text-c-in" }
      : data.status === "on_track"
        ? { text: "On track", icon: <Check className="size-3.5" />, cls: "bg-accent-soft text-c-in" }
        : data.status === "behind"
          ? { text: "Behind", icon: <TriangleAlert className="size-3.5" />, cls: "bg-amber-soft text-ink" }
          : null;

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <IconBubble icon={goal.icon} color={color} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[17px] font-extrabold tracking-tight text-ink">{goal.name}</h3>
            {goal.isPrimary ? <Star className="size-4 shrink-0 fill-amber text-amber" aria-label="Main goal" /> : null}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {goal.kind === "EMERGENCY" ? "Emergency fund" : isTotal ? "Total savings milestone" : "Set aside"}
            {goal.priority === 1 ? " · High priority" : goal.priority === 3 ? " · Low priority" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status ? (
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold", status.cls)}>
              {status.icon}
              {status.text}
            </span>
          ) : null}
          <Button variant="ghost" size="iconSm" onClick={() => setEdit(true)} aria-label={`Edit ${goal.name}`}>
            <Pencil className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="num text-[22px] font-extrabold tracking-tight text-ink">{fmt.money(data.current, goal.currency, { decimals: 0 })}</p>
          <p className="num text-[13.5px] text-ink-2">
            of {fmt.money(data.target, goal.currency, { decimals: 0 })} · <span className="font-bold text-ink">{fmt.pct(data.ratio, 0)}</span>
          </p>
        </div>
        <Progress value={data.ratio} color={color} size="lg" label={`${goal.name} progress`} />
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
        {!data.done ? (
          <div>
            <dt className="text-ink-3">Still to go</dt>
            <dd className="num mt-0.5 font-bold text-ink">{fmt.money(data.remaining, goal.currency, { decimals: 0 })}</dd>
          </div>
        ) : null}
        {goal.targetDate && !data.done ? (
          <div>
            <dt className="flex items-center gap-1.5 text-ink-3">
              <CalendarClock className="size-3.5" />
              By {formatDateShort(goal.targetDate, app.today)}
            </dt>
            <dd className="num mt-0.5 font-bold text-ink">
              {data.requiredMonthlyBase ? `${fmt.inBase(data.requiredMonthlyBase, { decimals: 0 })} / month` : "—"}
              <span className="ml-1.5 font-medium text-ink-3">needed</span>
            </dd>
          </div>
        ) : null}
        {data.estimatedCompletion && !data.done ? (
          <div className="sm:col-span-2">
            <dt className="text-ink-3">At your recent pace</dt>
            <dd className="mt-0.5 font-semibold text-ink">
              reached around {formatDateShort(data.estimatedCompletion, app.today)} <span className="font-medium text-ink-3">({relativeDays(data.estimatedCompletion, app.today)})</span>
            </dd>
          </div>
        ) : !data.done && data.status !== "no_deadline" && !data.estimatedCompletion ? (
          <div className="sm:col-span-2 text-ink-3">Save a little and the estimate will appear here.</div>
        ) : null}
      </dl>

      {!isTotal ? (
        <div className="mt-5 flex gap-2.5">
          <Button variant="soft" size="sm" className="flex-1" onClick={() => setMode("reserve")}>
            <ArrowDownToLine className="size-4" />
            Set aside
          </Button>
          <Button variant="subtle" size="sm" className="flex-1" onClick={() => setMode("release")} disabled={Number(data.reserved) <= 0}>
            <ArrowUpFromLine className="size-4" />
            Release
          </Button>
        </div>
      ) : null}

      {edit ? <GoalSheet key={`e-${goal.id}`} open={edit} onOpenChange={setEdit} goal={goal} /> : null}
      {mode ? <ReserveSheet key={`${mode}-${goal.id}`} open onOpenChange={(o) => !o && setMode(null)} goal={goal} mode={mode} availableBase={availableBase} reserved={data.reserved} /> : null}
    </Card>
  );
}
