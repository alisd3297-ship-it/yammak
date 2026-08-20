import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Wallet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/app-shell";
import { getPaymentForSubject, startPayment, verifyPayment } from "@/lib/payments.functions";
import {
  PAYMENT_STATUS_LABELS,
  formatIQD,
  paymentTone,
  type PaymentSubject,
} from "@/lib/payments";

const TONE_MAP = { ok: "success", warn: "warning", bad: "danger" } as const;

export function PaymentPanel({
  subjectType,
  subjectId,
  amount,
  readOnly = false,
}: {
  subjectType: PaymentSubject;
  subjectId: string;
  amount: number;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const fetchPayment = useServerFn(getPaymentForSubject);
  const begin = useServerFn(startPayment);
  const verify = useServerFn(verifyPayment);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: payment } = useQuery({
    queryKey: ["payment", subjectType, subjectId],
    queryFn: () => fetchPayment({ data: { subjectType, subjectId } }),
    refetchInterval: 20_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["payment", subjectType, subjectId] });

  const onPayOnline = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await begin({ data: { subjectType, subjectId } });
      if (!result.configured) {
        setNotice(
          "الدفع الإلكتروني غير مفعّل بعد: تم تسجيل عملية الدفع بانتظار تفعيل مزود الدفع. الدفع نقداً متاح الآن.",
        );
      } else {
        toast.success("تم تجهيز عملية الدفع، أكمل البطاقة لإتمامها");
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر بدء الدفع");
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (!payment) return;
    setBusy(true);
    try {
      const fresh = await verify({ data: { paymentId: payment.id } });
      toast.message(`حالة الدفع: ${PAYMENT_STATUS_LABELS[fresh.status]}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التحقق من الدفع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-card p-4 shadow-soft">
      <h2 className="mb-3 flex items-center gap-2 font-bold">
        <CreditCard className="size-4 text-primary" /> الدفع
      </h2>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">المبلغ المستحق</span>
        <span className="font-bold">{formatIQD(amount)}</span>
      </div>

      {payment ? (
        <>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/40 p-3 text-sm">
            <span className="flex items-center gap-2">
              <StatusDot tone={TONE_MAP[paymentTone(payment.status)]} />
              {PAYMENT_STATUS_LABELS[payment.status]}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(payment.createdAt).toLocaleString("ar-IQ")}
            </span>
          </div>
          {payment.refundedAmount > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              مبلغ مسترجع: {formatIQD(payment.refundedAmount)}
            </p>
          )}
          {payment.failureReason && (
            <p className="mt-2 text-xs text-destructive">سبب الفشل: {payment.failureReason}</p>
          )}
          {!readOnly && payment.status !== "succeeded" && payment.status !== "refunded" && (
            <Button
              variant="outline"
              className="mt-3 h-11 w-full"
              disabled={busy}
              onClick={onVerify}
            >
              <ShieldCheck className="size-4" /> تحقق من حالة الدفع
            </Button>
          )}
        </>
      ) : (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
          <Wallet className="size-4" /> الدفع نقداً عند الاستلام
        </p>
      )}

      {!readOnly && payment?.status !== "succeeded" && (
        <Button className="mt-3 h-11 w-full" disabled={busy} onClick={onPayOnline}>
          {payment ? "متابعة الدفع الإلكتروني" : "الدفع إلكترونياً"}
        </Button>
      )}

      {notice && (
        <p className="mt-3 rounded-xl bg-warning/15 p-3 text-xs text-warning-foreground">{notice}</p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        حالة الدفع تُثبت من الخادم فقط عبر مزود الدفع، ولا يمكن تعليمها ناجحة من التطبيق.
      </p>
    </section>
  );
}
