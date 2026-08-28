import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProviderStats = {
  orders_total: number;
  orders_completed: number;
  orders_cancelled: number;
  orders_active: number;
  revenue: number;
  avg_ticket: number;
  top_products: { name: string; quantity: number; revenue: number }[];
  daily: { day: string; orders: number; revenue: number }[];
};

/** إحصاءات لوحة التاجر الذكية (المنطق داخل قاعدة البيانات مع تحقق الملكية). */
export const getProviderStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string; days?: number }) => data)
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("provider_dashboard_stats", {
      _provider_id: data.providerId,
      _days: Math.min(Math.max(data.days ?? 30, 1), 180),
    });
    if (error) throw new Error("تعذر تحميل الإحصاءات");
    return res as unknown as ProviderStats;
  });

/** عروض المتجر: القراءة والإنشاء والتعطيل. */
export const listProviderPromotions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("promotions")
      .select("id, title, description, discount_percent, is_active, starts_at, ends_at")
      .eq("provider_id", data.providerId)
      .order("created_at", { ascending: false });
    return (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      discountPercent: Number(r.discount_percent),
      isActive: r.is_active,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
    }));
  });

export const savePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      providerId: string;
      title: string;
      description?: string | null;
      discountPercent: number;
      endsAt?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const title = (data.title ?? "").trim();
    if (!title) throw new Error("اكتب عنوان العرض");
    const { error } = await context.supabase.from("promotions").insert({
      provider_id: data.providerId,
      title: title.slice(0, 120),
      description: data.description?.trim() ? data.description.trim().slice(0, 400) : null,
      discount_percent: Math.min(Math.max(Number(data.discountPercent) || 0, 0), 90),
      ends_at: data.endsAt || null,
    });
    if (error) throw new Error("تعذر حفظ العرض");
    return { ok: true };
  });

export const setPromotionActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; isActive: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("promotions")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error("تعذر تحديث العرض");
    return { ok: true };
  });
