"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, LogOut } from "lucide-react";
import { useTransition } from "react";
import { setModeAction } from "@/app/actions";
import { useApp } from "@/components/app-provider";
import { ThemeToggle } from "@/components/theme";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { NAV } from "./nav";
import { SignOutButton } from "./sign-out";

export function Sidebar({ mode }: { mode: "real" | "demo" }) {
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const { hosted, passwordProtected } = useApp();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col px-5 pb-6 pt-7 lg:flex">
      <Brand className="px-2" />
      <nav className="mt-9 flex flex-1 flex-col gap-1" aria-label="Main">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold transition-colors",
                active ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:bg-ink/[0.05] hover:text-ink",
              )}
            >
              <Icon className={cn("size-[19px] transition-colors", active ? "text-accent" : "text-ink-3 group-hover:text-ink-2")} strokeWidth={2.1} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between gap-2 px-1">
        {hosted ? (
          passwordProtected ? <SignOutButton className="min-w-0 flex-1" /> : <span className="flex-1" />
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => setModeAction(mode === "demo" ? "real" : "demo"))}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 text-left text-[13.5px] font-semibold text-ink-2 transition hover:bg-ink/[0.05] hover:text-ink disabled:opacity-50"
          >
            {mode === "demo" ? <LogOut className="size-4 shrink-0" /> : <FlaskConical className="size-4 shrink-0" />}
            <span className="truncate">{mode === "demo" ? "Exit demo" : "Try demo data"}</span>
          </button>
        )}
        {!hosted && passwordProtected ? <SignOutButton compact /> : null}
        <ThemeToggle />
      </div>
    </aside>
  );
}
