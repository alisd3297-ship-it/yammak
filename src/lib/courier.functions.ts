import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function friendly(message: string): string {
  if (message.includes("missing_pickup")) return "حدد موقع الاستلام أو اكتب العنوان";
  if (message.includes("missing_dropoff")) return "حدد موقع التسليم أو اكتب العنوان";
  if (message.includes("too_many_active_courier_orders")) return "عندك طلبات مندوب نشطة كثيرة، خلّصها أول";
  if (message.includes("user_blocked")) return "حسابك موقوف حالياً";
  if (message.includes("unauthorized")) return "سجّل الدخول أول";
  return "تعذر إنشاء الطلب، حاول مرة ثانية";
}

type CourierInput = {
  pickupText: string;
  dropoffText: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  notes?: string | null;
};

/** تسعير طلب المندوب المستقل من قواعد التسعير في الخادم فقط. */
export const quoteCourierFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      pickupLat?: number | null;
      pickupLng?: number | null;
      dropoffLat?: number | null;
      dropoffLng?: number | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("city_id")
      .eq("id", context.userId)
      .maybeSingle();

    let cityId = profile?.city_id ?? null;
    if (!cityId) {
      const { data: city } = await context.supabase
        .from("cities")
        .select("id")
        .eq("is_active", true)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      cityId = city?.id ?? null;
    }

    let km = 0;
    if (
      data.pickupLat != null &&
      data.pickupLng != null &&
      data.dropoffLat != null &&
      data.dropoffLng != null
    ) {
      const { data: d } = await context.supabase.rpc("haversine_km", {
        a_lat: data.pickupLat,
        a_lng: data.pickupLng,
        b_lat: data.dropoffLat,
        b_lng: data.dropoffLng,
      });
      km = Number(d ?? 0);
    }

    const { data: fee } = await context.supabase.rpc("compute_delivery_fee", {
      _order_type: "courier",
      _city_id: cityId as string,
      _provider_id: null as unknown as string,
      _distance_km: km,
    });
    return { fee: Number(fee ?? 0), km };
  });

/** إنشاء طلب مندوب مستقل ثم توزيعه فوراً على أقرب مندوب متاح. */
export const createCourierOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CourierInput) => data)
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase.rpc("create_courier_order", {
      _pickup_text: (data.pickupText ?? "").trim(),
      _dropoff_text: (data.dropoffText ?? "").trim(),
      ...(data.pickupLat != null ? { _pickup_lat: data.pickupLat } : {}),
      ...(data.pickupLng != null ? { _pickup_lng: data.pickupLng } : {}),
      ...(data.dropoffLat != null ? { _dropoff_lat: data.dropoffLat } : {}),
      ...(data.dropoffLng != null ? { _dropoff_lng: data.dropoffLng } : {}),
      ...(data.notes ? { _notes: data.notes } : {}),
    });
    if (error || !order) throw new Error(friendly(error?.message ?? ""));

    // التوزيع الفوري عبر نفس محرك العروض؛ إن فشل تلتقطه الصيانة الدورية
    try {
      const { runDispatch } = await import("@/lib/dispatch.server");
      await runDispatch(order.id);
    } catch {
      /* يبقى الطلب في حالة البحث عن مندوب */
    }

    return {
      id: order.id,
      code: order.code,
      deliveryFee: Number(order.delivery_fee),
      total: Number(order.total),
    };
  });
