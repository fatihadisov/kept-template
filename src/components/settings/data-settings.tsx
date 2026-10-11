"use client";

import { Database, Download, FileDown, FileUp, FlaskConical, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { resetDemoAction, restoreBackupAction, setModeAction } from "@/app/actions";
import { SignOutButton } from "@/components/shell/sign-out";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { DownloadLink } from "@/components/ui/download-link";
import type { AuditEntry } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { Row, Section } from "./parts";

const ACTION_STYLE: Record<string, string> = { CREATE: "bg-accent-soft text-c-in", UPDATE: "bg-ink/[0.07] text-ink-2", DELETE: "bg-danger-soft text-c-out", RESTORE: "bg-accent-soft text-c-in", IMPORT: "bg-amber-soft text-ink" };

export function DataSettings({
  mode,
  hosted,
  passwordProtected,
  counts,
  issues,
  audit,
  today,
}: {
  mode: "real" | "demo";
  /** running on the hosted (Postgres) setup */
  hosted: boolean;
  passwordProtected: boolean;
  counts: { accounts: number; transactions: number; goals: number };
  issues: { code: string; message: string }[];
  audit: AuditEntry[];
  today: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string; accounts: number; transactions: number } | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { app?: string; tables?: { accounts?: unknown[]; transactions?: unknown[] } };
      if (parsed.app !== "kept") throw new Error("not a backup");
      setPendingFile({ name: file.name, text, accounts: parsed.tables?.accounts?.length ?? 0, transactions: parsed.tables?.transactions?.length ?? 0 });
    } catch {
      toast.error("That doesn't look like a backup made by this app.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function restore() {
    if (!pendingFile) return;
    start(async () => {
      const res = await restoreBackupAction(pendingFile.text);
      setPendingFile(null);
      if (res.ok) toast.success(`Restored ${res.data.accounts} accounts and ${res.data.transactions} transactions`, { duration: 8000 });
      else toast.error(res.error);
    });
  }

  const stamp = today;
  return (
    <>
      <Section
        id="data"
        title="Your data"
        intro={
          hosted
            ? "Everything lives in your own private cloud database, behind your password. No card numbers or credentials are ever stored."
            : "Everything lives in one file on this computer. Nothing is sent anywhere, and no card numbers or credentials are ever stored."
        }
      >
        <Row label="Back up everything" hint="One JSON file with accounts, incomes, rates, every transaction and how it is linked, goals and settings.">
          <Button asChild variant="soft">
            <DownloadLink href="/api/export/backup" download={`kept-backup-${stamp}.json`}>
              <Download className="size-4" />
              Download backup
            </DownloadLink>
          </Button>
        </Row>
        <Row
          label="Restore from a backup"
          hint={hosted ? "Replaces all current data. Download a backup first if you might want today's data back." : "Replaces all current data. A copy of what you have now is kept next to the database first."}
        >
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose a backup file" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button variant="subtle" onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" />
            Choose a file…
          </Button>
        </Row>
        <Row label="Export transactions" hint="Every entry, ready for a spreadsheet. The Transactions page can export just what you filtered.">
          <Button asChild variant="subtle">
            <DownloadLink href="/api/export/transactions?from=2000-01-01&to=2100-12-31" download>
              <FileDown className="size-4" />
              CSV
            </DownloadLink>
          </Button>
        </Row>
        <Row label="Export monthly report" hint="One row per month: income, spending, fees, savings and totals.">
          <Button asChild variant="subtle">
            <DownloadLink href="/api/export/report" download>
              <FileDown className="size-4" />
              CSV
            </DownloadLink>
          </Button>
        </Row>
        <Row label="What's stored" hint={`${counts.accounts} accounts · ${counts.transactions} transactions · ${counts.goals} goals`}>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
            <Database className="size-4" />
            {hosted ? "cloud database" : mode === "demo" ? "demo database" : "data/finance.db"}
          </span>
        </Row>
      </Section>

      {passwordProtected ? (
        <Section id="security" title="Security" intro="This copy is protected by your password. You stay signed in on this device for up to 90 days of not opening it.">
          <Row label="Sign out of this device" hint="Locks it again. You'll need the password to open it.">
            <SignOutButton compact={false} className="w-auto" />
          </Row>
        </Section>
      ) : null}

      {hosted ? null : (
      <Section id="demo" title="Demo data" intro="A realistic sample (two salaries, cards, cash, conversions, goals) in its own separate database. Your real data is never touched.">
        {mode === "demo" ? (
          <>
            <Row label="You're viewing demo data" hint="Reset rebuilds the sample from scratch. Exit goes back to your own data.">
              <Button variant="subtle" disabled={pending} onClick={() => start(() => resetDemoAction())}>
                <RotateCcw className="size-4" />
                Reset
              </Button>
              <Button variant="primary" disabled={pending} onClick={() => start(() => setModeAction("real"))}>
                Back to my data
              </Button>
            </Row>
          </>
        ) : (
          <Row label="Explore with sample data" hint="Handy for trying things out without typing in your own numbers.">
            <Button variant="soft" disabled={pending} onClick={() => start(() => setModeAction("demo"))}>
              <FlaskConical className="size-4" />
              Open demo
            </Button>
          </Row>
        )}
      </Section>
      )}

      <Section id="integrity" title="Integrity" intro="The app re-derives every balance from your entries each time, so a stale balance can't exist. If something can't be read, it shows up here.">
        {issues.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-4 text-[14.5px] text-ink">
            <ShieldCheck className="size-5 text-c-in" />
            All {counts.transactions} entries check out.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {issues.slice(0, 20).map((i, n) => (
              <li key={n} className="flex items-start gap-3 px-4 py-3 text-[14px] text-ink">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="activity" title="Activity log" intro="Every change is recorded with what it was before and after. Nothing is edited in silence.">
        {audit.length === 0 ? (
          <p className="px-4 py-8 text-center text-[14px] text-ink-3">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <span className={cn("w-[74px] shrink-0 rounded-full px-2 py-0.5 text-center text-[11.5px] font-bold uppercase tracking-wide", ACTION_STYLE[a.action] ?? ACTION_STYLE.UPDATE)}>{a.action.toLowerCase()}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{a.summary}</span>
                <time className="shrink-0 text-[12px] text-ink-3" dateTime={a.at}>
                  {a.at.slice(0, 16).replace("T", " ")}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ConfirmDialog open={pendingFile !== null} onOpenChange={(o) => !o && setPendingFile(null)} title="Replace everything with this backup?" confirmLabel="Restore" danger pending={pending} onConfirm={restore}>
        <p>
          <span className="font-semibold text-ink">{pendingFile?.name}</span> has {pendingFile?.accounts} accounts and {pendingFile?.transactions} transactions. All data you have now will be replaced.
        </p>
        <p className="mt-2 text-[13px] text-ink-3">
          {hosted ? "Tip: download a backup first if you might want today's data back." : "A copy of the current database is saved first (in the data/backups folder), so this can be undone."}
        </p>
      </ConfirmDialog>
    </>
  );
}
