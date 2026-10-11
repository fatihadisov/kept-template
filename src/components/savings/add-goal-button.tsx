"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoalSheet } from "./goal-sheets";

export function AddGoalButton({ label = "New goal", variant = "primary" }: { label?: string; variant?: "primary" | "soft" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="size-[18px]" strokeWidth={2.6} />
        {label}
      </Button>
      {open ? <GoalSheet key="new" open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
