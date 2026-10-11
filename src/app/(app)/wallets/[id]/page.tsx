import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount } from "@/components/amount";
import { AccountGlyph } from "@/components/overview/wallets-card";
import { AccountActivity } from "@/components/wallets/account-activity";
import { EditAccountButton, UpdateBalanceButton } from "@/components/wallets/controls";
import { Card, SectionTitle } from "@/components/ui/card";
import { Dot } from "@/components/ui/icon-bubble";
import { StackedBar } from "@/components/ui/progress";
import { ACCOUNT_TYPE_LABEL } from "@/lib/app-types";
import { snapshotAt } from "@/lib/finance/queries";
import { getState } from "@/server/session";
import { accountActivity } from "@/server/views/account-detail";
import { buildWallets } from "@/server/views/wallets";

export const metadata = { title: "Account" };

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getState();
  const account = s.data.accounts.find((a) => a.id === id);
  if (!account) notFound();

  const f = s.fmt;
  const base = s.data.settings.baseCurrency;
  const snap = snapshotAt(s.ledger, s.today);
  const bal = snap.accounts.find((a) => a.accountId === id);
  const wallets = buildWallets(s, s.today);
  const row = [...wallets.groups.flatMap((g) => g.rows), ...wallets.archived].find((w) => w.id === id);
  const { rows, total } = accountActivity(s, id);
  const foreign = account.currency !== base;
  const own = s.data.rates
    .filter((r) => r.accountId === id)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
    .filter((r, i, all) => all.findIndex((x) => x.from === r.from && x.to === r.to) === i);
  const market = foreign ? s.ledger.rates.toBase(account.currency, s.today) : null;
  const compTotal = (row?.composition ?? []).reduce((a, c) => a + c.value, 0);
  const hasHistory = s.data.transactions.some((t) => (t.accountId === id || t.toAccountId === id) && t.type !== "OPENING");

  return (
    <div className="flex flex-col gap-8 pt-1">
      <Link href="/wallets" className="-mb-3 inline-flex w-fit items-center gap-1 text-[14px] font-semibold text-ink-2 hover:text-ink">
        <ChevronLeft className="size-4" />
        Wallets
      </Link>

      <section className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <AccountGlyph type={account.type} color={account.color} size={60} />
          <div className="min-w-0">
            <h2 className="truncate text-[26px] font-extrabold tracking-tight text-ink">{account.name}</h2>
            <p className="text-[14px] text-ink-2">
              {account.nickname ? `${account.nickname} · ` : ""}
              {ACCOUNT_TYPE_LABEL[account.type]} · {account.currency}
              {account.archived ? " · Archived" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {account.archived ? null : <UpdateBalanceButton accountId={id} />}
          <EditAccountButton account={account} opening={wallets.openings[id]} hasHistory={hasHistory} />
        </div>
      </section>

      <section>
        <p className="text-[14px] font-semibold text-ink-2">Balance</p>
        <Amount value={bal?.balance ?? "0"} currency={account.currency} locale={f.locale} className="mt-1.5 text-[56px] font-extrabold leading-none tracking-tight text-ink" />
        {foreign && bal ? <p className="num mt-2 text-[15px] text-ink-3">≈ {f.inBase(bal.baseValue)} at {market ? f.rate(market) : "?"}</p> : null}
      </section>

      {row && row.composition.length > 0 && !row.negative ? (
        <section>
          <SectionTitle>Whose money is in it</SectionTitle>
          <Card className="p-5 sm:p-6">
            <StackedBar size="lg" segments={row.composition.map((c) => ({ value: c.value, color: c.color, label: c.name }))} />
            <ul className="mt-5 divide-y divide-line">
              {row.composition.map((c) => (
                <li key={c.sourceId} className="flex items-center gap-3 py-3">
                  <Dot color={c.color} size={10} />
                  <span className="flex-1 text-[15px] font-semibold text-ink">{c.name}</span>
                  <span className="num text-[13px] text-ink-3">{compTotal > 0 ? f.pct(c.value / compTotal, 0) : "—"}</span>
                  <span className="num w-32 text-right text-[15px] font-bold text-ink">{f.money(c.amount, account.currency)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {foreign ? (
        <section>
          <SectionTitle action={<Link href="/settings#rates" className="text-[13px] font-semibold text-accent hover:underline">Rates →</Link>}>Conversion rates</SectionTitle>
          <Card className="p-5">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[13px] text-ink-3">Market / default</dt>
                <dd className="num mt-0.5 text-[16px] font-bold text-ink">1 {account.currency} = {market ? f.rate(market) : "?"} {base}</dd>
              </div>
              {own.length > 0 ? (
                own.map((r) => (
                  <div key={r.id}>
                    <dt className="text-[13px] text-ink-3">This card</dt>
                    <dd className="num mt-0.5 text-[16px] font-bold text-ink">
                      1 {r.from} = {f.rate(r.rate)} {r.to}
                    </dd>
                  </div>
                ))
              ) : (
                <div>
                  <dt className="text-[13px] text-ink-3">This card</dt>
                  <dd className="mt-0.5 text-[14px] text-ink-2">No rate of its own. Add one via Edit if it converts differently.</dd>
                </div>
              )}
            </dl>
          </Card>
        </section>
      ) : null}

      <section>
        <SectionTitle>Activity{total > rows.length ? ` · latest ${rows.length} of ${total}` : ""}</SectionTitle>
        <Card className="overflow-hidden p-1 sm:p-2">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[14px] text-ink-3">Nothing has happened in this account yet.</p>
          ) : (
            <AccountActivity
              items={rows.map((r) => ({
                id: r.row.id,
                date: r.row.date,
                title: r.row.title,
                subtitle: r.row.subtitle,
                delta: f.money(r.delta, account.currency, { sign: "always" }),
                positive: r.delta.isPositive(),
                balanceAfter: f.money(r.balanceAfter, account.currency),
                tx: r.row.tx,
              }))}
            />
          )}
        </Card>
        <p className="mt-3 px-1 text-[12.5px] text-ink-3">Use this list to reconcile with your bank statement. If a balance is off, add a balance correction.</p>
      </section>
    </div>
  );
}
