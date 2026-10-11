"use client";

import { CalendarDays, Download, ListFilter, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { DownloadLink } from "@/components/ui/download-link";
import { Input, Label } from "@/components/ui/field";
import { Dot, IconBubble } from "@/components/ui/icon-bubble";
import { Chip, Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { sourceColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  EXPENSE: "Expenses",
  INCOME: "Income",
  REFUND: "Refunds",
  TRANSFER: "Transfers",
  EXCHANGE: "Exchanges",
  OPENING: "Opening balances",
  ADJUSTMENT: "Corrections",
};

const csv = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

/** Search, quick type filters and the full filter panel: all of it lives in the URL, so a filtered view can be bookmarked or drilled into. */
export function TransactionFilters({ total, dateLabel, explicitDates, count }: { total: number; dateLabel: string; explicitDates: boolean; count: number }) {
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(params.get("q") ?? "");
  const lastQ = useRef(params.get("q") ?? "");

  function update(patch: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      const value = Array.isArray(v) ? v.join(",") : v;
      if (!value) next.delete(k);
      else next.set(k, value);
    }
    next.delete("limit"); // a new filter starts from the top again
    next.delete("month");
    start(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false }));
  }

  // debounce the search box
  useEffect(() => {
    if (text === lastQ.current) return;
    const t = setTimeout(() => {
      lastQ.current = text;
      update({ q: text.trim() || null });
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const types = csv(params.get("type"));
  const accs = csv(params.get("acc"));
  const cats = csv(params.get("cat"));
  const srcs = csv(params.get("src"));
  const ccys = csv(params.get("ccy"));
  const view = params.get("view") === "calendar" ? "calendar" : "list";
  const min = params.get("min") ?? "";
  const max = params.get("max") ?? "";

  const toggle = (key: string, current: string[], value: string) => update({ [key]: current.includes(value) ? current.filter((x) => x !== value) : [...current, value] });
  const quick = (list: string[]) => update({ type: list.length ? list : null });
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const quickValue = types.length === 0 ? "all" : same(types, ["EXPENSE", "REFUND"]) ? "spend" : same(types, ["INCOME"]) ? "income" : same(types, ["TRANSFER", "EXCHANGE"]) ? "moves" : "custom";

  const currencies = [...new Set(app.accounts.map((a) => a.currency))];
  const filterCount = (types.length && quickValue === "custom" ? 1 : 0) + (accs.length ? 1 : 0) + (cats.length ? 1 : 0) + (srcs.length ? 1 : 0) + (ccys.length ? 1 : 0) + (min || max ? 1 : 0);
  const anyActive = filterCount > 0 || types.length > 0 || Boolean(params.get("q")) || explicitDates;
  const exportHref = `/api/export/transactions${params.toString() ? `?${params}` : ""}`;

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (explicitDates) chips.push({ key: "dates", label: dateLabel, clear: () => update({ from: null, to: null }) });
  for (const id of accs) chips.push({ key: `a-${id}`, label: app.accounts.find((a) => a.id === id)?.name ?? "Account", clear: () => toggle("acc", accs, id) });
  for (const id of cats) chips.push({ key: `c-${id}`, label: id === "__none__" ? "Uncategorised" : (app.categories.find((c) => c.id === id)?.name ?? "Category"), clear: () => toggle("cat", cats, id) });
  for (const id of srcs) chips.push({ key: `s-${id}`, label: app.sources.find((x) => x.id === id)?.name ?? "Income", clear: () => toggle("src", srcs, id) });
  for (const c of ccys) chips.push({ key: `u-${c}`, label: c, clear: () => toggle("ccy", ccys, c) });
  if (min || max) chips.push({ key: "amt", label: `${min || "0"} – ${max || "∞"}`, clear: () => update({ min: null, max: null }) });
  if (quickValue === "custom") for (const t of types) chips.push({ key: `t-${t}`, label: TYPE_LABEL[t] ?? t, clear: () => toggle("type", types, t) });
  if (params.get("tag")) chips.push({ key: "tag", label: `#${params.get("tag")}`, clear: () => update({ tag: null }) });

  return (
    <div className={cn("flex flex-col gap-3.5 transition-opacity", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search" className="h-11 pl-11 pr-10" aria-label="Search transactions" />
          {text ? (
            <button type="button" onClick={() => setText("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-ink/[0.06] hover:text-ink">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <Button variant="subtle" onClick={() => setOpen(true)} className="relative">
          <ListFilter className="size-4" />
          Filters
          {filterCount > 0 ? <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-on-accent">{filterCount}</span> : null}
        </Button>
        <Segmented
          value={view}
          onChange={(v) => update({ view: v === "calendar" ? "calendar" : null })}
          label="View"
          options={[
            { value: "list", label: "List" },
            { value: "calendar", label: <><CalendarDays className="size-4" />Calendar</> },
          ]}
        />
        <Button asChild variant="ghost" size="icon" title="Export what you see as CSV">
          <DownloadLink href={exportHref} download aria-label="Export as CSV">
            <Download className="size-[18px]" />
          </DownloadLink>
        </Button>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={quickValue === "all"} onClick={() => quick([])}>All</Chip>
        <Chip active={quickValue === "spend"} onClick={() => quick(["EXPENSE", "REFUND"])}>Spending</Chip>
        <Chip active={quickValue === "income"} onClick={() => quick(["INCOME"])}>Income</Chip>
        <Chip active={quickValue === "moves"} onClick={() => quick(["TRANSFER", "EXCHANGE"])}>Moves</Chip>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={c.clear} className="group inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft pl-3 pr-2 text-[13px] font-semibold text-accent transition hover:brightness-110" aria-label={`Remove filter ${c.label}`}>
              {c.label}
              <X className="size-3.5 opacity-70 group-hover:opacity-100" />
            </button>
          ))}
          <button type="button" onClick={() => { setText(""); lastQ.current = ""; start(() => router.replace(pathname, { scroll: false })); }} className="px-2 text-[13px] font-semibold text-ink-2 hover:text-ink">
            Clear all
          </button>
        </div>
      ) : null}

      <p className="px-1 text-[13px] text-ink-3" aria-live="polite">
        {anyActive ? `${count} of ${total} entries` : `${count} entries`}
      </p>

      <Sheet open={open} onOpenChange={setOpen} title="Filters" size="md" footer={<Button variant="primary" size="lg" className="w-full" onClick={() => setOpen(false)}>Show {count} {count === 1 ? "entry" : "entries"}</Button>}>
        <div className="flex flex-col gap-6">
          <div>
            <Label>Type</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TYPE_LABEL).map(([t, label]) => (
                <Chip key={t} active={types.includes(t)} onClick={() => toggle("type", types, t)}>{label}</Chip>
              ))}
            </div>
          </div>
          <div>
            <Label>Account</Label>
            <div className="flex flex-wrap gap-2">
              {app.accounts.map((a) => (
                <Chip key={a.id} active={accs.includes(a.id)} onClick={() => toggle("acc", accs, a.id)}>
                  {a.name}
                  <span className="text-ink-3">{a.currency}</span>
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              {app.categories.filter((c) => !c.archived || cats.includes(c.id)).map((c) => (
                <Chip key={c.id} active={cats.includes(c.id)} color={c.color} onClick={() => toggle("cat", cats, c.id)}>
                  <IconBubble icon={c.icon} color={c.color} size={20} />
                  {c.name}
                </Chip>
              ))}
              <Chip active={cats.includes("__none__")} onClick={() => toggle("cat", cats, "__none__")}>Uncategorised</Chip>
            </div>
          </div>
          <div>
            <Label>Income it came from</Label>
            <div className="flex flex-wrap gap-2">
              {app.sources.map((x) => (
                <Chip key={x.id} active={srcs.includes(x.id)} onClick={() => toggle("src", srcs, x.id)}>
                  <Dot color={sourceColor(x.color, x.isSystem)} size={9} />
                  {x.name}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <Label>Currency</Label>
            <div className="flex flex-wrap gap-2">
              {currencies.map((c) => (
                <Chip key={c} active={ccys.includes(c)} onClick={() => toggle("ccy", ccys, c)}>{c}</Chip>
              ))}
            </div>
          </div>
          <div>
            <Label>Amount {ccys.length === 1 ? `(${ccys[0]})` : `(${app.settings.baseCurrency} equivalent)`}</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input defaultValue={min} placeholder="Min" inputMode="decimal" aria-label="Minimum amount" className="num" onBlur={(e) => update({ min: e.target.value.replace(",", ".").trim() || null })} />
              <Input defaultValue={max} placeholder="Max" inputMode="decimal" aria-label="Maximum amount" className="num" onBlur={(e) => update({ max: e.target.value.replace(",", ".").trim() || null })} />
            </div>
          </div>
          <div>
            <Label>Dates</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" defaultValue={params.get("from") ?? ""} aria-label="From" onChange={(e) => e.target.value && update({ from: e.target.value, to: params.get("to") ?? e.target.value })} />
              <Input type="date" defaultValue={params.get("to") ?? ""} aria-label="To" onChange={(e) => e.target.value && update({ to: e.target.value, from: params.get("from") ?? e.target.value })} />
            </div>
            <p className="mt-1.5 px-1 text-[12.5px] text-ink-3">Leave empty to follow the date filter at the top of the page.</p>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
