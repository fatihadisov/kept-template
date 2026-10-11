import { type StrategyId, STRATEGY_IDS, parseStrategyConfigs } from "@/lib/finance/savings";
import { type StrategyConfigPatch, settingsInput, strategyConfigInput } from "@/lib/validation";
import { audit } from "../audit";
import type { Db } from "../db";
import { fail, makeCtx, parseInput } from "./context";
import { syncEmergencyGoal } from "./goals";

export async function updateSettings(db: Db, raw: unknown): Promise<void> {
  const patch = parseInput(settingsInput, raw);
  const ctx = await makeCtx(db);

  if (patch.baseCurrency && patch.baseCurrency !== ctx.base) {
    if (ctx.data.transactions.length > 0 || ctx.data.accounts.length > 0) {
      fail("baseCurrency", "The reporting currency is locked once you have accounts or transactions, because every historical value is stored in it.");
    }
    await db.incomeSource.updateMany({ where: { isSystem: true }, data: { currency: patch.baseCurrency } });
  }

  await db.settings.update({
    where: { id: 1 },
    data: {
      ...(patch.baseCurrency !== undefined && { baseCurrency: patch.baseCurrency }),
      ...(patch.timezone !== undefined && { timezone: patch.timezone }),
      ...(patch.locale !== undefined && { locale: patch.locale }),
      ...(patch.reportingMode !== undefined && { reportingMode: patch.reportingMode }),
      ...(patch.cycleStartDay !== undefined && { cycleStartDay: patch.cycleStartDay }),
      ...(patch.weekStartsOn !== undefined && { weekStartsOn: patch.weekStartsOn }),
      ...(patch.deductUpcomingBills !== undefined && { deductUpcomingBills: patch.deductUpcomingBills }),
      ...(patch.upcomingBillsDays !== undefined && { upcomingBillsDays: patch.upcomingBillsDays }),
      ...(patch.forecastSpending !== undefined && { forecastSpending: patch.forecastSpending }),
    },
  });
  await audit(db, { entity: "Settings", entityId: "1", action: "UPDATE", summary: `Changed settings: ${Object.keys(patch).join(", ")}`, after: patch });
}

/**
 * Choose the active savings strategy and (optionally) tune its parameters. Strategies are only lenses on
 * the data: switching changes nothing in the ledger, and each strategy keeps its own parameters.
 */
export async function setStrategy(db: Db, strategy: StrategyId, rawConfig?: unknown): Promise<void> {
  if (!STRATEGY_IDS.includes(strategy)) fail("strategy", "Unknown strategy");
  const row = await db.settings.findUnique({ where: { id: 1 } });
  const current = parseStrategyConfigs(row?.strategyConfig);

  let next = current;
  if (rawConfig !== undefined) {
    const patch: StrategyConfigPatch = parseInput(strategyConfigInput, rawConfig);
    next = {
      PERCENT_TARGET: { ...current.PERCENT_TARGET, ...patch.PERCENT_TARGET },
      FIXED_MONTHLY: { ...current.FIXED_MONTHLY, ...patch.FIXED_MONTHLY },
      BUDGET_50_30_20: { ...current.BUDGET_50_30_20, ...patch.BUDGET_50_30_20 },
      EMERGENCY_FIRST: { ...current.EMERGENCY_FIRST, ...patch.EMERGENCY_FIRST },
    };
  }
  await db.settings.update({ where: { id: 1 }, data: { activeStrategy: strategy, strategyConfig: JSON.stringify(next) } });
  await audit(db, { entity: "Settings", entityId: "1", action: "UPDATE", summary: `Savings strategy: ${strategy}`, after: { strategy, config: next } });
  if (strategy === "EMERGENCY_FIRST") await syncEmergencyGoal(db);
}

export async function completeOnboarding(db: Db): Promise<void> {
  await db.settings.update({ where: { id: 1 }, data: { onboardedAt: new Date() } });
}

export async function resetOnboarding(db: Db): Promise<void> {
  await db.settings.update({ where: { id: 1 }, data: { onboardedAt: null } });
}
