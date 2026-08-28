import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QuoteOffer = {
  id: string;
  requestId: string;
  providerId: string;
  providerName: string;
  amount: number;
  currency: string;
  etaMinutes: number | null;
  message: string | null;
  status: string;
  createdAt: string;
};

export type QuoteRequest = {
  id: string;
  title: string;
  description: string;
  address: string;
  budget: number | null;
  currency: string;
  status: string;
  categoryId: string | null;
  acceptedOfferId: string | null;
  createdAt: string;
  offers: QuoteOffer[];
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  open: "مفتوح للعروض",
  negotiating: "قيد التفاوض",
  accepted: "تم قبول عرض",
  closed: "مغلق",
  cancelled: "ملغى",
};

/** إنشاء «طلب عرض سعر» يستقبل عروضاً من مقدمي الخدمة. */
export const createQuoteRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      description: string;
      address: string;
      budget?: number | null;
      currency?: string;
      categoryId?: string | null;
      scheduledAt?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const title = (data.title ?? "").trim();
    const description = (data.description ?? "").trim();
    const address = (data.address ?? "").trim();
    if (title.length < 3) throw new Error("اكتب عنوان الطلب");
    if (description.length < 5) throw new Error("اكتب تفاصيل الخدمة المطلوبة");
    if (!address) throw new Error("حدد العنوان");

    const { data: row, error } = await context.supabase
      .from("quote_requests")
      .insert({
        customer_id: context.userId,
        title: title.slice(0, 160),
        description: description.slice(0, 2000),
        address_text: address.slice(0, 300),
        budget: data.budget != null && data.budget > 0 ? data.budget : null,
        currency: data.currency === "USD" ? "USD" : "IQD",
        category_id: data.categoryId ?? null,
        scheduled_at: data.scheduledAt ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("تعذر إرسال طلب العرض");
    return { id: row.id };
  });

/** طلبات عروض السعر الخاصة بالزبون مع العروض الواصلة. */
export const listMyQuoteRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuoteRequest[]> => {
    const { data: requests } = await context.supabase
      .from("quote_requests")
      .select(
        "id, title, description, address_text, budget, currency, status, category_id, accepted_offer_id, created_at",
      )
      .eq("customer_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);

    const ids = (requests ?? []).map((r) => r.id);
    const { data: offers } = ids.length
      ? await context.supabase
          .from("quote_offers")
          .select(
            "id, request_id, provider_id, amount, currency, eta_minutes, message, status, created_at, providers(name)",
          )
          .in("request_id", ids)
          .order("amount")
      : { data: [] };

    return (requests ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      address: r.address_text,
      budget: r.budget == null ? null : Number(r.budget),
      currency: r.currency,
      status: r.status,
      categoryId: r.category_id,
      acceptedOfferId: r.accepted_offer_id,
      createdAt: r.created_at,
      offers: (offers ?? [])
        .filter((o) => o.request_id === r.id)
        .map((o) => ({
          id: o.id,
          requestId: o.request_id,
          providerId: o.provider_id,
          providerName:
            (o as unknown as { providers?: { name?: string } }).providers?.name ?? "مقدم خدمة",
          amount: Number(o.amount),
          currency: o.currency,
          etaMinutes: o.eta_minutes,
          message: o.message,
          status: o.status,
          createdAt: o.created_at,
        })),
    }));
  });

/** الطلبات المفتوحة التي يستطيع مقدم الخدمة تقديم عرض عليها. */
export const listOpenQuoteRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: provider } = await context.supabase
      .from("providers")
      .select("id, name")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!provider) return { providerId: null as string | null, requests: [] };

    const { data: requests } = await context.supabase
      .from("quote_requests")
      .select("id, title, description, address_text, budget, currency, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(30);

    const { data: mine } = await context.supabase
      .from("quote_offers")
      .select("id, request_id, amount, status")
      .eq("provider_id", provider.id);

    return {
      providerId: provider.id,
      requests: (requests ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        address: r.address_text,
        budget: r.budget == null ? null : Number(r.budget),
        currency: r.currency,
        createdAt: r.created_at,
        myOffer: (mine ?? []).find((o) => o.request_id === r.id)
          ? {
              amount: Number((mine ?? []).find((o) => o.request_id === r.id)!.amount),
              status: (mine ?? []).find((o) => o.request_id === r.id)!.status,
            }
          : null,
      })),
    };
  });

/** تقديم أو تعديل عرض سعر من مقدم الخدمة (تفاوض). */
export const submitQuoteOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      requestId: string;
      amount: number;
      etaMinutes?: number | null;
      message?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("اكتب مبلغ العرض");

    const { data: provider } = await context.supabase
      .from("providers")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!provider) throw new Error("هذا الحساب مو مقدم خدمة");

    const { data: existing } = await context.supabase
      .from("quote_offers")
      .select("id")
      .eq("request_id", data.requestId)
      .eq("provider_id", provider.id)
      .maybeSingle();

    const payload = {
      amount,
      eta_minutes: data.etaMinutes ?? null,
      message: data.message?.trim() ? data.message.trim().slice(0, 500) : null,
      status: "sent",
    };

    if (existing) {
      const { error } = await context.supabase
        .from("quote_offers")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error("تعذر تحديث العرض");
      return { id: existing.id };
    }

    const { data: row, error } = await context.supabase
      .from("quote_offers")
      .insert({ ...payload, request_id: data.requestId, provider_id: provider.id })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("تعذر إرسال العرض");

    try {
      const { data: req } = await context.supabase
        .from("quote_requests")
        .select("customer_id, title")
        .eq("id", data.requestId)
        .maybeSingle();
      if (req) {
        await context.supabase.rpc("push_notification", {
          _user_id: req.customer_id,
          _title: "وصلك عرض سعر جديد",
          _body: req.title,
          _kind: "quote_offer",
          _key: `quote_offer:${row.id}`,
        });
      }
    } catch {
      /* الإشعار ليس شرطاً */
    }

    return { id: row.id };
  });

/** قبول عرض سعر وإغلاق الطلب. */
export const acceptQuoteOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string; offerId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: req } = await context.supabase
      .from("quote_requests")
      .select("id, customer_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req || req.customer_id !== context.userId) throw new Error("غير مصرح بهذا الإجراء");

    const { error } = await context.supabase
      .from("quote_requests")
      .update({ status: "accepted", accepted_offer_id: data.offerId })
      .eq("id", data.requestId);
    if (error) throw new Error("تعذر قبول العرض");

    await context.supabase
      .from("quote_offers")
      .update({ status: "accepted" })
      .eq("id", data.offerId);
    await context.supabase
      .from("quote_offers")
      .update({ status: "rejected" })
      .eq("request_id", data.requestId)
      .neq("id", data.offerId);

    try {
      const { data: offer } = await context.supabase
        .from("quote_offers")
        .select("provider_id, providers(owner_id)")
        .eq("id", data.offerId)
        .maybeSingle();
      const ownerId = (offer as unknown as { providers?: { owner_id?: string } })?.providers
        ?.owner_id;
      if (ownerId) {
        await context.supabase.rpc("push_notification", {
          _user_id: ownerId,
          _title: "تم قبول عرضك",
          _body: "الزبون قبل عرض السعر، تواصل معه لإكمال الخدمة",
          _kind: "quote_accepted",
          _key: `quote_accepted:${data.offerId}`,
        });
      }
    } catch {
      /* الإشعار ليس شرطاً */
    }

    return { ok: true };
  });
