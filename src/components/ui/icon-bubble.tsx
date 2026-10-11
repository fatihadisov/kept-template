import { AppIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** A tinted circle holding an icon: the app's one recurring visual motif. */
export function IconBubble({
  icon,
  color = "#A5A8AE",
  size = 40,
  className,
  round = true,
}: {
  icon: string;
  color?: string | null;
  size?: number;
  className?: string;
  round?: boolean;
}) {
  const c = color ?? "#A5A8AE";
  return (
    <span
      className={cn("grid shrink-0 place-items-center", round ? "rounded-full" : "rounded-[14px]", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)`,
        color: c,
      }}
    >
      <AppIcon name={icon} style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={2.1} />
    </span>
  );
}

/** A small coloured dot (income identity, legend key). */
export function Dot({ color, className, size = 8 }: { color: string; className?: string; size?: number }) {
  return <span className={cn("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, backgroundColor: color }} />;
}
