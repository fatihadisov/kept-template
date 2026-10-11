import { type ComponentProps, createElement } from "react";
import {
  Apple, Baby, Banknote, Beef, Bike, Briefcase, Bus, Cake, Car, Carrot, CircleDollarSign, CircleEllipsis, Clapperboard, Coffee,
  Coins, CreditCard, Dumbbell, Droplets, Flame, Fuel, Gamepad2, Gem, Gift, GraduationCap, Heart, HeartPulse, House, Laptop,
  LifeBuoy, Lightbulb, Mountain, Music, PawPrint, Pill, PiggyBank, Pizza, Plane, Receipt, Repeat, Rocket, Scissors, ShoppingBag,
  ShoppingBasket, Shirt, Smartphone, Sprout, Star, Target, Tent, Ticket, Train, TreePine, Umbrella, Utensils, Wallet, Wifi, Wine,
  Wrench, Zap, type LucideIcon,
} from "lucide-react";

/**
 * Curated set of icons for categories and goals. The stored value is the key (kebab-case lucide name),
 * so the database never depends on a component library.
 */
export const ICONS: Record<string, LucideIcon> = {
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  coffee: Coffee,
  pizza: Pizza,
  wine: Wine,
  apple: Apple,
  carrot: Carrot,
  beef: Beef,
  cake: Cake,
  bus: Bus,
  train: Train,
  bike: Bike,
  car: Car,
  fuel: Fuel,
  wrench: Wrench,
  "shopping-bag": ShoppingBag,
  shirt: Shirt,
  gem: Gem,
  scissors: Scissors,
  clapperboard: Clapperboard,
  "gamepad-2": Gamepad2,
  music: Music,
  ticket: Ticket,
  plane: Plane,
  tent: Tent,
  umbrella: Umbrella,
  house: House,
  zap: Zap,
  droplets: Droplets,
  flame: Flame,
  wifi: Wifi,
  smartphone: Smartphone,
  lightbulb: Lightbulb,
  "heart-pulse": HeartPulse,
  pill: Pill,
  dumbbell: Dumbbell,
  repeat: Repeat,
  receipt: Receipt,
  gift: Gift,
  heart: Heart,
  baby: Baby,
  "paw-print": PawPrint,
  "graduation-cap": GraduationCap,
  briefcase: Briefcase,
  laptop: Laptop,
  "tree-pine": TreePine,
  sprout: Sprout,
  "circle-ellipsis": CircleEllipsis,
  target: Target,
  "life-buoy": LifeBuoy,
  "piggy-bank": PiggyBank,
  mountain: Mountain,
  rocket: Rocket,
  star: Star,
  wallet: Wallet,
  "credit-card": CreditCard,
  banknote: Banknote,
  coins: Coins,
  "circle-dollar-sign": CircleDollarSign,
};

export const ICON_KEYS = Object.keys(ICONS);

export function getIcon(key: string | null | undefined): LucideIcon {
  return (key && ICONS[key]) || CircleEllipsis;
}

/** One of the curated icons by its stored key; unknown keys fall back to a neutral glyph. */
export function AppIcon({ name, ...props }: { name: string | null | undefined } & Omit<ComponentProps<LucideIcon>, "ref">) {
  return createElement(getIcon(name), props);
}
