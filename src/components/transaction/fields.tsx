"use client";

import { Check, ChevronDown, Plus, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useApp, useFmt } from "@/components/app-provider";
import { IconBubble, Dot } from "@/components/ui/icon-bubble";
import { Input, FieldError, Label, Select } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover";
import { Chip } from "@/components/ui/segmented";
import { sourceColor } from "@/lib/colors";
import { currencySymbol } from "@/lib/finance/currency";
import { addDays } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";
import { type FormState, activeSources, liveAccounts, parse, principalOf, splitRemainder, evenSplit } from "./form-logic";

/* ------------------------------------------------------------------ */
/* The big number                                                       */
/* ------------------------------------------------------------------ */

/** The one primary input: a large, centred amount with the currency beside it. */
export function AmountHero({
  value,
  onChange,
  currency,
  currencies,
  onCurrencyChange,
  error,
  autoFocus,
  label = "Amount",
  placeholder = "0",
  size = "xl",
}: {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  currencies?: string[];
  onCurrencyChange?: (currency: string) => void;
  error?: string;
  autoFocus?: boolean;
  label?: string;
  placeholder?: string;
  size?: "xl" | "md";
}) {
  const id = useId();
  const chip = (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-ink/[0.07] font-extrabold text-ink-2", size === "xl" ? "h-11 min-w-11 px-3 text-[20px]" : "h-9 min-w-9 px-2.5 text-[15px]")}>
      {currencySymbol(currency)}
    </span>
  );
  return (
    <div className="text-center">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center justify-center gap-3">
        {currencies && currencies.length > 1 && onCurrencyChange ? (
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="flex items-center gap-1 rounded-full transition hover:opacity-80" aria-label={`Currency: ${currency}. Change`}>
                {chip}
                <ChevronDown className="size-3.5 text-ink-3" />
              </button>
            </MenuTrigger>
            <MenuContent align="start" className="min-w-40">
              {currencies.map((c) => (
                <MenuItem key={c} onSelect={() => onCurrencyChange(c)}>
                  <span className="w-6 text-ink-3">{currencySymbol(c)}</span>
                  <span className="flex-1 font-semibold">{c}</span>
                  {c === currency ? <Check className="size-4 text-accent" /> : null}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : (
          chip
        )}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,\s\-−]/g, "").replace("−", "-"))}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          className={cn(
            "min-w-0 max-w-[330px] flex-1 bg-transparent text-center font-extrabold tracking-tight text-ink outline-none placeholder:text-ink/20",
            size === "xl" ? "text-[60px] leading-[1.1]" : "text-[34px] leading-tight",
          )}
        />
      </div>
      {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* date                                                                 */
/* ------------------------------------------------------------------ */

export function DateField({ value, onChange, label = "Date" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const { today } = useApp();
  const yesterday = addDays(today, -1);
  const custom = value !== today && value !== yesterday;
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={value === today} onClick={() => onChange(today)}>
          Today
        </Chip>
        <Chip active={value === yesterday} onClick={() => onChange(yesterday)}>
          Yesterday
        </Chip>
        <Input
          type="date"
          value={value}
          max={addDays(today, 366)}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Pick a date"
          className={cn("h-9 w-auto rounded-full px-3.5 text-[13.5px] font-semibold", custom && "bg-accent-soft text-accent ring-0")}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* accounts                                                             */
/* ------------------------------------------------------------------ */

export function AccountSelect({
  label,
  value,
  onChange,
  error,
  filter,
  showBalance = true,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  filter?: (a: ReturnType<typeof liveAccounts>[number]) => boolean;
  showBalance?: boolean;
}) {
  const app = useApp();
  const fmt = useFmt();
  const list = liveAccounts(app).filter((a) => (filter ? filter(a) : true));
  const current = app.accounts.find((a) => a.id === value);
  const balance = current ? app.balances[current.id] : undefined;
  // an archived account stays selectable while editing an old entry that used it
  const options = current && !list.some((a) => a.id === current.id) ? [current, ...list] : list;
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(error)} aria-label={label}>
        <option value="" disabled>
          Choose…
        </option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {/* the currency shows under the field; spell it out only when two accounts share a name */}
            {options.some((o) => o.id !== a.id && o.name === a.name) ? ` · ${a.currency}` : ""}
            {a.archived ? " (archived)" : ""}
          </option>
        ))}
      </Select>
      {error ? <FieldError>{error}</FieldError> : showBalance && current && balance !== undefined ? <p className="num mt-1.5 px-1 text-[12.5px] text-ink-3">Holds {fmt.money(balance, current.currency)}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* categories & incomes                                                 */
/* ------------------------------------------------------------------ */

export function CategoryPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const app = useApp();
  const live = app.categories.filter((c) => !c.archived);
  const top = app.habits.topCategoryIds.map((id) => live.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const quick = [...top, ...live.filter((c) => !top.some((t) => t.id === c.id))].slice(0, 6);
  const selected = live.find((c) => c.id === value);
  const shown = selected && !quick.some((c) => c.id === selected.id) ? [...quick.slice(0, 5), selected] : quick;
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Label>Category</Label>
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {shown.map((c) => (
          <Chip key={c.id} active={c.id === value} color={c.color} onClick={() => onChange(c.id === value ? null : c.id)}>
            <IconBubble icon={c.icon} color={c.color} size={22} />
            {c.name.split(" & ")[0].split(" ")[0]}
          </Chip>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold text-ink-2 ring-1 ring-line transition hover:text-ink">
              <Plus className="size-3.5" />
              All
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,340px)] p-2">
            <div className="scroll-thin grid max-h-[320px] grid-cols-1 gap-0.5 overflow-y-auto">
              {live.map((c) => (
                <PopoverClose asChild key={c.id}>
                  <button
                    type="button"
                    onClick={() => onChange(c.id)}
                    className={cn("flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-ink/[0.05]", c.id === value && "bg-accent-soft")}
                  >
                    <IconBubble icon={c.icon} color={c.color} size={32} />
                    <span className="flex-1 text-[14.5px] font-semibold text-ink">{c.name}</span>
                    {c.id === value ? <Check className="size-4 text-accent" /> : null}
                  </button>
                </PopoverClose>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function SourceChips({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const app = useApp();
  const list = app.sources.filter((s) => !s.isSystem && (s.isActive || s.id === value));
  return (
    <div>
      <Label>Which income</Label>
      <div className="flex flex-wrap gap-2">
        {list.map((s) => (
          <Chip key={s.id} active={s.id === value} onClick={() => onChange(s.id)}>
            <Dot color={sourceColor(s.color)} size={9} />
            {s.name}
          </Chip>
        ))}
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "Funded by": attribution                                             */
/* ------------------------------------------------------------------ */

export function AttributionField({ state, patch, error }: { state: FormState; patch: (p: Partial<FormState>) => void; error?: string }) {
  const app = useApp();
  const fmt = useFmt();
  const sources = activeSources(app);
  const all = app.sources.filter((s) => !s.isSystem || true);
  const [open, setOpen] = useState(state.attrMode !== "AUTO");
  const principal = principalOf(app, state);
  const left = splitRemainder(app, state);

  const comp = app.compositions[state.accountId] ?? [];
  const nameOf = (id: string) => app.sources.find((s) => s.id === id)?.name ?? "?";
  const autoText = comp.length > 0 ? comp.map((c) => `${nameOf(c.sourceId)} ${Math.round(c.share * 100)}%`).join(" · ") : "the account's income";

  const summary =
    state.attrMode === "AUTO"
      ? "Auto"
      : state.attrMode === "ONE"
        ? nameOf(state.attrSource)
        : Object.entries(state.split)
            .filter(([, v]) => (parse(v) ?? null)?.gt(0))
            .map(([id]) => nameOf(id))
            .join(" + ") || "Split";

  const setSplit = (id: string, text: string) => {
    const next = { ...state.split, [id]: text };
    // with two incomes, typing one fills the other with the rest
    const ids = sources.map((s) => s.id);
    if (ids.length === 2 && principal.amount) {
      const other = ids.find((x) => x !== id);
      const mine = parse(text);
      if (other && mine) next[other] = principal.amount.minus(mine).toFixed(2);
    }
    patch({ split: next });
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between rounded-2xl bg-surface px-4 py-3 text-left ring-1 ring-line transition hover:ring-line-strong" aria-expanded={open}>
        <span className="text-[13.5px] font-medium text-ink-2">Funded by</span>
        <span className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
          {summary}
          <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div className="mt-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="flex flex-wrap gap-2">
            <Chip active={state.attrMode === "AUTO"} onClick={() => patch({ attrMode: "AUTO" })}>
              Auto
            </Chip>
            {sources.map((s) => (
              <Chip key={s.id} active={state.attrMode === "ONE" && state.attrSource === s.id} onClick={() => patch({ attrMode: "ONE", attrSource: s.id })}>
                <Dot color={sourceColor(s.color)} size={9} />
                {s.name}
              </Chip>
            ))}
            <Chip
              active={state.attrMode === "SPLIT"}
              onClick={() => patch({ attrMode: "SPLIT", split: Object.keys(state.split).length ? state.split : principal.amount && sources.length ? evenSplit(principal.amount, sources.map((x) => x.id), principal.currency) : {} })}
            >
              <SlidersHorizontal className="size-3.5" />
              Split
            </Chip>
          </div>
          {state.attrMode === "AUTO" ? (
            <p className="mt-3 text-[13px] leading-snug text-ink-3">Follows the money in this account: {autoText}.</p>
          ) : null}
          {state.attrMode === "SPLIT" ? (
            <div className="mt-4 flex flex-col gap-3">
              {all
                .filter((s) => !s.isSystem || (parse(state.split[s.id] ?? "") ?? null))
                .map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold text-ink">
                      <Dot color={sourceColor(s.color, s.isSystem)} size={9} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <Input
                      value={state.split[s.id] ?? ""}
                      onChange={(e) => setSplit(s.id, e.target.value.replace(/[^\d.,\s]/g, ""))}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Amount from ${s.name}`}
                      className="num h-10 w-32 text-right text-[15px] font-semibold"
                    />
                  </div>
                ))}
              <p className={cn("num text-right text-[13px] font-semibold", left && !left.isZero() ? "text-c-out" : "text-ink-3")}>
                {left === null ? "Enter the amount first" : left.isZero() ? "Adds up exactly" : `${left.gt(0) ? "Still to assign" : "Over by"} ${fmt.money(left.abs(), principal.currency)}`}
              </p>
            </div>
          ) : null}
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
      {!open && error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* progressive disclosure                                               */
/* ------------------------------------------------------------------ */

export function More({ label = "More details", children, defaultOpen = false }: { label?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 px-1 py-1 text-[13.5px] font-semibold text-ink-2 transition hover:text-ink">
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        {label}
      </button>
      {open ? <div className="mt-3 flex flex-col gap-4">{children}</div> : null}
    </div>
  );
}
