import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PaymentSubject } from "@/lib/payments";

function friendly(message: string): string {
  if (message.includes("feature_disabled")) return "هذه الميزة غير مفعّلة حالياً";
  if (message.includes("insufficient_balance")) return "رصيد المحفظة غير كافي";
  if (message.includes("wallet_locked")) return "المحفظة موقوفة، راجع الدعم";
  if (message.includes("already_paid")) return "هذا الطلب مدفوع مسبقاً";
  if (message.includes("subject_not_payable")) return "لا يمكن الدفع لهذا الطلب بحالته الحالية";
  if (message.includes("subject_not_found")) return "الطلب غير موجود";
  if (message.includes("invalid_amount")) return "المبلغ غير صالح";
  if (message.includes("reason_too_short")) return "اكتب سبباً واضحاً للاسترجاع";
  if (message.includes("payment_not_refundable")) return "لا يمكن استرجاع هذه العملية";
  if (message.includes("invalid_refund_amount")) return "مبلغ الاسترجاع غير صالح";
  if (message.includes("subject_not_invoiceable")) return "الفاتورة تصدر بعد إكمال الطلب";
  if (message.includes("forbidden") || message.includes("unauthorized"))
    return "غير مصرح بهذا الإجراء";
  return "تعذر تنفيذ العملية، حاول مرة ثانية";
}

/** رصيد المحفظة وآخر الحركات لصاحب الحساب. */
export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [walletRes, txRes, fxRes] = await Promise.all([
      context.supabase
        .from("wallets")
        .select("balance, currency, is_locked, updated_at")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("wallet_transactions")
        .select(
          "id, direction, amount, balance_after, reason, subject_type, subject_id, created_at",
        )
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase.from("app_settings").select("value").eq("key", "display_fx").maybeSingle(),
    ]);

    const fxValue = (fxRes.data?.value ?? {}) as { usd_to_iqd?: number };

    return {
      balance: Number(walletRes.data?.balance ?? 0),
      currency: walletRes.data?.currency ?? "IQD",
      isLocked: Boolean(walletRes.data?.is_locked),
      usdToIqd: Number(fxValue.usd_to_iqd ?? 0),
      transactions: (txRes.data ?? []).map((t) => ({
        id: t.id,
        direction: t.direction as "credit" | "debit",
        amount: Number(t.amount),
        balanceAfter: Number(t.balance_after),
        reason: t.reason,
        subjectType: t.subject_type,
        subjectId: t.subject_id,
        createdAt: t.created_at,
      })),
    };
  });

/** الدفع من المحفظة: المبلغ يُشتق داخل قاعدة البيانات. */
export const payFromWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subjectType: PaymentSubject; subjectId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("wallet_pay_subject", {
      _subject_type: data.subjectType,
      _subject_id: data.subjectId,
    });
    if (error) throw new Error(friendly(error.message));
    return res as { ok: boolean; payment_id: string; balance_after: number };
  });

/** طلب استرجاع من الزبون. */
export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { paymentId: string; amount: number; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("create_refund_request", {
      _payment_id: data.paymentId,
      _amount: data.amount,
      _reason: (data.reason ?? "").trim(),
    });
    if (error || !row) throw new Error(friendly(error?.message ?? ""));
    return { id: row.id, status: row.status, amount: Number(row.amount) };
  });

/** طلبات الاسترجاع الخاصة بالمستخدم. */
export const listMyRefundRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("refund_requests")
      .select("id, payment_id, amount, currency, reason, status, decision_note, created_at")
      .eq("requested_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((r) => ({
      id: r.id,
      paymentId: r.payment_id,
      amount: Number(r.amount),
      currency: r.currency,
      reason: r.reason,
      status: r.status as "pending" | "approved" | "rejected" | "processed",
      note: r.decision_note,
      createdAt: r.created_at,
    }));
  });

/** فواتير المستخدم. */
export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("invoices")
      .select(
        "id, number, subject_type, subject_id, currency, subtotal, delivery_fee, total, issued_at",
      )
      .eq("user_id", context.userId)
      .order("issued_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((i) => ({
      id: i.id,
      number: i.number,
      subjectType: i.subject_type,
      subjectId: i.subject_id,
      currency: i.currency,
      subtotal: Number(i.subtotal),
      deliveryFee: Number(i.delivery_fee),
      total: Number(i.total),
      issuedAt: i.issued_at,
    }));
  });

/** إصدار فاتورة لطلب مكتمل (idempotent في قاعدة البيانات). */
export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { subjectType: "order" | "trip" | "service_request"; subjectId: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("issue_invoice", {
      _subject_type: data.subjectType,
      _subject_id: data.subjectId,
    });
    if (error || !row) throw new Error(friendly(error?.message ?? ""));
    return { id: row.id, number: row.number, total: Number(row.total) };
  });
