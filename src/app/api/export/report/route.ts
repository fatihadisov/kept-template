import { periodsBetween } from "@/lib/finance/periods";
import { periodSeries } from "@/lib/finance/stats";
import { reportCsv } from "@/server/csv";
import { getState } from "@/server/session";

export const dynamic = "force-dynamic";

/** One row per month (or pay cycle): the numbers behind the charts. */
export async function GET() {
  const s = await getState();
  const from = s.firstDate ?? s.today;
  const points = periodSeries(s.ledger, periodsBetween(from, s.today, s.period), s.today);
  const body = reportCsv(points, s.data, s.data.settings.baseCurrency);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${s.today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
