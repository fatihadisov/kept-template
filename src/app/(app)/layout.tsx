import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { type AppContextValue, AppProvider } from "@/components/app-provider";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { TopBar } from "@/components/shell/top-bar";
import { DemoBanner } from "@/components/shell/demo-banner";
import { AddFlowProvider } from "@/components/transaction/add-flow";
import { ZERO } from "@/lib/finance/money";
import { describeRange, RANGE_PRESETS } from "@/lib/finance/periods";
import { passwordProtected } from "@/server/auth";
import { usesPostgres } from "@/server/db";
import { habitsOf } from "@/server/habits";
import { getCore } from "@/server/views/core";
import { getState } from "@/server/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await getState();
  if (!s.data.settings.onboarded) redirect("/welcome");

  const { habits, recentExpenses } = habitsOf(s.data);
  const core = getCore(s);
  const balances = Object.fromEntries(core.snap.accounts.map((a) => [a.accountId, a.balance.toFixed()]));
  const compositions = Object.fromEntries(
    s.data.accounts.map((a) => {
      const cells = [...(core.state.cells.get(a.id)?.entries() ?? [])].filter(([, v]) => v.gt(0));
      const total = cells.reduce((acc, [, v]) => acc.plus(v), ZERO);
      return [a.id, total.gt(0) ? cells.map(([sourceId, v]) => ({ sourceId, share: v.div(total).toNumber() })) : []];
    }),
  );
  const value: AppContextValue = {
    mode: s.mode,
    hosted: usesPostgres(),
    passwordProtected: passwordProtected(),
    today: s.today,
    settings: s.data.settings,
    accounts: s.data.accounts,
    sources: s.data.sources,
    categories: s.data.categories,
    rates: s.data.rates,
    recentExpenses,
    balances,
    compositions,
    habits,
  };
  const label = RANGE_PRESETS.find((p) => p.id === s.preset)?.label ?? "Custom";

  return (
    <AppProvider value={value}>
      <AddFlowProvider>
        <Sidebar mode={s.mode} />
        <div className="min-h-dvh lg:pl-[240px]">
          <div className="mx-auto max-w-[1180px] px-4 pb-36 sm:px-6 lg:px-10 lg:pb-20">
            <TopBar range={{ preset: s.preset, from: s.range.from, to: s.range.to, label, sub: describeRange(s.range, s.today) }} />
            {s.mode === "demo" ? <DemoBanner /> : null}
            <main className="animate-fade-in">{children}</main>
          </div>
        </div>
        <MobileNav mode={s.mode} />
      </AddFlowProvider>
    </AppProvider>
  );
}
