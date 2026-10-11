import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { TxList } from "@/components/transaction/tx-row";
import { Card, SectionTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import type { TxRowModel } from "@/server/views/tx-rows";

export function RecentCard({ rows }: { rows: TxRowModel[] }) {
  return (
    <section>
      <SectionTitle action={<Link href="/transactions" className="text-[13px] font-semibold text-accent hover:underline">See all →</Link>}>Recent activity</SectionTitle>
      <Card className="p-2 sm:p-3">
        {rows.length === 0 ? (
          <Empty icon={<ReceiptText className="size-6" />} title="Nothing yet">
            Add your first expense or income with the + button.
          </Empty>
        ) : (
          <TxList rows={rows} showDate />
        )}
      </Card>
    </section>
  );
}
