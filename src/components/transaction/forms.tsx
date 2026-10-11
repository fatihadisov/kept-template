"use client";

import { ArrowRight, Info, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp, useFmt } from "@/components/app-provider";
import { IconBubble } from "@/components/ui/icon-bubble";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatRelativeDay } from "@/lib/finance/dates";
import { decimalsOf } from "@/lib/finance/currency";
import { receivedAt } from "@/lib/finance/conversion";
import { occurrencesBetween, incomeSchedule } from "@/lib/finance/recurrence";
import { addDays, formatDateShort } from "@/lib/finance/dates";
import { dec } from "@/lib/finance/money";
import { cn } from "@/lib/utils";
import { AccountSelect, AmountHero, AttributionField, CategoryPicker, DateField, More, SourceChips } from "./fields";
import { type FormState, chargeQuote, exchangeQuote, liveAccounts, parse, rateBookOf } from "./form-logic";

export interface BodyProps {
  state: FormState;
  patch: (p: Partial<FormState>) => void;
  errors: Record<string, string>;
  editing: boolean;
}

/** Notes and tags: kept out of the way until asked for. */
function NotesAndTags({ state, patch }: Pick<BodyProps, "state" | "patch">) {
  return (
    <>
      <div>
        <Label>Notes</Label>
        <Textarea value={state.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Anything worth remembering" maxLength={2000} />
      </div>
      <div>
        <Label>Tags</Label>
        <Input value={state.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="e.g. trip, gift (comma separated)" />
      </div>
    </>
  );
}

function RateOverride({ state, patch, currency }: Pick<BodyProps, "state" | "patch"> & { currency: string }) {
  const app = useApp();
  const base = app.settings.baseCurrency;
  if (currency === base) return null;
  const usual = rateBookOf(app).toBase(currency, state.date);
  return (
    <div>
      <Label>Valuation rate ({currency} → {base})</Label>
      <Input value={state.rate} onChange={(e) => patch({ rate: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder={usual ? usual.toFixed() : "Rate"} className="num" />
      <p className="mt-1.5 px-1 text-[12.5px] text-ink-3">Frozen on this entry only, so later changes to your default rate never rewrite it. Leave empty to use today&rsquo;s{usual ? ` (${usual.toFixed()})` : ""}.</p>
    </div>
  );
}

function Description({ state, patch, placeholder = "Note (optional)" }: Pick<BodyProps, "state" | "patch"> & { placeholder?: string }) {
  return <Input value={state.description} onChange={(e) => patch({ description: e.target.value })} placeholder={placeholder} maxLength={200} aria-label="Description" />;
}

/* ================================================================== */
/* Expense                                                              */
/* ================================================================== */

export function ExpenseBody({ state, patch, errors }: BodyProps) {
  const app = useApp();
  const fmt = useFmt();
  const account = app.accounts.find((a) => a.id === state.accountId);
  const base = app.settings.baseCurrency;
  const currencies = useMemo(() => {
    const set = new Set<string>([account?.currency ?? base, base]);
    for (const r of app.rates) {
      set.add(r.from);
      set.add(r.to);
    }
    return [...set];
  }, [app.rates, account?.currency, base]);

  const cross = account && account.currency !== state.currency;
  const quote = chargeQuote(app, state);
  const suggested = quote.charged ? quote.charged.toFixed(decimalsOf(account?.currency ?? base)) : "";

  const changeAccount = (id: string) => {
    const next = app.accounts.find((a) => a.id === id);
    // the price follows the card's currency unless a different one was chosen on purpose
    const followed = !account || state.currency === account.currency;
    patch({ accountId: id, ...(followed && next ? { currency: next.currency } : {}), chargedTouched: false, accountAmount: "" });
  };

  return (
    <div className="flex flex-col gap-6">
      <AmountHero
        value={state.amount}
        onChange={(amount) => patch({ amount })}
        currency={state.currency}
        currencies={currencies}
        onCurrencyChange={(currency) => patch({ currency, chargedTouched: false, accountAmount: "" })}
        error={errors.amount}
        autoFocus
        label="Amount spent"
      />

      {cross ? (
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-semibold text-ink">Charged to {account.name}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                {quote.rate ? `at ${fmt.rate(quote.rate)} ${state.currency} → ${account.currency}` : `no ${state.currency} → ${account.currency} rate yet — enter what the card was charged`}
              </p>
            </div>
            <Input
              value={state.chargedTouched ? state.accountAmount : suggested}
              onChange={(e) => patch({ accountAmount: e.target.value.replace(/[^\d.,\s]/g, ""), chargedTouched: true })}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Amount charged in ${account.currency}`}
              invalid={Boolean(errors.accountAmount)}
              className="num h-11 w-32 text-right text-[16px] font-bold"
            />
          </div>
          <FieldError>{errors.accountAmount}</FieldError>
        </div>
      ) : null}

      <CategoryPicker value={state.categoryId} onChange={(categoryId) => patch({ categoryId })} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AccountSelect label="Paid from" value={state.accountId} onChange={changeAccount} error={errors.accountId} />
        <DateField value={state.date} onChange={(date) => patch({ date })} />
      </div>

      <Description state={state} patch={patch} placeholder="Note (optional)" />
      <AttributionField state={state} patch={patch} error={errors.attribution} />

      <More>
        <NotesAndTags state={state} patch={patch} />
        <RateOverride state={state} patch={patch} currency={cross || state.currency !== base ? state.currency : (account?.currency ?? base)} />
      </More>
    </div>
  );
}

/* ================================================================== */
/* Income                                                               */
/* ================================================================== */

export function IncomeBody({ state, patch, errors, editing }: BodyProps) {
  const app = useApp();
  const source = app.sources.find((s) => s.id === state.incomeSourceId);
  const account = app.accounts.find((a) => a.id === state.accountId);
  const live = liveAccounts(app);

  const chooseSource = (id: string) => {
    const next = app.sources.find((s) => s.id === id);
    const dest = next?.destinationAccountId ? live.find((a) => a.id === next.destinationAccountId) : undefined;
    const sameCurrency = live.find((a) => a.currency === next?.currency);
    patch({ incomeSourceId: id, accountId: (dest ?? sameCurrency)?.id ?? state.accountId, expected: "auto" });
  };

  // scheduled pay dates around the chosen date: "which payment is this?"
  const options = useMemo(() => {
    if (!source) return [];
    const schedule = incomeSchedule({ scheduleType: source.scheduleType, scheduleDays: source.scheduleDays, scheduleAnchor: source.scheduleAnchor, scheduleEnd: source.scheduleEnd });
    return occurrencesBetween(schedule, addDays(state.date, -40), addDays(state.date, 14));
  }, [source, state.date]);

  return (
    <div className="flex flex-col gap-6">
      <AmountHero value={state.amount} onChange={(amount) => patch({ amount })} currency={account?.currency ?? app.settings.baseCurrency} error={errors.amount} autoFocus={!editing} label="Amount received" />
      <SourceChips value={state.incomeSourceId} onChange={chooseSource} error={errors.incomeSourceId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AccountSelect label="Received into" value={state.accountId} onChange={(accountId) => patch({ accountId })} error={errors.accountId} />
        <DateField value={state.date} onChange={(date) => patch({ date })} label="Received on" />
      </div>
      {options.length > 0 || state.expected !== "auto" ? (
        <div>
          <Label>Which payment is this?</Label>
          <Select value={state.expected} onChange={(e) => patch({ expected: e.target.value })} aria-label="Scheduled payment this settles">
            <option value="auto">Detect automatically</option>
            {options.map((d) => (
              <option key={d} value={d}>
                {source?.name} · due {formatDateShort(d, app.today)}
              </option>
            ))}
            {state.expected !== "auto" && state.expected !== "none" && !options.includes(state.expected) ? <option value={state.expected}>Due {formatDateShort(state.expected, app.today)}</option> : null}
            <option value="none">Not scheduled · a bonus or extra</option>
          </Select>
          <p className="mt-1.5 px-1 text-[12.5px] text-ink-3">Partial and late payments are fine: record each one against the pay date it belongs to.</p>
        </div>
      ) : null}
      <Description state={state} patch={patch} placeholder="Note (optional), e.g. October salary" />
      <More>
        <NotesAndTags state={state} patch={patch} />
        <RateOverride state={state} patch={patch} currency={account?.currency ?? app.settings.baseCurrency} />
      </More>
    </div>
  );
}

/* ================================================================== */
/* Exchange                                                             */
/* ================================================================== */

export function ExchangeBody({ state, patch, errors }: BodyProps) {
  const app = useApp();
  const fmt = useFmt();
  const from = app.accounts.find((a) => a.id === state.accountId);
  const to = app.accounts.find((a) => a.id === state.toAccountId);
  const quote = exchangeQuote(app, state);
  const [rateText, setRateText] = useState<string | null>(null);

  /** keep "you receive" in step with the usual rate until the person types their own figure */
  const withSuggestion = (next: FormState): Partial<FormState> => {
    if (next.toTouched) return {};
    const q = exchangeQuote(app, next);
    const target = app.accounts.find((a) => a.id === next.toAccountId);
    return { toAmount: q.suggestedReceived && target ? q.suggestedReceived.toFixed(decimalsOf(target.currency)) : "" };
  };

  const setAmount = (amount: string) => patch({ amount, ...withSuggestion({ ...state, amount }) });
  const setFrom = (accountId: string) => {
    const next = { ...state, accountId };
    const target = app.accounts.find((a) => a.id === next.toAccountId);
    const cur = app.accounts.find((a) => a.id === accountId);
    const toAccountId = target && cur && target.currency === cur.currency ? (liveAccounts(app).find((a) => a.currency !== cur.currency)?.id ?? "") : next.toAccountId;
    patch({ accountId, toAccountId, ...withSuggestion({ ...next, toAccountId }) });
  };
  const setTo = (toAccountId: string) => patch({ toAccountId, ...withSuggestion({ ...state, toAccountId }) });

  const dev = quote.deviation;
  const notable = dev && dev.abs().gt("0.02");
  // matches the server's RATE_DEVIATION warning: beyond this it is far more likely a typo than a good deal
  const far = dev && dev.abs().gt("0.2");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <AccountSelect label="From" value={state.accountId} onChange={setFrom} error={errors.accountId} />
        <ArrowRight className="mb-3.5 size-5 text-ink-3" aria-hidden />
        <AccountSelect label="To" value={state.toAccountId} onChange={setTo} error={errors.toAccountId} filter={(a) => a.id !== state.accountId && (!from || a.currency !== from.currency)} />
      </div>

      <div className="rounded-[22px] bg-surface p-5 ring-1 ring-line">
        <p className="mb-1 text-center text-[13px] font-semibold text-ink-2">You pay</p>
        <AmountHero value={state.amount} onChange={setAmount} currency={from?.currency ?? app.settings.baseCurrency} error={errors.amount} autoFocus size="md" label="Amount you pay" />
        <div className="my-4 border-t border-line" />
        <p className="mb-1 text-center text-[13px] font-semibold text-ink-2">You receive</p>
        <AmountHero
          value={state.toTouched ? state.toAmount : state.toAmount}
          onChange={(toAmount) => patch({ toAmount, toTouched: true })}
          currency={to?.currency ?? app.settings.baseCurrency}
          error={errors.toAmount}
          size="md"
          label="Amount you receive"
        />
      </div>

      <div className="rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-ink-3">Effective rate</p>
            <p className="num text-[15px] font-bold text-ink">
              {quote.effective && from && to ? `1 ${from.currency} = ${fmt.rate(quote.effective)} ${to.currency}` : "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="rate-edit" className="text-[12.5px] text-ink-3">
              Rate
            </label>
            <Input
              id="rate-edit"
              value={rateText ?? (quote.effective ? quote.effective.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : "")}
              onFocus={() => setRateText(quote.effective ? quote.effective.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : "")}
              onBlur={() => setRateText(null)}
              onChange={(e) => {
                const text = e.target.value.replace(/[^\d.,]/g, "");
                setRateText(text);
                const r = parse(text);
                const given = parse(state.amount);
                if (r && given && r.gt(0) && to) patch({ toAmount: receivedAt(given, r, to.currency).toFixed(decimalsOf(to.currency)), toTouched: true });
              }}
              inputMode="decimal"
              aria-label="Exchange rate"
              className="num h-9 w-28 text-right text-[14px] font-semibold"
            />
          </div>
        </div>
        {quote.usual && quote.effective && from && to ? (
          <p className={cn("mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug", notable ? "font-semibold text-ink" : "text-ink-3")}>
            {notable ? <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber" /> : <Info className="mt-px size-3.5 shrink-0" />}
            <span>
              Your usual rate is {fmt.rate(quote.usual)}.{" "}
              {far
                ? `This one is ${fmt.pct(dev.abs(), 0)} ${dev.isNegative() ? "lower" : "higher"}. Check the two amounts.`
                : dev && !dev.isZero()
                  ? `This one is ${fmt.pct(dev.abs(), 1)} ${dev.isNegative() ? "worse" : "better"}; ${dev.isNegative() ? "that's the bank's spread" : "nice"}, it isn't counted as a fee.`
                  : "Same as usual."}
              {quote.suggestedReceived && state.toTouched ? (
                <button type="button" className="ml-1.5 font-semibold text-accent hover:underline" onClick={() => patch({ toAmount: quote.suggestedReceived!.toFixed(decimalsOf(to.currency)), toTouched: false })}>
                  Use usual rate
                </button>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>

      <DateField value={state.date} onChange={(date) => patch({ date })} />
      <Description state={state} patch={patch} placeholder="Note (optional), e.g. ATM withdrawal" />

      <More label="Fees and who funded it">
        <div>
          <Label>Fee, charged separately on top ({from?.currency ?? "—"})</Label>
          <div className="grid grid-cols-2 gap-3">
            <Input value={state.feeFixed} onChange={(e) => patch({ feeFixed: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="Fixed, e.g. 0.50" aria-label="Fixed fee" className="num" />
            <Input value={state.feePercent} onChange={(e) => patch({ feePercent: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="Percent, e.g. 0.5" aria-label="Percentage fee" className="num" />
          </div>
          <p className="mt-1.5 px-1 text-[12.5px] text-ink-3">
            {quote.fee.gt(0) && from ? `${fmt.money(quote.fee, from.currency)} is charged in addition. ` : ""}A lower rate than usual is not a fee; only commissions go here.
          </p>
        </div>
        <AttributionField state={state} patch={patch} error={errors.attribution} />
        <NotesAndTags state={state} patch={patch} />
      </More>
    </div>
  );
}

/* ================================================================== */
/* Transfer                                                             */
/* ================================================================== */

export function TransferBody({ state, patch, errors }: BodyProps) {
  const app = useApp();
  const from = app.accounts.find((a) => a.id === state.accountId);
  const quote = exchangeQuote(app, state);
  const fmt = useFmt();
  return (
    <div className="flex flex-col gap-6">
      <AmountHero value={state.amount} onChange={(amount) => patch({ amount })} currency={from?.currency ?? app.settings.baseCurrency} error={errors.amount} autoFocus label="Amount to move" />
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <AccountSelect
          label="From"
          value={state.accountId}
          onChange={(accountId) => {
            const cur = app.accounts.find((a) => a.id === accountId);
            const target = app.accounts.find((a) => a.id === state.toAccountId);
            patch({ accountId, toAccountId: target && cur && target.currency === cur.currency && target.id !== accountId ? state.toAccountId : (liveAccounts(app).find((a) => a.id !== accountId && a.currency === cur?.currency)?.id ?? "") });
          }}
          error={errors.accountId}
        />
        <ArrowRight className="mb-3.5 size-5 text-ink-3" aria-hidden />
        <AccountSelect label="To" value={state.toAccountId} onChange={(toAccountId) => patch({ toAccountId })} error={errors.toAccountId} filter={(a) => a.id !== state.accountId && (!from || a.currency === from.currency)} />
      </div>
      <p className="-mt-3 px-1 text-[12.5px] text-ink-3">Moving money between your own accounts is not an expense and doesn&rsquo;t change what you have.</p>
      <DateField value={state.date} onChange={(date) => patch({ date })} />
      <Description state={state} patch={patch} />
      <More label="Fee and who funded it">
        <div>
          <Label>Fee, charged on top ({from?.currency})</Label>
          <div className="grid grid-cols-2 gap-3">
            <Input value={state.feeFixed} onChange={(e) => patch({ feeFixed: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="Fixed" aria-label="Fixed fee" className="num" />
            <Input value={state.feePercent} onChange={(e) => patch({ feePercent: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="Percent" aria-label="Percentage fee" className="num" />
          </div>
          {quote.fee.gt(0) && from ? <p className="mt-1.5 px-1 text-[12.5px] text-ink-3">{fmt.money(quote.fee, from.currency)} is charged in addition.</p> : null}
        </div>
        <AttributionField state={state} patch={patch} error={errors.attribution} />
      </More>
    </div>
  );
}

/* ================================================================== */
/* Refund                                                               */
/* ================================================================== */

export function RefundBody({ state, patch, errors, editing }: BodyProps) {
  const app = useApp();
  const fmt = useFmt();
  const [query, setQuery] = useState("");
  const chosen = app.recentExpenses.find((t) => t.id === state.refundOfId);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return app.recentExpenses
      .filter((t) => !q || `${t.description ?? ""} ${app.categories.find((c) => c.id === t.categoryId)?.name ?? ""} ${t.amount}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [app.recentExpenses, app.categories, query]);
  const account = app.accounts.find((a) => a.id === state.accountId);

  return (
    <div className="flex flex-col gap-6">
      {chosen ? (
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-ink-3">Refund for</p>
            <p className="truncate text-[15px] font-bold text-ink">{chosen.description || app.categories.find((c) => c.id === chosen.categoryId)?.name || "Purchase"}</p>
            <p className="num text-[13px] text-ink-2">
              {fmt.money(chosen.amount, chosen.currency)} · {formatRelativeDay(chosen.date, app.today)}
            </p>
          </div>
          {!editing ? (
            <button type="button" onClick={() => patch({ refundOfId: null })} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft">
              Change
            </button>
          ) : null}
        </div>
      ) : (
        <div>
          <Label>Which purchase is being refunded?</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your purchases" className="pl-11" autoFocus />
          </div>
          <ul className="mt-2 flex flex-col">
            {matches.map((t) => {
              const cat = app.categories.find((c) => c.id === t.categoryId);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => patch({ refundOfId: t.id, accountId: t.accountId, currency: t.currency, amount: t.amount, categoryId: t.categoryId ?? null, accountAmount: t.accountAmount ?? "", chargedTouched: Boolean(t.accountAmount), date: app.today })}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-ink/[0.05]"
                  >
                    <IconBubble icon={cat?.icon ?? "circle-ellipsis"} color={cat?.color} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-ink">{t.description || cat?.name || "Purchase"}</span>
                      <span className="block text-[12.5px] text-ink-3">{formatRelativeDay(t.date, app.today)}</span>
                    </span>
                    <span className="num text-[14.5px] font-bold text-ink">{fmt.money(t.amount, t.currency)}</span>
                  </button>
                </li>
              );
            })}
            {matches.length === 0 ? <li className="px-2 py-4 text-center text-[14px] text-ink-3">No matching purchases.</li> : null}
          </ul>
          <FieldError>{errors.refundOfId}</FieldError>
        </div>
      )}

      {chosen || editing ? (
        <>
          <AmountHero value={state.amount} onChange={(amount) => patch({ amount })} currency={state.currency} error={errors.amount} label="Amount refunded" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AccountSelect label="Refunded into" value={state.accountId} onChange={(accountId) => patch({ accountId })} error={errors.accountId} />
            <DateField value={state.date} onChange={(date) => patch({ date })} label="Received on" />
          </div>
          {account && account.currency !== state.currency ? (
            <div>
              <Label>Credited to {account.name} ({account.currency})</Label>
              <Input value={state.accountAmount} onChange={(e) => patch({ accountAmount: e.target.value.replace(/[^\d.,\s]/g, ""), chargedTouched: true })} inputMode="decimal" invalid={Boolean(errors.accountAmount)} className="num" />
              <FieldError>{errors.accountAmount}</FieldError>
            </div>
          ) : null}
          <Description state={state} patch={patch} />
          <p className="-mt-3 px-1 text-[12.5px] text-ink-3">A refund reverses the purchase. It is never counted as income, and it goes back to the income it was paid from.</p>
        </>
      ) : null}
      {!chosen && !editing ? null : <CategoryPickerIfNeeded state={state} patch={patch} />}
    </div>
  );
}

function CategoryPickerIfNeeded({ state, patch }: Pick<BodyProps, "state" | "patch">) {
  return state.refundOfId ? null : <CategoryPicker value={state.categoryId} onChange={(categoryId) => patch({ categoryId })} />;
}

/* ================================================================== */
/* Correction (balance adjustment) and opening balance                  */
/* ================================================================== */

export function AdjustmentBody({ state, patch, errors, editing }: BodyProps) {
  const app = useApp();
  const fmt = useFmt();
  const account = app.accounts.find((a) => a.id === state.accountId);
  const current = dec(app.balances[state.accountId] ?? "0");
  const actual = parse(state.actualBalance);
  const delta = actual ? actual.minus(current) : null;
  return (
    <div className="flex flex-col gap-6">
      <AccountSelect label="Account" value={state.accountId} onChange={(accountId) => patch({ accountId })} error={errors.accountId} showBalance={false} />
      {editing ? (
        <div>
          <Label>Difference applied ({account?.currency})</Label>
          <Input value={state.signedDelta} onChange={(e) => patch({ signedDelta: e.target.value.replace(/[^\d.,\s\-]/g, "") })} inputMode="decimal" invalid={Boolean(errors.amount)} className="num" />
          <FieldError>{errors.amount}</FieldError>
        </div>
      ) : (
        <>
          <div>
            <p className="mb-1 text-center text-[13px] font-semibold text-ink-2">What does it really hold right now?</p>
            <AmountHero value={state.actualBalance} onChange={(actualBalance) => patch({ actualBalance })} currency={account?.currency ?? app.settings.baseCurrency} error={errors.amount} autoFocus label="Actual balance" />
          </div>
          <div className="rounded-2xl bg-surface px-4 py-3.5 text-[14px] ring-1 ring-line">
            <div className="flex justify-between">
              <span className="text-ink-2">The app has</span>
              <span className="num font-semibold text-ink">{account ? fmt.money(current, account.currency) : "—"}</span>
            </div>
            <div className="mt-1.5 flex justify-between">
              <span className="text-ink-2">Difference</span>
              <span className={cn("num font-bold", delta && !delta.isZero() ? (delta.isNegative() ? "text-c-out" : "text-c-in") : "text-ink-3")}>{delta && account ? fmt.money(delta, account.currency, { sign: "exceptZero" }) : "—"}</span>
            </div>
          </div>
        </>
      )}
      <DateField value={state.date} onChange={(date) => patch({ date })} />
      <Description state={state} patch={patch} placeholder="Why? (optional), e.g. counted the wallet" />
      <p className="-mt-3 px-1 text-[12.5px] text-ink-3">A correction fixes the balance. It is not income and not an expense, and it is listed separately in your reports.</p>
    </div>
  );
}

export function OpeningBody({ state, patch, errors }: BodyProps) {
  const app = useApp();
  const account = app.accounts.find((a) => a.id === state.accountId);
  return (
    <div className="flex flex-col gap-6">
      <AmountHero value={state.amount} onChange={(amount) => patch({ amount })} currency={account?.currency ?? app.settings.baseCurrency} error={errors.amount} autoFocus label="Amount you already had" />
      <AccountSelect label="Account" value={state.accountId} onChange={(accountId) => patch({ accountId })} error={errors.accountId} showBalance={false} />
      <div>
        <Label>It is</Label>
        <Segmented
          full
          value={state.openingKind}
          onChange={(openingKind) => patch({ openingKind })}
          options={[
            { value: "EXISTING_FUNDS", label: "Existing funds" },
            { value: "PREVIOUS_SAVINGS", label: "Previous savings" },
          ]}
        />
      </div>
      <DateField value={state.date} onChange={(date) => patch({ date })} label="As of" />
      <p className="-mt-3 px-1 text-[12.5px] text-ink-3">Money you already owned. It counts toward your total but never as salary or income.</p>
    </div>
  );
}
