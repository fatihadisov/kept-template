import { Banknote, CreditCard, PiggyBank, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui/card";
import { StackedBar } from "@/components/ui/progress";
import type { Fmt } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import type { WalletRow } from "@/server/views/wallets";

const TYPE_ICON = { CARD: CreditCard, CASH: Banknote, SAVINGS: PiggyBank, OTHER: Wallet } as const;

export function AccountGlyph({ type, color, size = 42 }: { type: string; color: string | null; size?: number }) {
  const Icon = TYPE_ICON[type as keyof typeof TYPE_ICON] ?? Wallet;
  const c = color ?? "#6C6F75";
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={2.1} />
    </span>
  );
}

/** Where the money physically is: native amount first, the reporting-currency value beneath. */
export function WalletsCard({ wallets, fmt, base }: { wallets: WalletRow[]; fmt: Fmt; base: string }) {
  return (
    <section>
      <SectionTitle action={<Link href="/wallets" className="text-[13px] font-semibold text-accent hover:underline">All wallets →</Link>}>Wallets</SectionTitle>
      <Card className="p-2 sm:p-3">
        {wallets.length === 0 ? (
          <p className="px-4 py-8 text-center text-[14px] text-ink-2">No accounts yet.</p>
        ) : (
          <ul>
            {wallets.map((w) => {
              const foreign = w.currency !== base;
              return (
                <li key={w.id}>
                  <Link href="/wallets" className="flex items-center gap-3.5 rounded-2xl px-3 py-3 transition hover:bg-ink/[0.045]">
                    <AccountGlyph type={w.type} color={w.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{w.name}</p>
                      <p className="truncate text-[12.5px] text-ink-3">{w.nickname ?? (w.archived ? "Archived" : w.type.charAt(0) + w.type.slice(1).toLowerCase())}</p>
                      {w.composition.length > 0 && !w.negative ? <StackedBar segments={w.composition.map((c) => ({ value: c.value, color: c.color, label: `${c.name}` }))} size="sm" className="mt-2 max-w-[11rem]" /> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("num flex items-center justify-end gap-1.5 text-[15px] font-bold", w.negative ? "text-c-out" : "text-ink")}>
                        {w.negative ? <TriangleAlert className="size-3.5" aria-label="Below zero" /> : null}
                        {fmt.money(w.balance, w.currency)}
                      </p>
                      {foreign ? <p className="num text-[12.5px] text-ink-3">≈ {fmt.inBase(w.baseValue)}</p> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
