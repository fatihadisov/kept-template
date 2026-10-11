import { sourceColor } from "@/lib/colors";
import type { Dec } from "@/lib/finance/money";
import type { AppState } from "../session";

export const toNum = (d: Dec): number => d.toNumber();

export interface SourceInfo {
  id: string;
  name: string;
  /** CSS colour (theme-aware variable) */
  color: string;
  isSystem: boolean;
}

export interface CategoryInfo {
  id: string | null;
  name: string;
  icon: string;
  color: string;
}

/** Cheap id -> display lookups for one request. */
export function lookups(s: AppState) {
  const sources = new Map(s.data.sources.map((x) => [x.id, x]));
  const categories = new Map(s.data.categories.map((x) => [x.id, x]));
  const accounts = new Map(s.data.accounts.map((x) => [x.id, x]));
  return {
    sources,
    categories,
    accounts,
    source(id: string): SourceInfo {
      const x = sources.get(id);
      return { id, name: x?.name ?? "Unknown", color: sourceColor(x?.color, x?.isSystem), isSystem: x?.isSystem ?? false };
    },
    category(id: string | null | undefined): CategoryInfo {
      const c = id ? categories.get(id) : undefined;
      return c ? { id: c.id, name: c.name, icon: c.icon, color: c.color } : { id: null, name: "Uncategorised", icon: "circle-ellipsis", color: "#A5A8AE" };
    },
    accountName(id: string | null | undefined): string {
      return (id && accounts.get(id)?.name) || "Unknown account";
    },
  };
}

export type Lookups = ReturnType<typeof lookups>;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
