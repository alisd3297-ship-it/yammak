import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PaymentStatus, PaymentSubject } from "@/lib/payments";

type PaymentRow = {
  id: string;
  subject_type: PaymentSubject;
  subject_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  provider_intent_id: string | null;
  refunded_amount: number;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
  user_id?: string;
};

function friendly(message: string): string {
  if (message.includes("already_paid")) return "هذا الطلب مدفوع مسبقاً";
  if (message.includes("subject_not_payable")) return "لا يمكن الدفع لهذا الطلب بحالته الحالية";
  if (message.includes("subject_not_found")) return "الطلب غير موجود";
  if (message.includes("invalid_amount")) return "المبلغ غير صالح";
  if (message.includes("payments_not_configured")) return "الدفع الإلكتروني غير مفعّل حالياً";
  if (message.includes("payment_not_refundable")) return "لا يمكن استرجاع هذه العملية";
  if (message.includes("invalid_refund_amount")) return "مبلغ الاسترجاع غير صالح";
  if (message.includes("forbidden") || message.includes("unauthorized")) return "غير مصرح بهذا الإجراء";
  return "تعذر تنفيذ عملية الدفع، حاول مرة ثانية";
}

function shape(p: PaymentRow) {
  return {
    id: p.id,
    subjectType: p.subject_type,
    subjectId: p.subject_id,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    intentId: p.provider_intent_id,
    refundedAmount: Number(p.refunded_amount ?? 0),
    failureReason: p.failure_reason,
    createdAt: p.created_at,
    paidAt: p.paid_at,
  };
}

/**
 * إنشاء نية دفع: المبلغ يُشتق داخل قاعدة البيانات من الطلب/الرحلة/الخدمة،
 * ومفتاح idempotency ثابت لكل كيان يمنع تكرار العملية.
 */
export const startPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subjectType: PaymentSubject; subjectId: string }) => data)
  .handler(async ({ data, context }) => {
    const idempotencyKey = `${data.subjectType}:${data.subjectId}:${context.userId}`;

    const { data: created, error } = await context.supabase.rpc("create_payment_record", {
      _subject_type: data.subjectType,
      _subject_id: data.subjectId,
      _idempotency_key: idempotencyKey,
      _provider: "stripe",
    });
    if (error || !created) throw new Error(friendly(error?.message ?? ""));
    const payment = created as unknown as PaymentRow;

    const { paymentsConfigured, createProviderIntent } = await import("@/lib/payments.server");
    if (!paymentsConfigured()) {
      return {
        configured: false as const,
        clientSecret: null,
        publishableKey: null,
        payment: shape(payment),
      };
    }

    if (payment.provider_intent_id) {
      const { retrieveProviderIntent } = await import("@/lib/payments.server");
      const existing = await retrieveProviderIntent(payment.provider_intent_id);
      return {
        configured: true as const,
        clientSecret: existing.clientSecret,
        publishableKey: process.env["STRIPE_PUBLISHABLE_KEY"] ?? null,
        payment: shape(payment),
      };
    }

    const intent = await createProviderIntent({
      amount: Number(payment.amount),
      currency: payment.currency,
      idempotencyKey: payment.id,
      metadata: {
        payment_id: payment.id,
        subject_type: payment.subject_type,
        subject_id: payment.subject_id,
      },
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: attachError } = await supabaseAdmin.rpc("attach_payment_intent", {
      _payment_id: payment.id,
      _intent_id: intent.id,
      _client_secret: intent.clientSecret ?? "",
    });
    if (attachError) throw new Error(friendly(attachError.message));

    return {
      configured: true as const,
      clientSecret: intent.clientSecret,
      publishableKey: process.env["STRIPE_PUBLISHABLE_KEY"] ?? null,
      payment: { ...shape(payment), status: "processing" as PaymentStatus, intentId: intent.id },
    };
  });

/** تحقق server-side من حالة الدفع لدى المزود (لا تُقبل أي حالة من الواجهة). */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { paymentId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("payments")
      .select(
        "id, subject_type, subject_id, amount, currency, status, provider, provider_intent_id, refunded_amount, failure_reason, created_at, paid_at",
      )
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error || !row) throw new Error("عملية الدفع غير موجودة");
    const payment = row as unknown as PaymentRow;

    if (!payment.provider_intent_id) return shape(payment);

    const { paymentsConfigured, retrieveProviderIntent, mapProviderStatus, fromMinorUnits } =
      await import("@/lib/payments.server");
    if (!paymentsConfigured()) return shape(payment);

    const intent = await retrieveProviderIntent(payment.provider_intent_id);
    const mapped = mapProviderStatus(intent.status);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("settle_payment", {
      _provider: payment.provider,
      _intent_id: intent.id,
      _new_status: mapped,
      _event_id: `verify:${intent.id}:${intent.status}`,
      _event_type: `verify.${intent.status}`,
      _payload: { source: "server_verify", status: intent.status },
      _amount: mapped === "succeeded" ? fromMinorUnits(intent.amountMinor, intent.currency) : null,
    } as never);

    const { data: fresh } = await context.supabase
      .from("payments")
      .select(
        "id, subject_type, subject_id, amount, currency, status, provider, provider_intent_id, refunded_amount, failure_reason, created_at, paid_at",
      )
      .eq("id", payment.id)
      .maybeSingle();

    return shape((fresh ?? payment) as unknown as PaymentRow);
  });

/** عمليات الدفع الخاصة بالمستخدم الحالي (RLS تحصرها عليه). */
export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payments")
      .select(
        "id, subject_type, subject_id, amount, currency, status, provider, provider_intent_id, refunded_amount, failure_reason, created_at, paid_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("تعذر جلب عمليات الدفع");
    return (data ?? []).map((r) => shape(r as unknown as PaymentRow));
  });

/** حالة الدفع المرتبطة بكيان معيّن (يراها العميل والمزود/السائق المرتبط والإدارة). */
export const getPaymentForSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subjectType: PaymentSubject; subjectId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("payments")
      .select(
        "id, subject_type, subject_id, amount, currency, status, provider, provider_intent_id, refunded_amount, failure_reason, created_at, paid_at",
      )
      .eq("subject_type", data.subjectType)
      .eq("subject_id", data.subjectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row ? shape(row as unknown as PaymentRow) : null;
  });

/** لوحة الإدارة: كل عمليات الدفع (تتحقق من دور الموظف قبل القراءة الموسعة). */
export const adminListPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: PaymentStatus | "all" }) => data ?? { status: "all" })
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("غير مصرح بهذا الإجراء");

    let query = context.supabase
      .from("payments")
      .select(
        "id, user_id, subject_type, subject_id, amount, currency, status, provider, provider_intent_id, refunded_amount, failure_reason, created_at, paid_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error("تعذر جلب عمليات الدفع");
    return (rows ?? []).map((r) => ({
      ...shape(r as unknown as PaymentRow),
      userId: (r as unknown as PaymentRow).user_id ?? null,
    }));
  });

/** استرجاع مبلغ: صلاحية إدارية + تنفيذ لدى المزود + تسجيل مرتبط بالعملية. */
export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { paymentId: string; amount?: number | null; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("غير مصرح بهذا الإجراء");

    const { data: row } = await context.supabase
      .from("payments")
      .select("id, amount, currency, provider, provider_intent_id, status, refunded_amount")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!row) throw new Error("عملية الدفع غير موجودة");
    if (row.status !== "succeeded") throw new Error("لا يمكن استرجاع عملية غير مكتملة");

    const remaining = Number(row.amount) - Number(row.refunded_amount ?? 0);
    const amount = Math.min(Math.max(Number(data.amount ?? remaining), 1), remaining);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // 1) تسجيل طلب الاسترداد (idempotent داخل قاعدة البيانات)
    const { error: reqError } = await supabaseAdmin.rpc("request_payment_refund", {
      _payment_id: row.id,
      _amount: amount,
      ...(data.reason ? { _reason: data.reason } : {}),
    } as never);
    if (reqError) throw new Error(friendly(reqError.message));

    // 2) تنفيذه فعلياً لدى مزود الدفع وتسجيل النتيجة
    const { processPendingRefunds } = await import("@/lib/payments.server");
    await processPendingRefunds([row.id]);

    const { data: fresh } = await supabaseAdmin
      .from("payments")
      .select(
        "id, subject_type, subject_id, amount, currency, status, provider, provider_intent_id, refunded_amount, failure_reason, created_at, paid_at, refund_status, refund_error, refund_reference",
      )
      .eq("id", row.id)
      .maybeSingle();

    const result = fresh as unknown as (PaymentRow & {
      refund_status?: string;
      refund_error?: string | null;
      refund_reference?: string | null;
    }) | null;
    if (!result) throw new Error("تعذر قراءة نتيجة الاسترجاع");
    if (result.refund_status === "failed")
      throw new Error(`تعذر تنفيذ الاسترجاع لدى مزود الدفع: ${result.refund_error ?? "خطأ غير معروف"}`);
    if (result.refund_status === "manual_required")
      throw new Error("هذه العملية غير قابلة للاسترجاع آلياً (دفع نقدي أو مزود غير مفعّل) — سُجّلت للمعالجة اليدوية");

    return {
      ...shape(result),
      refundStatus: result.refund_status ?? "none",
      refundReference: result.refund_reference ?? null,
    };
  });
