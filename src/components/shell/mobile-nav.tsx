"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, FlaskConical, HandCoins, LogOut, PiggyBank, Plus, ReceiptText, LayoutDashboard, Settings, ChartNoAxesColumn, Wallet } from "lucide-react";
import { useState, useTransition } from "react";
import { setModeAction } from "@/app/actions";
import { useApp } from "@/components/app-provider";
import { ThemeToggle } from "@/components/theme";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAddFlow } from "@/components/transaction/add-flow";
import { SignOutButton } from "./sign-out";

const TABS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Activity", icon: ReceiptText },
  null, // the add button
  { href: "/savings", label: "Savings", icon: PiggyBank },
] as const;

const MORE = [
  { href: "/income", label: "Income", icon: HandCoins },
  { href: "/wallets", label: "Wallets & cards", icon: Wallet },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

/*
 * Why the bar used to feel slow: every tab is a page the server builds on demand, and Next.js does not
 * fetch such pages ahead of time unless asked. So a tap waited for a full round trip (with a cold server
 * function it took about a second) and nothing moved meanwhile. Now `prefetch` on the links fetches each page
 * as soon as the bar shows (kept for 5 minutes, and dropped whenever you save something), (app)/loading.tsx
 * gives an instant skeleton when it is not ready yet, and the tapped tab lights up at once.
 */

/** A whole cell of the bar is the tap target, with a pressed state so a tap is felt straight away. */
const TAB =
  "flex touch-manipulation select-none flex-col items-center justify-center gap-1 self-stretch rounded-2xl transition active:scale-90 active:bg-ink/[0.06]";

export function MobileNav({ mode }: { mode: "real" | "demo" }) {
  const pathname = usePathname();
  const { openAdd } = useAddFlow();
  const [more, setMore] = useState(false);
  const [pending, start] = useTransition();
  const { hosted, passwordProtected } = useApp();
  // The tab you tapped lights up at once, not when the next page has arrived from the server. It only counts
  // while the page is still the one you tapped from, so it can never stick.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const heading = tapped && tapped.from === pathname ? tapped.href : pathname;
  const goTo = (href: string) => {
    if (href !== pathname) setTapped({ href, from: pathname });
  };
  const moreActive = MORE.some((m) => heading.startsWith(m.href));

  return (
    <>
      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid h-[68px] max-w-lg grid-cols-5 items-center px-2">
          {TABS.map((tab) => {
            if (!tab) {
              return (
                <button
                  key="add"
                  type="button"
                  onClick={() => openAdd()}
                  aria-label="Add transaction"
                  className="mx-auto grid size-[54px] -translate-y-3 place-items-center rounded-full bg-accent text-on-accent shadow-[0_10px_22px_color-mix(in_srgb,var(--accent)_38%,transparent)] transition active:scale-95"
                >
                  <Plus className="size-7" strokeWidth={2.6} />
                </button>
              );
            }
            const active = tab.href === "/" ? heading === "/" : heading.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch
                aria-current={active ? "page" : undefined}
                onClick={() => goTo(tab.href)}
                className={TAB}
              >
                <Icon className={cn("size-[23px]", active ? "text-accent" : "text-ink-3")} strokeWidth={active ? 2.4 : 2} />
                <span className={cn("text-[10.5px] font-semibold", active ? "text-accent" : "text-ink-3")}>{tab.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMore(true)} className={TAB} aria-label="More">
            <Ellipsis className={cn("size-[23px]", moreActive ? "text-accent" : "text-ink-3")} strokeWidth={moreActive ? 2.4 : 2} />
            <span className={cn("text-[10.5px] font-semibold", moreActive ? "text-accent" : "text-ink-3")}>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={more} onOpenChange={setMore} title="More" size="sm">
        <div className="flex flex-col gap-1.5">
          {MORE.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.href}
                href={m.href}
                prefetch
                onClick={() => {
                  goTo(m.href);
                  setMore(false);
                }}
                className="flex h-14 items-center gap-4 rounded-2xl bg-surface px-4 text-[16px] font-semibold text-ink shadow-card active:scale-[0.99]"
              >
                <Icon className="size-5 text-accent" strokeWidth={2.1} />
                {m.label}
              </Link>
            );
          })}
          <div className="mt-3 flex items-center justify-between gap-2">
            {hosted ? (
              passwordProtected ? <SignOutButton className="min-w-0" /> : <span />
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => start(() => setModeAction(mode === "demo" ? "real" : "demo"))}
                className="flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-ink-2 hover:bg-ink/[0.05] disabled:opacity-50"
              >
                {mode === "demo" ? <LogOut className="size-4" /> : <FlaskConical className="size-4" />}
                {mode === "demo" ? "Exit demo" : "Explore with demo data"}
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </Sheet>
    </>
  );
}
