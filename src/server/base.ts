import { DEFAULT_CATEGORIES, EXISTING_FUNDS_COLOR, EXISTING_FUNDS_NAME } from "@/lib/defaults";
import type { Tx } from "./db";

/**
 * Idempotent first-run setup: the settings row, the built-in "Existing funds" income source (home of
 * opening balances / previous savings) and the default expense categories. Default categories are only
 * created together with the settings row, so deleting them later never resurrects them.
 */
export async function ensureBaseData(db: Tx): Promise<void> {
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  if (!settings) await db.settings.create({ data: { id: 1 } });

  const base = settings?.baseCurrency ?? "AZN";
  const opening = await db.incomeSource.findFirst({ where: { isSystem: true, kind: "OPENING" } });
  if (!opening) {
    await db.incomeSource.create({
      data: {
        name: EXISTING_FUNDS_NAME,
        kind: "OPENING",
        isSystem: true,
        currency: base,
        scheduleType: "NONE",
        color: EXISTING_FUNDS_COLOR,
        sortOrder: -1,
      },
    });
  }

  if (!settings) {
    await db.category.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })),
    });
  }
}
