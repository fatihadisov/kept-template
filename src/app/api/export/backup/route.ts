import { exportBackup } from "@/server/services/backup";
import { currentDb } from "@/server/session";

export const dynamic = "force-dynamic";

/** Complete JSON backup of everything: accounts, incomes, rates, transactions and their links, goals, settings. */
export async function GET() {
  const backup = await exportBackup(await currentDb());
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kept-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
