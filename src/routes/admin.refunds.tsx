import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminNav, PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/route-guards";
import { adminListRefundRequests, decideRefundRequest } from "@/lib/finance.functions";
import { formatIQD } from "@/lib/payments";
import { REFUND_REQUEST_STATUS_LABELS, refundTone } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/refunds")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "طلبات الاسترجاع | إدارة لبابك" },
      {
        name: "description",
        content: "مراجعة طلبات استرجاع الزبائن، الموافقة بالاسترجاع لمزود الدفع أو إلى محفظة الزبون.",
      },
      { property: "og:title", content: "طلبات الاسترجاع | إدارة لبابك" },
      { property: "og:description", content: "معالجة الاسترجاعات بشكل مركزي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRefundsPage,
});

const FILTERS = ["pending", "approved", "processed", "rejected", "all"] as const;

function AdminRefundsPage() {
  const qc = useQueryClient();
  const list = useServerFn(adminListRefundRequests);
  const decide = useServerFn(decideRefundRequest);
  const [filter, setFilter] = useState<string>("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-refunds", filter],
    queryFn: () => list({ data: { status: filter } }),
  });

  const act = async (
    id: string,
    approve: boolean,
    toWallet: boolean,
    label: string,
  ) => {
    setBusy(id);
    try {
      await decide({ data: { requestId: id, approve, toWallet } });
      toast.success(label);
      await qc.invalidateQueries({ queryKey: ["admin-refunds"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">طلبات الاسترجاع</h1>
        <p className="mt-1 text-sm opacity-90">مراجعة الطلبات وتنفيذها لمزود الدفع أو للمحفظة</p>
        <AdminNav />
      </header>

      <div className="space-y-4 px-4 py-5">
        <div className="flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold",
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {f === "all" ? "الكل" : REFUND_REQUEST_STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && !data?.length && (
          <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
            ماكو طلبات بهذا الفلتر.
          </p>
        )}

        <div className="space-y-3">
          {data?.map((r) => (
            <article key={r.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black">{r.requesterName}</span>
                <span className="font-black">{formatIQD(r.amount)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <StatusDot tone={refundTone(r.status)} />
                  {REFUND_REQUEST_STATUS_LABELS[r.status]}
                </span>
                <span>{new Date(r.createdAt).toLocaleString("ar-IQ-u-nu-latn")}</span>
              </div>
              <p className="mt-2 text-sm">{r.reason}</p>
              {r.note && <p className="mt-1 text-xs text-muted-foreground">ملاحظة: {r.note}</p>}

              {r.status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, true, false, "تم إرسال الاسترجاع لمزود الدفع")}
                  >
                    استرجاع لمزود الدفع
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, true, true, "تم الإيداع في محفظة الزبون")}
                  >
                    إيداع في المحفظة
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, false, false, "تم رفض الطلب")}
                  >
                    رفض
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
