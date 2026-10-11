import type { LedgerTx } from "./finance/types";
import type { TransactionInputRaw } from "./validation";

/**
 * Turns a stored transaction back into the shape the forms/services accept. Used to pre-fill the
 * edit form and to duplicate an entry.
 */
export function txToInput(tx: LedgerTx): TransactionInputRaw {
  const common = {
    date: tx.date,
    time: tx.time ?? null,
    description: tx.description ?? "",
    notes: tx.notes ?? null,
    tags: tx.tags ?? [],
  };
  const attribution =
    tx.allocationMode === "MANUAL" && tx.allocations.length > 0
      ? ({ mode: "MANUAL", allocations: tx.allocations.map((a) => ({ sourceId: a.sourceId, amount: a.amount })) } as const)
      : ({ mode: "AUTO" } as const);

  switch (tx.type) {
    case "INCOME":
      return {
        type: "INCOME",
        ...common,
        accountId: tx.accountId,
        amount: tx.amount,
        incomeSourceId: tx.incomeSourceId ?? "",
        expectedDate: tx.expectedDate ?? null,
      };
    case "EXPENSE":
      return {
        type: "EXPENSE",
        ...common,
        accountId: tx.accountId,
        amount: tx.amount,
        currency: tx.currency,
        accountAmount: tx.accountAmount ?? null,
        categoryId: tx.categoryId ?? null,
        attribution,
        recurringId: tx.recurringId ?? null,
        dueDate: tx.dueDate ?? null,
      };
    case "REFUND":
      return {
        type: "REFUND",
        ...common,
        accountId: tx.accountId,
        amount: tx.amount,
        currency: tx.currency,
        accountAmount: tx.accountAmount ?? null,
        refundOfId: tx.refundOfId ?? null,
        categoryId: tx.categoryId ?? null,
        attribution,
      };
    case "TRANSFER":
      return {
        type: "TRANSFER",
        ...common,
        accountId: tx.accountId,
        toAccountId: tx.toAccountId ?? "",
        amount: tx.amount,
        feeFixed: tx.feeFixed ?? null,
        feePercent: tx.feePercent ?? null,
        attribution,
      };
    case "EXCHANGE":
      return {
        type: "EXCHANGE",
        ...common,
        accountId: tx.accountId,
        toAccountId: tx.toAccountId ?? "",
        amount: tx.amount,
        toAmount: tx.toAmount ?? tx.amount,
        feeFixed: tx.feeFixed ?? null,
        feePercent: tx.feePercent ?? null,
        attribution,
      };
    case "OPENING":
      return {
        type: "OPENING",
        ...common,
        accountId: tx.accountId,
        amount: tx.amount,
        subtype: tx.subtype === "PREVIOUS_SAVINGS" ? "PREVIOUS_SAVINGS" : "EXISTING_FUNDS",
      };
    case "ADJUSTMENT":
      return {
        type: "ADJUSTMENT",
        ...common,
        accountId: tx.accountId,
        amount: tx.amount,
        subtype: tx.subtype ?? null,
        attribution,
      };
  }
}
