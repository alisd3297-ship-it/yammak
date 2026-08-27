import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BackButton, BottomNav, PageShell, StatusDot  } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFeature } from "@/lib/features";
import { requestRefund } from "@/lib/wallet.functions";
import { listMyPayments } from "@/lib/payments.functions";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_SUBJECT_LABELS,
  formatMoney,
  paymentTone,
} from "@/lib/payments";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "عمليات الدفع | لبابك" },
      {
        name: "description",
        content: "تابع عمليات الدفع الإلكتروني والمبالغ المسترجعة لطلباتك ورحلاتك في لبابك.",
      },
      { property: "og:title", content: "عمليات الدفع | لبابك" },
      { property: "og:description", content: "سجل مدفوعاتك وحالتها لحظة بلحظة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

const TONE_MAP = { ok: "success", warn: "warning", bad: "danger" } as const;

function PaymentsPage() {
  const qc = useQueryClient();
  const fetchPayments = useServerFn(listMyPayments);
  const askRefund = useServerFn(requestRefund);
  const refundsOn = useFeature("refund_requests");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["my-payments"],
    queryFn: () => fetchPayments(),
    refetchInterval: 30_000,
  });

  const submitRefund = async (paymentId: string, amount: number) => {
    if (reason.trim().length < 5) {
      toast.error("اكتب سبب الاسترجاع (5 أحرف على الأقل)");
      return;
    }
    setBusy(true);
    try {
      await askRefund({ data: { paymentId, amount, reason: reason.trim() } });
      toast.success("تم إرسال طلب الاسترجاع للمراجعة");
      setOpenId(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["my-payments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  };


  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/orders" label="طلباتي" />
        <h1 className="text-2xl font-black">عمليات الدفع</h1>
        <p className="mt-1 text-sm opacity-90">كل مدفوعاتك وحالتها ومبالغ الاسترجاع</p>
        <Link
          to="/wallet"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 text-xs font-semibold backdrop-blur"
        >
          <Wallet className="size-4" /> محفظتي
        </Link>
      </header>

      <div className="space-y-3 px-4 py-5">
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && !data?.length && (
          <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
            ماكو عمليات دفع إلكتروني لحد الآن.
          </p>
        )}
        {data?.map((p) => (
          <article key={p.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold">
                <CreditCard className="size-4 text-primary" />
                {PAYMENT_SUBJECT_LABELS[p.subjectType]}
              </span>
              <span className="font-black">{formatMoney(p.amount, p.currency)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <StatusDot tone={TONE_MAP[paymentTone(p.status)]} />
                {PAYMENT_STATUS_LABELS[p.status]}
              </span>
              <span>{new Date(p.createdAt).toLocaleString("ar-IQ-u-nu-latn")}</span>
            </div>
            {p.refundedAmount > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                مسترجع: {formatMoney(p.refundedAmount, p.currency)}
              </p>
            )}
            {p.subjectType === "order" && (
              <Link
                to="/orders/$id"
                params={{ id: p.subjectId }}
                className="mt-3 inline-block text-xs font-semibold text-primary"
              >
                عرض الطلب
              </Link>
            )}

            {refundsOn && p.status === "succeeded" && p.refundedAmount < p.amount && (
              <div className="mt-3 border-t border-border pt-3">
                {openId === p.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="سبب طلب الاسترجاع"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => submitRefund(p.id, p.amount - p.refundedAmount)}
                      >
                        إرسال الطلب
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setOpenId(p.id);
                      setReason("");
                    }}
                    className="text-xs font-semibold text-primary"
                  >
                    طلب استرجاع
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <BottomNav />
    </PageShell>
  );
}
