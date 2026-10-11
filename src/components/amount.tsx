import { moneyParts } from "@/lib/finance/format";
import type { Numeric } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

/**
 * A money value with typographic hierarchy: the integer part carries the weight, the symbol and the
 * decimals recede. Proportional figures on purpose: big standalone numbers look loose in tabular
 * digits (use the `num` class only where numbers must line up in a column).
 * Pure markup, usable from server and client components.
 */
export function Amount({
  value,
  currency,
  locale = "en-US",
  className,
  decimals = "always",
  sign,
}: {
  value: Numeric;
  currency: string;
  locale?: string;
  className?: string;
  /** "always" shows cents; "auto" hides them for whole amounts; "never" rounds them away */
  decimals?: "always" | "auto" | "never";
  sign?: "always" | "exceptZero";
}) {
  const asString = typeof value === "string" ? value : typeof value === "number" ? String(value) : value.toFixed();
  const whole = /^-?\d+(\.0+)?$/.test(asString);
  const hide = decimals === "never" || (decimals === "auto" && whole);
  const p = moneyParts(asString, currency, { locale, sign, decimals: hide ? 0 : undefined });
  return (
    <span className={cn("inline-flex items-baseline whitespace-nowrap", className)}>
      {p.sign ? <span>{p.sign}</span> : null}
      {!p.symbolAfter ? <span className="mr-[0.08em] text-[0.62em] font-semibold text-ink-3">{p.symbol}</span> : null}
      <span>{p.integer}</span>
      {!hide && p.fraction ? (
        <span className="text-[0.56em] font-semibold text-ink-3">
          {p.decimal}
          {p.fraction}
        </span>
      ) : null}
      {p.symbolAfter ? <span className="ml-[0.18em] text-[0.62em] font-semibold text-ink-3">{p.symbol}</span> : null}
    </span>
  );
}
