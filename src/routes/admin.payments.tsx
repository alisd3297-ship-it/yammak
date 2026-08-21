import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { adminListPayments, refundPayment } from "@/lib/payments.functions";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_SUBJECT_LABELS,
  formatIQD,
  paymentTone,
  type PaymentStatus,
} from "@/lib/payments";
import { cn } from "@/lib/utils";
import { useAccount } from "@/lib/auth";

import { requireStaff } from "@/lib/route-guards";

export const Route = createFileRoute("/admin/payments")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "إدارة المدفوعات | يمّك" },
      {
        name: "description",
        content: "لوحة الإدارة لمتابعة عمليات الدفع الإلكتروني وتنفيذ الاسترجاع في منصة يمّك.",
      },
      { property: "og:title", content: "إدارة المدفوعات | يمّك" },
      { property: "og:description", content: "مراقبة المدفوعات والاسترجاعات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPaymentsPage,
});

const TONE_MAP = { ok: "success", warn: "warning", bad: "danger" } as const;
const FILTERS: (PaymentStatus | "all")[] = [
  "all",
  "processing",
  "succeeded",
  "failed",
  "refunded",
];

function AdminPaymentsPage() {
  const { data: account, isLoading: accountLoading } = useAccount();
  const isStaff = (account?.roles ?? []).some((r) =>
    ["super_admin", "admin", "supervisor"].includes(r),
  );
  const qc = useQueryClient();
  const list = useServerFn(adminListPayments);
  const refund = useServerFn(refundPayment);
  const [filter, setFilter] = useState<PaymentStatus | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-payments", filter],
    enabled: isStaff,
    queryFn: () => list({ data: { status: filter } }),
    retry: 1,
  });

  const doRefund = async (paymentId: string) => {
    setBusy(paymentId);
    try {
      await refund({ data: { paymentId, reason: "استرجاع إداري" } });
      toast.success("تم تسجيل الاسترجاع");
      await qc.invalidateQueries({ queryKey: ["admin-payments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الاسترجاع");
    } finally {
      setBusy(null);
    }
  };

  if (!accountLoading && !isStaff)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">هذه الصفحة مخصصة لفريق إدارة يمّك.</p>
          <Link to="/" className="mt-3 inline-block font-semibold text-primary">
            رجوع للرئيسية
          </Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm opacity-90">
          <ArrowRight className="size-4" /> الرئيسية
        </Link>
        <h1 className="text-2xl font-black">إدارة المدفوعات</h1>
        <p className="mt-1 text-sm opacity-90">متابعة عمليات الدفع وتنفيذ الاسترجاع</p>
      </header>

      <div className="space-y-4 px-4 py-5">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {f === "all" ? "الكل" : PAYMENT_STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            <p>تعذر تحميل المدفوعات. تحقق من الاتصال ثم أعد المحاولة.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && !error && !data?.length && (
          <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
            ماكو عمليات دفع بهذا الفلتر.
          </p>
        )}

        {data?.map((p) => (
          <article key={p.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{PAYMENT_SUBJECT_LABELS[p.subjectType]}</span>
              <span className="font-black">{formatIQD(p.amount)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <StatusDot tone={TONE_MAP[paymentTone(p.status)]} />
                {PAYMENT_STATUS_LABELS[p.status]}
              </span>
              <span>{new Date(p.createdAt).toLocaleString("ar-IQ-u-nu-latn")}</span>
            </div>
            <p className="mt-2 break-all text-[11px] text-muted-foreground">
              مرجع المزود: {p.intentId ?? "—"}
            </p>
            {p.refundedAmount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                مسترجع: {formatIQD(p.refundedAmount)}
              </p>
            )}
            {p.status === "succeeded" && p.refundedAmount < p.amount && (
              <Button
                variant="outline"
                className="mt-3 h-10 w-full"
                disabled={busy === p.id}
                onClick={() => doRefund(p.id)}
              >
                استرجاع المبلغ كاملاً
              </Button>
            )}
          </article>
        ))}
      </div>
    </PageShell>
  );
}
