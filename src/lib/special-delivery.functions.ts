import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SpecialStopInput = {
  address_text: string;
  lat?: number | null;
  lng?: number | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  notes?: string | null;
};

type QuoteInput = {
  vehicleType: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  stops: SpecialStopInput[];
};

type CreateInput = QuoteInput & {
  pickupText: string;
  cargoDescription?: string | null;
  cargoWeightKg?: number | null;
  scheduledAt?: string | null;
  notes?: string | null;
};

function friendly(message: string): string {
  if (message.includes("missing_vehicle_type")) return "اختر نوع المركبة";
  if (message.includes("missing_pickup")) return "حدد نقطة الاستلام أو اكتب العنوان";
  if (message.includes("missing_stops")) return "أضف نقطة تسليم واحدة على الأقل";
  if (message.includes("too_many_stops")) return "الحد الأقصى 5 نقاط تسليم بالطلب الواحد";
  if (message.includes("invalid_schedule")) return "الموعد المحدد غير صالح";
  if (message.includes("invalid_weight")) return "الوزن المدخل غير صالح";
  if (message.includes("too_many_active_special_orders"))
    return "عندك طلبات توصيل خاص نشطة كثيرة، خلّصها أول";
  if (message.includes("user_blocked")) return "حسابك موقوف حالياً";
  if (message.includes("unauthorized")) return "سجّل الدخول أول";
  return "تعذر إنشاء الطلب، حاول مرة ثانية";
}

function cleanStops(stops: SpecialStopInput[]) {
  return (stops ?? [])
    .map((s) => ({
      address_text: (s.address_text ?? "").trim(),
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      recipient_name: (s.recipient_name ?? "").trim() || null,
      recipient_phone: (s.recipient_phone ?? "").trim() || null,
      notes: (s.notes ?? "").trim() || null,
    }))
    .filter((s) => s.address_text.length > 0 || (s.lat != null && s.lng != null));
}

/** تسعير تقديري للتوصيل الخاص — المسافة والأجرة تُحسبان في قاعدة البيانات فقط. */
export const quoteSpecialDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: QuoteInput) => data)
  .handler(async ({ data, context }) => {
    const stops = cleanStops(data.stops);
    const { data: quote, error } = await context.supabase.rpc("quote_special_delivery", {
      _vehicle_type: data.vehicleType as never,
      _pickup_lat: data.pickupLat ?? (null as never),
      _pickup_lng: data.pickupLng ?? (null as never),
      _stops: stops as never,
    });
    if (error) throw new Error("تعذر حساب الأجرة حالياً");
    const q = (quote ?? {}) as { km?: number; fee?: number; stops?: number };
    return { km: Number(q.km ?? 0), fee: Number(q.fee ?? 0), stops: Number(q.stops ?? 0) };
  });

/** إنشاء طلب توصيل خاص ثم توزيعه فوراً ما لم يكن مجدولاً لوقت لاحق. */
export const createSpecialDeliveryOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateInput) => data)
  .handler(async ({ data, context }) => {
    const stops = cleanStops(data.stops);
    const { data: order, error } = await context.supabase.rpc("create_special_delivery_order", {
      _vehicle_type: data.vehicleType as never,
      _pickup_text: (data.pickupText ?? "").trim(),
      _pickup_lat: data.pickupLat ?? (null as never),
      _pickup_lng: data.pickupLng ?? (null as never),
      _stops: stops as never,
      _cargo_description: data.cargoDescription ?? null,
      _cargo_weight_kg: data.cargoWeightKg ?? null,
      _scheduled_at: data.scheduledAt ?? null,
      _notes: data.notes ?? null,
    });
    if (error || !order) throw new Error(friendly(error?.message ?? ""));

    if (order.status === "searching_driver") {
      try {
        const { runDispatch } = await import("@/lib/dispatch.server");
        await runDispatch(order.id);
      } catch {
        /* تلتقطه الصيانة الدورية */
      }
    }

    return {
      id: order.id,
      code: order.code,
      status: order.status,
      scheduledAt: order.scheduled_at,
      deliveryFee: Number(order.delivery_fee),
      total: Number(order.total),
    };
  });

/** تأكيد تسليم نقطة من نقاط الطلب — للمندوب المعيّن فقط وبالترتيب. */
export const completeOrderStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { stopId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: stop, error } = await context.supabase.rpc("complete_order_stop", {
      _stop_id: data.stopId,
    });
    if (error) {
      const m = error.message ?? "";
      if (m.includes("stops_out_of_order")) throw new Error("سلّم النقاط بالترتيب");
      if (m.includes("order_not_in_delivery")) throw new Error("لازم تستلم الطلب أول");
      if (m.includes("stop_already_delivered")) throw new Error("هذه النقطة مسلَّمة أصلاً");
      if (m.includes("forbidden")) throw new Error("ما عندك صلاحية على هذا الطلب");
      throw new Error("تعذر تحديث حالة النقطة");
    }
    return stop;
  });
