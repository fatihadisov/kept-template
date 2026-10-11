"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

/** Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('kept-theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

type Choice = "light" | "dark";

function resolved(): Choice {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/* The theme lives on <html data-theme> (set before first paint by THEME_SCRIPT), so React reads it
 * as an external store rather than copying it into state. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // follow the system while the user hasn't chosen explicitly
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    try {
      const stored = localStorage.getItem("kept-theme");
      if (stored && stored !== "system") return;
    } catch {
      /* storage unavailable */
    }
    document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    onChange();
  };
  mq.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onSystemChange);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Choice>(subscribe, resolved, () => "light");

  function toggle() {
    const next: Choice = resolved() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("kept-theme", next);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
    listeners.forEach((notify) => notify());
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} className={className} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </Button>
  );
}
