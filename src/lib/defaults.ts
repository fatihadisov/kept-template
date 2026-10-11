/** Seed values for a brand-new database. Everything here is editable in the app. */

export interface DefaultCategory {
  name: string;
  icon: string;
  color: string;
  bucket: "NEEDS" | "WANTS" | "OTHER";
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Food & Groceries", icon: "shopping-basket", color: "#5FA67A", bucket: "NEEDS" },
  { name: "Restaurants & Cafes", icon: "utensils", color: "#E0955A", bucket: "WANTS" },
  { name: "Transport", icon: "bus", color: "#6F86D6", bucket: "NEEDS" },
  { name: "Car & Maintenance", icon: "car", color: "#7C8794", bucket: "NEEDS" },
  { name: "Shopping", icon: "shopping-bag", color: "#C97BB2", bucket: "WANTS" },
  { name: "Entertainment", icon: "clapperboard", color: "#9A7BD6", bucket: "WANTS" },
  { name: "Travel", icon: "plane", color: "#4FA8C7", bucket: "WANTS" },
  { name: "Rent & Utilities", icon: "house", color: "#D4A24C", bucket: "NEEDS" },
  { name: "Health & Fitness", icon: "heart-pulse", color: "#E0705F", bucket: "NEEDS" },
  { name: "Subscriptions", icon: "repeat", color: "#5BB5A2", bucket: "WANTS" },
  { name: "Family & Gifts", icon: "gift", color: "#E58BA0", bucket: "WANTS" },
  { name: "Other", icon: "circle-ellipsis", color: "#A5A8AE", bucket: "OTHER" },
];

export const EXISTING_FUNDS_NAME = "Existing funds";
/** The neutral slot used for the built-in "Existing funds" source. */
export const EXISTING_FUNDS_COLOR = "0";

/**
 * Income sources store a colour SLOT ("a".."f"), not a hex. The slot maps to a theme-aware CSS variable
 * (--src-a ...) whose light and dark values were validated for colour-blind safety, so a source keeps
 * its identity in both themes. (A custom "#rrggbb" is still accepted.)
 */
export const SOURCE_SLOTS = ["a", "b", "c", "d", "e", "f"] as const;

/** Soft card colours by currency (any other currency rotates through ACCOUNT_COLORS). */
export const ACCOUNT_COLORS = ["#6F86D6", "#4E8D6E", "#E0955A", "#9A7BD6", "#4FA8C7", "#C97BB2", "#D4A24C"] as const;

export function accountColorFor(currency: string, index: number): string {
  if (currency === "USD") return "#6F86D6";
  if (currency === "AZN") return "#4E8D6E";
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];
}
