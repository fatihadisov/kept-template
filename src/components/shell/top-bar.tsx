"use client";

import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAddFlow } from "@/components/transaction/add-flow";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./brand";
import { DateRangePicker, type RangeInfo } from "./date-range-picker";
import { navFor } from "./nav";

export function TopBar({ range }: { range: RangeInfo }) {
  const pathname = usePathname();
  const item = navFor(pathname);
  const { openAdd } = useAddFlow();
  return (
    <header className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 bg-bg/85 px-4 py-3.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 lg:py-5">
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark size={30} className="lg:hidden" />
        <h1 className="truncate text-xl font-extrabold tracking-tight text-ink lg:text-[26px]">{item.title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {item.range ? <DateRangePicker info={range} /> : null}
        <Button variant="primary" size="md" className="hidden pl-4 lg:inline-flex" onClick={() => openAdd()}>
          <Plus className="size-[18px]" strokeWidth={2.6} />
          Add
        </Button>
      </div>
    </header>
  );
}
