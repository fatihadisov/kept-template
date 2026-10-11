"use client";

import { Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSettingsAction } from "@/app/actions";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { SettingsView } from "@/lib/app-types";
import { COMMON_CURRENCIES } from "@/lib/finance/currency";
import { formatMoney } from "@/lib/finance/format";
import { Row, Section } from "./parts";

const LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "az-AZ", label: "Azərbaycan" },
  { value: "tr-TR", label: "Türkçe" },
  { value: "ru-RU", label: "Русский" },
  { value: "de-DE", label: "Deutsch" },
];

export function GeneralSettings({ settings, locked, zones }: { settings: SettingsView; locked: boolean; zones: string[] }) {
  const [pending, start] = useTransition();
  const [s, setS] = useState(settings);

  function save(patch: Partial<SettingsView>, message = "Saved") {
    const prev = s;
    setS({ ...s, ...patch });
    start(async () => {
      const res = await updateSettingsAction(patch);
      if (res.ok) toast.success(message);
      else {
        setS(prev);
        toast.error(res.error);
      }
    });
  }

  return (
    <Section id="general" title="General">
      <Row label="Reporting currency" hint={locked ? "Locked once you have accounts: every historical value is stored in it." : "All totals are shown in this currency. Pick it before adding accounts."}>
        {locked ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-ink/[0.06] px-3.5 py-2 text-[14px] font-bold text-ink">
            <Lock className="size-3.5 text-ink-3" />
            {s.baseCurrency}
          </span>
        ) : (
          <Select value={s.baseCurrency} onChange={(e) => save({ baseCurrency: e.target.value })} aria-label="Reporting currency" className="h-11 w-40">
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </Row>
      <Row label="Time zone" hint="Decides what “today” means. Entries are stored as calendar dates, so they never shift.">
        <Select value={s.timezone} onChange={(e) => save({ timezone: e.target.value })} aria-label="Time zone" className="h-11 w-56" disabled={pending}>
          {[...new Set([s.timezone, ...zones])].map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </Row>
      <Row label="Number format" hint={`Looks like ${formatMoney("1234567.5", s.baseCurrency, { locale: s.locale })}`}>
        <Select value={s.locale} onChange={(e) => save({ locale: e.target.value as SettingsView["locale"] })} aria-label="Number format" className="h-11 w-48">
          {LOCALES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </Row>
      <Row label="Months are" hint={s.reportingMode === "CYCLE" ? "Reports follow your pay cycle instead of the calendar." : "Reports follow calendar months. Switch to follow the day your salary arrives."}>
        <Segmented
          value={s.reportingMode}
          onChange={(v) => save({ reportingMode: v })}
          size="sm"
          options={[
            { value: "MONTH", label: "Calendar months" },
            { value: "CYCLE", label: "Pay cycles" },
          ]}
        />
      </Row>
      {s.reportingMode === "CYCLE" ? (
        <Row label="Cycle starts on day" hint="The day of the month your main salary usually arrives.">
          <Input
            defaultValue={s.cycleStartDay}
            inputMode="numeric"
            aria-label="Cycle start day"
            className="num h-11 w-24 text-center"
            onBlur={(e) => {
              const n = Math.min(31, Math.max(1, Number(e.target.value) || 1));
              if (n !== s.cycleStartDay) save({ cycleStartDay: n });
            }}
          />
        </Row>
      ) : null}
      <Row label="Week starts on">
        <Segmented
          value={String(s.weekStartsOn) as "0" | "1"}
          onChange={(v) => save({ weekStartsOn: Number(v) })}
          size="sm"
          options={[
            { value: "1", label: "Monday" },
            { value: "0", label: "Sunday" },
          ]}
        />
      </Row>
      <Row label="Count upcoming bills as spent" hint={`Subtract unpaid bills due in the next ${s.upcomingBillsDays} days from “available to spend”. They are only deducted from balances when you mark them paid.`}>
        <Switch checked={s.deductUpcomingBills} onCheckedChange={(v) => save({ deductUpcomingBills: v })} aria-label="Count upcoming bills" />
      </Row>
      <Row label="Everyday spending, for forecasts" hint="What you expect to spend per month apart from recurring bills. Leave empty to use your recent average.">
        <Input
          defaultValue={s.forecastSpending ?? ""}
          inputMode="decimal"
          placeholder="Automatic"
          aria-label="Assumed monthly spending"
          className="num h-11 w-40 text-right"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if ((v || null) !== s.forecastSpending) save({ forecastSpending: v || null });
          }}
        />
      </Row>
    </Section>
  );
}
