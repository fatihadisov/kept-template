import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/** Two overlapping circles: two incomes, and the overlap is what you keep. */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="18" fill="var(--accent)" />
      <circle cx="24.5" cy="32" r="14.5" fill="var(--on-accent)" fillOpacity=".5" />
      <circle cx="39.5" cy="32" r="14.5" fill="var(--on-accent)" fillOpacity=".5" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandMark size={34} />
      <span className="text-[21px] font-extrabold tracking-tight text-ink">{APP_NAME}</span>
    </div>
  );
}
