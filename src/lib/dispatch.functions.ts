import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { distanceKm } from "@/lib/orders";

type DispatchResult = { assignedTo: string | null; status: string; message: string };

/**
 * محرك توزيع الطلبات: يختار أقرب مندوب مناسب ويرسل له عرضاً بمهلة محددة.
 * يعمل بالكامل على الخلفية، ولا يمكن للواجهة تجاوزه.
 */
export const dispatchOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data, context }): Promise<DispatchResult> => {
    const { supabase, userId } = context;

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, status, provider_id, driver_id, pickup_lat, pickup_lng")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("الطلب غير موجود أو غير مسموح بالوصول إليه");
    if (order.driver_id) return { assignedTo: order.driver_id, status: order.status, message: "الطلب مسند مسبقاً" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["driver_offer_timeout_seconds", "driver_location_max_age_minutes", "max_offer_radius_km"]);
    const setting = (key: string, fallback: number) =>
      Number(settings?.find((s) => s.key === key)?.value ?? fallback);
    const timeout = Math.min(Math.max(setting("driver_offer_timeout_seconds", 120), 60), 300);
    const maxAgeMin = setting("driver_location_max_age_minutes", 10);
    const radiusKm = setting("max_offer_radius_km", 15);

    // انتهاء العروض القديمة
    await supabaseAdmin
      .from("delivery_offers")
      .update({ status: "expired", responded_at: new Date().toISOString() })
      .eq("order_id", order.id)
      .eq("status", "sent")
      .lt("expires_at", new Date().toISOString());

    const { data: liveOffer } = await supabaseAdmin
      .from("delivery_offers")
      .select("id, driver_id")
      .eq("order_id", order.id)
      .eq("status", "sent")
      .maybeSingle();
    if (liveOffer)
      return { assignedTo: null, status: "offered_to_driver", message: "هناك عرض قائم بانتظار رد المندوب" };

    const { data: previous } = await supabaseAdmin
      .from("delivery_offers")
      .select("driver_id")
      .eq("order_id", order.id);
    const excluded = new Set((previous ?? []).map((o) => o.driver_id));

    const { data: workers } = await supabaseAdmin
      .from("worker_profiles")
      .select("user_id, max_active_orders")
      .eq("worker_kind", "delivery")
      .eq("is_approved", true)
      .eq("is_available", true);

    const freshAfter = new Date(Date.now() - maxAgeMin * 60_000).toISOString();
    const { data: locations } = await supabaseAdmin
      .from("worker_locations")
      .select("user_id, lat, lng, updated_at")
      .eq("is_online", true)
      .gt("updated_at", freshAfter);

    const { data: activeOrders } = await supabaseAdmin
      .from("orders")
      .select("driver_id, dropoff_lat, dropoff_lng, status")
      .not("driver_id", "is", null)
      .in("status", ["driver_accepted", "driver_heading_pickup", "picked_up", "on_the_way"]);

    const pickupLat = order.pickup_lat ?? 0;
    const pickupLng = order.pickup_lng ?? 0;

    const candidates = (workers ?? [])
      .filter((w) => !excluded.has(w.user_id))
      .map((w) => {
        const loc = locations?.find((l) => l.user_id === w.user_id);
        if (!loc) return null;
        const km = distanceKm(loc.lat, loc.lng, pickupLat, pickupLng);
        const current = (activeOrders ?? []).filter((o) => o.driver_id === w.user_id);
        if (current.length >= (w.max_active_orders ?? 2)) return null;
        // منع الطلبات المعاكسة للاتجاه: نقطة الاستلام الجديدة يجب أن تكون قريبة من مسار الطلب الحالي
        const conflicting = current.some((o) => {
          if (o.dropoff_lat == null || o.dropoff_lng == null) return false;
          return distanceKm(o.dropoff_lat, o.dropoff_lng, pickupLat, pickupLng) > radiusKm / 2;
        });
        if (conflicting) return null;
        return { driverId: w.user_id, km };
      })
      .filter((c): c is { driverId: string; km: number } => c !== null && c.km <= radiusKm)
      .sort((a, b) => a.km - b.km);

    if (!candidates.length) {
      await supabaseAdmin.from("orders").update({ status: "searching_driver" }).eq("id", order.id);
      return { assignedTo: null, status: "searching_driver", message: "لا يوجد مندوب مناسب حالياً" };
    }

    const chosen = candidates[0]!;
    await supabaseAdmin.from("delivery_offers").insert({
      order_id: order.id,
      driver_id: chosen.driverId,
      distance_km: Number(chosen.km.toFixed(2)),
      expires_at: new Date(Date.now() + timeout * 1000).toISOString(),
    });
    await supabaseAdmin.from("orders").update({ status: "offered_to_driver" }).eq("id", order.id);
    await supabaseAdmin.from("notifications").insert({
      user_id: chosen.driverId,
      title: "طلب توصيل جديد",
      body: "لديك عرض توصيل جديد، لديك مهلة للرد",
      kind: "offer",
      order_id: order.id,
    });

    void userId;
    return { assignedTo: chosen.driverId, status: "offered_to_driver", message: "تم إرسال الطلب لأقرب مندوب" };
  });

/** رد المندوب على العرض: قبول أو رفض مع سبب، ثم الانتقال للمندوب التالي عند الرفض. */
export const respondToOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { offerId: string; accept: boolean; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: offer } = await supabase
      .from("delivery_offers")
      .select("id, order_id, driver_id, status, expires_at")
      .eq("id", data.offerId)
      .maybeSingle();
    if (!offer || offer.driver_id !== userId) throw new Error("العرض غير متاح");
    if (offer.status !== "sent") throw new Error("انتهت صلاحية هذا العرض");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const expired = new Date(offer.expires_at).getTime() < Date.now();

    if (data.accept && !expired) {
      await supabaseAdmin
        .from("delivery_offers")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", offer.id);
      await supabaseAdmin
        .from("orders")
        .update({ driver_id: userId, status: "driver_accepted" })
        .eq("id", offer.order_id);
      return { ok: true, accepted: true };
    }

    await supabaseAdmin
      .from("delivery_offers")
      .update({
        status: expired ? "expired" : "rejected",
        rejection_reason: data.reason ?? null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", offer.id);
    await supabaseAdmin.from("orders").update({ status: "searching_driver" }).eq("id", offer.order_id);
    return { ok: true, accepted: false, orderId: offer.order_id };
  });

/** تعيين مندوب يدوياً من قبل الإدارة. */
export const assignDriverManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; driverId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("غير مصرح");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("delivery_offers")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("order_id", data.orderId)
      .eq("status", "sent");
    await supabaseAdmin
      .from("orders")
      .update({ driver_id: data.driverId, status: "driver_accepted" })
      .eq("id", data.orderId);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "assign_driver",
      entity: "orders",
      entity_id: data.orderId,
      after_data: { driver_id: data.driverId },
    });
    return { ok: true };
  });
