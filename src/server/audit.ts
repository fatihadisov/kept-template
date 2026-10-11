import type { Tx } from "./db";

export interface AuditInput {
  entity: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "IMPORT";
  summary: string;
  before?: unknown;
  after?: unknown;
}

/** Append-only change history: what changed, when, and the full before/after snapshot. */
export async function audit(db: Tx, entry: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      summary: entry.summary.slice(0, 300),
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
    },
  });
}
