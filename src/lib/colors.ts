/**
 * Resolve an income source's stored colour (a slot letter, "0" for Existing funds, or a custom hex)
 * to a CSS colour value. Slots become theme-aware variables so the identity survives dark mode.
 */
export function sourceColor(color: string | null | undefined, isSystem = false): string {
  if (isSystem) return "var(--src-0)";
  if (!color) return "var(--src-a)";
  if (color.startsWith("#")) return color;
  if (color === "0") return "var(--src-0)";
  return `var(--src-${color})`;
}
