import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PartyType, PayoutMethod } from "@/lib/finance";

function friendly(message: string): string {
  if (message.includes("feature_disabled")) return "هذه الميزة غير مفعّلة حالياً";
  if (message.includes("invalid_status")) return "حالة التسوية لا تسمح بهذا الإجراء";
  if (message.includes("invalid_period")) return "الفترة المختارة غير صالحة";
  if (message.includes("invalid_party")) return "نوع الجهة غير صالح";
  if (message.includes("invalid_method")) return "طريقة الصرف غير صالحة";
  if (message.includes("wallet_owner_not_found")) return "لا توجد محفظة مرتبطة بهذه الجهة";
  if (message.includes("settlement_not_found")) return "التسوية غير موجودة";
  if (message.includes("already_decided")) return "تمت معالجة الطلب مسبقاً";
  if (message.includes("request_not_found")) return "الطلب غير موجود";
  if (message.includes("insufficient_balance")) return "رصيد المحفظة غير كافي";
  if (message.includes("forbidden") || message.includes("unauthorized")) return "غير مصرح بهذا الإجراء";
  return "تعذر تنفيذ العملية، حاول مرة ثانية";
}

/** ملخص أرباح المندوب لفترة محددة. */
export const getDriverEarnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { from: string; to: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("driver_earnings_summary", {
      _from: data.from,
      _to: data.to,
    });
    if (error) throw new Error(friendly(error.message));
    return res as {
      currency: string;
      orders: { count: number; delivery_fees: number };
      trips: { count: number; fares: number };
      total: number;
      paid_out: number;
      pending_settlement: number;
      daily: { day: string; amount: number }[];
    };
  });

/** ملخص مالية مقدم الخدمة لفترة محددة. */
export const getProviderFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string; from: string; to: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("provider_finance_summary", {
      _provider_id: data.providerId,
      _from: data.from,
      _to: data.to,
    });
    if (error) throw new Error(friendly(error.message));
    return res as {
      currency: string;
      commission_percent: number;
      orders_count: number;
      sales: number;
      commission: number;
      net: number;
      services_count: number;
      services_sales: number;
      paid_out: number;
    };
  });

/** تسويات الجهة الحالية (مندوب أو مقدم خدمة) — RLS تحدد ما يُرى. */
export const listMySettlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { partyType: PartyType; partyId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("settlements")
      .select(
        "id, party_type, party_id, period_start, period_end, gross, commission, delivery_fees, net, items_count, status, created_at",
      )
      .eq("party_type", data.partyType)
      .eq("party_id", data.partyId)
      .order("period_end", { ascending: false })
      .limit(30);
    return (rows ?? []).map(shapeSettlement);
  });

function shapeSettlement(s: {
  id: string;
  party_type: string;
  party_id: string;
  period_start: string;
  period_end: string;
  gross: number;
  commission: number;
  delivery_fees: number;
  net: number;
  items_count: number;
  status: string;
  created_at: string;
}) {
  return {
    id: s.id,
    partyType: s.party_type as PartyType,
    partyId: s.party_id,
    periodStart: s.period_start,
    periodEnd: s.period_end,
    gross: Number(s.gross),
    commission: Number(s.commission),
    deliveryFees: Number(s.delivery_fees),
    net: Number(s.net),
    itemsCount: s.items_count,
    status: s.status as "draft" | "approved" | "paid" | "cancelled",
    createdAt: s.created_at,
  };
}

/** الإدارة: كل التسويات مع أسماء الجهات. */
export const adminListSettlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string }) => data)
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("settlements")
      .select(
        "id, party_type, party_id, period_start, period_end, gross, commission, delivery_fees, net, items_count, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(friendly(error.message));

    const settlements = (rows ?? []).map(shapeSettlement);
    const providerIds = settlements.filter((s) => s.partyType === "provider").map((s) => s.partyId);
    const driverIds = settlements.filter((s) => s.partyType === "driver").map((s) => s.partyId);

    const [providersRes, profilesRes] = await Promise.all([
      providerIds.length
        ? context.supabase.from("providers").select("id, name").in("id", providerIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      driverIds.length
        ? context.supabase.from("profiles").select("id, full_name").in("id", driverIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ]);

    const names = new Map<string, string>();
    for (const p of providersRes.data ?? []) names.set(p.id, p.name);
    for (const p of profilesRes.data ?? []) names.set(p.id, p.full_name);

    return settlements.map((s) => ({ ...s, partyName: names.get(s.partyId) ?? "—" }));
  });

/** الإدارة: قوائم الجهات القابلة للتسوية. */
export const adminSettlementParties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [providersRes, driversRes] = await Promise.all([
      context.supabase
        .from("providers")
        .select("id, name")
        .eq("status", "approved")
        .order("name")
        .limit(200),
      context.supabase
        .from("worker_profiles")
        .select("user_id")
        .eq("is_approved", true)
        .limit(200),
    ]);

    const driverIds = (driversRes.data ?? []).map((d) => d.user_id);
    const profilesRes = driverIds.length
      ? await context.supabase.from("profiles").select("id, full_name").in("id", driverIds)
      : { data: [] as { id: string; full_name: string }[] };

    return {
      providers: (providersRes.data ?? []).map((p) => ({ id: p.id, name: p.name })),
      drivers: (profilesRes.data ?? []).map((p) => ({ id: p.id, name: p.full_name })),
    };
  });

/** الإدارة: توليد تسوية لجهة عن فترة. */
export const generateSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { partyType: PartyType; partyId: string; from: string; to: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("generate_settlement", {
      _party_type: data.partyType,
      _party_id: data.partyId,
      _from: data.from,
      _to: data.to,
    });
    if (error || !row) throw new Error(friendly(error?.message ?? ""));
    return shapeSettlement(row);
  });

/** الإدارة: اعتماد التسوية. */
export const approveSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { settlementId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("approve_settlement", {
      _settlement_id: data.settlementId,
    });
    if (error || !row) throw new Error(friendly(error?.message ?? ""));
    return shapeSettlement(row);
  });

/** الإدارة: صرف التسوية (محفظة/نقد/حوالة). */
export const paySettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { settlementId: string; method: PayoutMethod; reference?: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("pay_settlement", {
      _settlement_id: data.settlementId,
      _method: data.method,
      _reference: data.reference ?? "",
    });
    if (error || !row) throw new Error(friendly(error?.message ?? ""));
    return { id: row.id, amount: Number(row.amount), method: row.method as PayoutMethod };
  });

/** بنود تسوية محددة. */
export const listSettlementItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { settlementId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("settlement_items")
      .select("id, subject_type, subject_id, label, gross, commission, delivery_fee, net, occurred_at")
      .eq("settlement_id", data.settlementId)
      .order("occurred_at", { ascending: false })
      .limit(500);
    return (rows ?? []).map((i) => ({
      id: i.id,
      subjectType: i.subject_type,
      subjectId: i.subject_id,
      label: i.label,
      gross: Number(i.gross),
      commission: Number(i.commission),
      deliveryFee: Number(i.delivery_fee),
      net: Number(i.net),
      occurredAt: i.occurred_at,
    }));
  });

/** الإدارة: طلبات الاسترجاع. */
export const adminListRefundRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string }) => data)
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("refund_requests")
      .select(
        "id, payment_id, requested_by, amount, currency, reason, status, decision_note, created_at, decided_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(friendly(error.message));

    const userIds = [...new Set((rows ?? []).map((r) => r.requested_by))];
    const profilesRes = userIds.length
      ? await context.supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string }[] };
    const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));

    return (rows ?? []).map((r) => ({
      id: r.id,
      paymentId: r.payment_id,
      requesterName: names.get(r.requested_by) ?? "—",
      amount: Number(r.amount),
      currency: r.currency,
      reason: r.reason,
      status: r.status as "pending" | "approved" | "rejected" | "processed",
      note: r.decision_note,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
    }));
  });

/** الإدارة: قرار على طلب استرجاع. */
export const decideRefundRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { requestId: string; approve: boolean; note?: string; toWallet?: boolean }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("decide_refund_request", {
      _request_id: data.requestId,
      _approve: data.approve,
      _note: data.note ?? "",
      _to_wallet: Boolean(data.toWallet),
    });
    if (error || !row) throw new Error(friendly(error?.message ?? ""));
    return { id: row.id, status: row.status };
  });

/** الإدارة: تعديل محفظة مستخدم. */
export const adminAdjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { userId: string; direction: "credit" | "debit"; amount: number; reason: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const key = `admin:${data.userId}:${data.direction}:${data.amount}:${Date.now()}`;
    const { data: row, error } = await context.supabase.rpc("wallet_admin_adjust", {
      _user_id: data.userId,
      _direction: data.direction,
      _amount: data.amount,
      _reason: data.reason || "admin_adjust",
      _idempotency_key: key,
    });
    if (error || !row) throw new Error(friendly(error?.message ?? ""));
    return { id: row.id, balanceAfter: Number(row.balance_after) };
  });

/** الإدارة: تحديث مفتاح ميزة. */
export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { key: string; isEnabled?: boolean; rolloutPercent?: number; audience?: "all" | "staff" }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("feature_flags")
      .update({
        ...(data.isEnabled !== undefined ? { is_enabled: data.isEnabled } : {}),
        ...(data.rolloutPercent !== undefined ? { rollout_percent: data.rolloutPercent } : {}),
        ...(data.audience !== undefined ? { audience: data.audience } : {}),
      })
      .eq("key", data.key);
    if (error) throw new Error(friendly(error.message));
    return { ok: true };
  });
