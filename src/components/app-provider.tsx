"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AccountView, CategoryView, RateRecord, SettingsView, SourceView } from "@/lib/app-types";
import { makeFmt, type Fmt } from "@/lib/fmt";
import type { LedgerTx } from "@/lib/finance/types";

/** What every client component may need to know about the app: serialisable, loaded once per request. */
export interface AppContextValue {
  mode: "real" | "demo";
  /** running on the hosted (Postgres) setup: no demo database, data lives in the cloud */
  hosted: boolean;
  /** a password guards the app, so "Sign out" makes sense */
  passwordProtected: boolean;
  today: string;
  settings: SettingsView;
  accounts: AccountView[];
  sources: SourceView[];
  categories: CategoryView[];
  rates: RateRecord[];
  /** recent expenses, for the "which purchase is this a refund of?" picker */
  recentExpenses: LedgerTx[];
  /** current balance of every account in its own currency (decimal strings) */
  balances: Record<string, string>;
  /** how each account's money splits across income sources today, as 0..1 shares (positive parts only) */
  compositions: Record<string, { sourceId: string; share: number }[]>;
  /** defaults learned from use, to make the next entry quicker */
  habits: {
    expenseAccountId: string | null;
    topCategoryIds: string[];
    incomeSourceId: string | null;
    lastCurrencyAccountIds: Record<string, string>;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export function useFmt(): Fmt {
  const { settings } = useApp();
  return useMemo(() => makeFmt(settings.locale, settings.baseCurrency), [settings.locale, settings.baseCurrency]);
}
