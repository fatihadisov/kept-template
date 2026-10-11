import { transactionsCsv } from "@/server/csv";
import { getState } from "@/server/session";
import { parseTxParams, runFilter } from "@/server/views/transactions";

export const dynamic = "force-dynamic";

/** CSV of exactly what the Transactions page shows for the same filters. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const s = await getState();
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const q = parseTxParams(params, s);
  const rows = runFilter(s, q);
  const body = transactionsCsv(s.ledger, s.data, rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${q.filter.from}_${q.filter.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
