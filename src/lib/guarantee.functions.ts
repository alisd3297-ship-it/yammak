import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CLAIM_REASONS: { key: string; label: string }[] = [
  { key: "late", label: "تأخير كبير بالتوصيل" },
  { key: "missing", label: "نواقص بالطلب" },
  { key: "damaged", label: "طلب تالف أو غير صالح" },
  { key: "wrong", label: "طلب غلط" },
  { key: "not_delivered", label: "ما وصل الطلب" },
  { key: "other", label: "سبب آخر" },
];

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  submitted: "قيد المراجعة",
  reviewing: "تحت الدراسة",
  approved: "تمت الموافقة",
  rejected: "مرفوض",
  compensated: "تم التعويض",
};

/** فتح مطالبة «ضمان لبابك» على طلب أو خدمة. */
export const submitGuaranteeClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      orderId?: string | null;
      serviceRequestId?: string | null;
      reason: string;
      description: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const description = (data.description ?? "").trim();
    if (description.length < 5) throw new Error("اكتب تفاصيل المشكلة");
    if (!data.orderId && !data.serviceRequestId) throw new Error("حدد الطلب المتعلق بالمشكلة");

    const { data: row, error } = await context.supabase
      .from("guarantee_claims")
      .insert({
        user_id: context.userId,
        order_id: data.orderId ?? null,
        service_request_id: data.serviceRequestId ?? null,
        reason: data.reason?.trim() || "other",
        description: description.slice(0, 1500),
      })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("تعذر إرسال المطالبة");

    try {
      const { data: staff } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin", "supervisor"]);
      for (const s of staff ?? []) {
        await context.supabase.rpc("push_notification", {
          _user_id: s.user_id,
          _title: "مطالبة ضمان لبابك",
          _body: description.slice(0, 120),
          _kind: "guarantee_claim",
          _key: `guarantee_claim:${row.id}`,
        });
      }
    } catch {
      /* الإشعار ليس شرطاً */
    }

    return { id: row.id };
  });

/** مطالبات الضمان الخاصة بالمستخدم. */
export const listMyClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("guarantee_claims")
      .select(
        "id, order_id, reason, description, status, compensation_amount, currency, resolution_note, created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    return (data ?? []).map((c) => ({
      id: c.id,
      orderId: c.order_id,
      reason: c.reason,
      description: c.description,
      status: c.status,
      compensation: Number(c.compensation_amount ?? 0),
      currency: c.currency,
      note: c.resolution_note,
      createdAt: c.created_at,
    }));
  });

/** لوحة الإدارة: كل المطالبات مع إمكانية البت فيها. */
export const listAllClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("غير مصرح");
    const { data } = await context.supabase
      .from("guarantee_claims")
      .select(
        "id, user_id, order_id, reason, description, status, compensation_amount, currency, resolution_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []).map((c) => ({
      id: c.id,
      userId: c.user_id,
      orderId: c.order_id,
      reason: c.reason,
      description: c.description,
      status: c.status,
      compensation: Number(c.compensation_amount ?? 0),
      currency: c.currency,
      note: c.resolution_note,
      createdAt: c.created_at,
    }));
  });

/** بتّ الإدارة بمطالبة الضمان مع تعويض اختياري للمحفظة. */
export const decideClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      claimId: string;
      status: "reviewing" | "approved" | "rejected" | "compensated";
      compensation?: number | null;
      note?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("غير مصرح");

    const compensation = Math.max(Number(data.compensation) || 0, 0);
    const { data: claim, error } = await context.supabase
      .from("guarantee_claims")
      .update({
        status: data.status,
        compensation_amount: compensation,
        resolution_note: data.note?.trim() ? data.note.trim().slice(0, 500) : null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.claimId)
      .select("id, user_id, currency")
      .maybeSingle();
    if (error || !claim) throw new Error("تعذر تحديث المطالبة");

    if (data.status === "compensated" && compensation > 0) {
      try {
        await context.supabase.rpc("wallet_admin_adjust", {
          _user_id: claim.user_id,
          _direction: "credit",
          _amount: compensation,
          _reason: "تعويض ضمان لبابك",
          _idempotency_key: `guarantee:${claim.id}`,
        });
      } catch {
        /* التعويض اليدوي ممكن من لوحة المحفظة */
      }
    }

    try {
      await context.supabase.rpc("push_notification", {
        _user_id: claim.user_id,
        _title: "تحديث على مطالبة الضمان",
        _body: `حالة المطالبة: ${CLAIM_STATUS_LABELS[data.status] ?? data.status}`,
        _kind: "guarantee_claim",
        _key: `guarantee_decision:${claim.id}:${data.status}`,
      });
    } catch {
      /* الإشعار ليس شرطاً */
    }

    return { ok: true };
  });
