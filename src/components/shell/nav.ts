import { ChartNoAxesColumn, HandCoins, LayoutDashboard, PiggyBank, ReceiptText, Settings, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  title: string;
  icon: LucideIcon;
  /** show the global date-range picker on this page */
  range: boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", title: "Overview", icon: LayoutDashboard, range: true },
  { href: "/transactions", label: "Transactions", title: "Transactions", icon: ReceiptText, range: true },
  { href: "/income", label: "Income", title: "Income", icon: HandCoins, range: true },
  { href: "/wallets", label: "Wallets & cards", title: "Wallets & cards", icon: Wallet, range: false },
  { href: "/savings", label: "Savings & goals", title: "Savings & goals", icon: PiggyBank, range: true },
  { href: "/analytics", label: "Analytics", title: "Analytics", icon: ChartNoAxesColumn, range: true },
  { href: "/settings", label: "Settings", title: "Settings", icon: Settings, range: false },
];

export function navFor(pathname: string): NavItem {
  if (pathname === "/") return NAV[0];
  return NAV.find((n) => n.href !== "/" && pathname.startsWith(n.href)) ?? NAV[0];
}
