"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Segmented } from "@/components/ui/segmented";

export function CompareToggle({ value }: { value: "prev" | "year" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className={pending ? "opacity-60" : undefined}>
      <Segmented
        size="sm"
        value={value}
        label="Compare with"
        onChange={(v) => {
          const next = new URLSearchParams(params.toString());
          if (v === "prev") next.delete("cmp");
          else next.set("cmp", v);
          start(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false }));
        }}
        options={[
          { value: "prev", label: "Previous period" },
          { value: "year", label: "Same time last year" },
        ]}
      />
    </div>
  );
}
