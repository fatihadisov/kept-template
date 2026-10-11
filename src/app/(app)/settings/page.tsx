import { BudgetsSettings, CategoriesSettings } from "@/components/settings/catalog-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { GeneralSettings } from "@/components/settings/general-settings";
import { RatesSettings } from "@/components/settings/rates-settings";
import { RecurringSettings } from "@/components/settings/recurring-settings";
import { StrategySettings } from "@/components/settings/strategy-settings";
import { passwordProtected } from "@/server/auth";
import { usesPostgres } from "@/server/db";
import { getState } from "@/server/session";
import { buildSettings } from "@/server/views/settings";

export const metadata = { title: "Settings" };

const JUMP = [
  ["general", "General"],
  ["rates", "Exchange rates"],
  ["strategy", "Strategy"],
  ["categories", "Categories"],
  ["budgets", "Budgets"],
  ["recurring", "Recurring"],
  ["data", "Data"],
];

/** Computed once on the server so the server and the browser render the exact same list. */
function timeZones(current: string): string[] {
  let zones: string[];
  try {
    zones = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    zones = ["Asia/Baku", "UTC", "Europe/Istanbul", "Europe/London", "Europe/Moscow", "Asia/Dubai", "Asia/Tbilisi", "America/New_York"];
  }
  return [...new Set([current, "UTC", ...zones])];
}

export default async function SettingsPage() {
  const s = await getState();
  const m = await buildSettings(s, s.db);
  const d = s.data;

  return (
    <div className="flex flex-col gap-10 pt-1">
      <nav aria-label="Jump to" className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        {JUMP.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full bg-surface px-4 py-2 text-[13.5px] font-semibold text-ink-2 shadow-card ring-1 ring-line transition hover:text-ink">
            {label}
          </a>
        ))}
      </nav>
      <GeneralSettings settings={d.settings} locked={d.accounts.length > 0 || d.transactions.length > 0} zones={timeZones(d.settings.timezone)} />
      <RatesSettings pairs={m.globalPairs} cardRates={m.cardRates} />
      <StrategySettings active={d.settings.activeStrategy} configs={d.settings.strategyConfig} base={d.settings.baseCurrency} />
      <CategoriesSettings categories={d.categories} usage={m.categoryUsage} />
      <BudgetsSettings categories={d.categories} budgets={d.budgets} />
      <RecurringSettings items={d.recurring} rows={m.recurring} />
      <DataSettings mode={s.mode} hosted={usesPostgres()} passwordProtected={passwordProtected()} counts={m.counts} issues={m.issues} audit={m.audit} today={s.today} />
    </div>
  );
}
