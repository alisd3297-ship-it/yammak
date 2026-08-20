import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { distanceKm } from "@/lib/orders";
import { VEHICLE_RANK, type VehicleType } from "@/lib/vehicles";

export type DispatchResult = { assignedTo: string | null; status: string; message: string };

const ACTIVE_DRIVER_STATUSES = [
  "driver_accepted",
  "driver_heading_pickup",
  "picked_up",
  "on_the_way",
] as const;

/**
 * محرك توزيع الطلبات: يختار أقرب مندوب مناسب ويرسل له عرضاً بمهلة محددة.
 * يعمل بالكامل على الخادم بصلاحيات موثوقة، ولا يمكن للواجهة تجاوزه.
 */
export async function runDispatch(orderId: string): Promise<DispatchResult> {
  // معالجة العروض المنتهية أولاً حتى لا يبقى الطلب عالقاً
  await supabaseAdmin.rpc("expire_stale_offers", { _order_id: orderId });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, provider_id, driver_id, pickup_lat, pickup_lng, vehicle_type, scheduled_at, order_type")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("الطلب غير موجود");
  if (order.driver_id)
    return { assignedTo: order.driver_id, status: order.status, message: "الطلب مسند مسبقاً" };
  if (order.status === "cancelled" || order.status === "completed")
    return { assignedTo: null, status: order.status, message: "الطلب منتهي" };
  // الطلب المجدول لا يدخل التوزيع قبل اقتراب موعده
  if (order.scheduled_at && new Date(order.scheduled_at).getTime() - Date.now() > 15 * 60_000)
    return { assignedTo: null, status: order.status, message: "الطلب مجدول لوقت لاحق" };

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["driver_offer_timeout_seconds", "driver_location_max_age_minutes", "max_offer_radius_km"]);
  const setting = (key: string, fallback: number) =>
    Number(settings?.find((s) => s.key === key)?.value ?? fallback);
  const timeout = Math.min(Math.max(setting("driver_offer_timeout_seconds", 120), 60), 300);
  const maxAgeMin = setting("driver_location_max_age_minutes", 10);
  const radiusKm = setting("max_offer_radius_km", 15);

  const { data: liveOffer } = await supabaseAdmin
    .from("delivery_offers")
    .select("id, driver_id")
    .eq("order_id", order.id)
    .eq("status", "sent")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (liveOffer)
    return { assignedTo: null, status: "offered_to_driver", message: "هناك عرض قائم بانتظار رد المندوب" };

  if (order.status === "ready_for_pickup" || order.status === "new") {
    await supabaseAdmin.rpc("system_change_order_status", {
      _order_id: order.id,
      _new_status: "searching_driver",
    });
  }

  // استبعاد كل مندوب سبق أن رفض أو انتهت مهلته على هذا الطلب
  const { data: previous } = await supabaseAdmin
    .from("delivery_offers")
    .select("driver_id")
    .eq("order_id", order.id);
  const excluded = new Set((previous ?? []).map((o) => o.driver_id));

  const { data: workers } = await supabaseAdmin
    .from("worker_profiles")
    .select("user_id, max_active_orders, vehicle_type")
    .eq("worker_kind", "delivery")
    .eq("is_approved", true)
    .eq("is_available", true);

  // تصفية حسب سعة المركبة المطلوبة (التوصيل الخاص)
  const requiredRank = order.vehicle_type ? VEHICLE_RANK[order.vehicle_type as VehicleType] : 0;

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
    .in("status", [...ACTIVE_DRIVER_STATUSES]);

  const pickupLat = order.pickup_lat ?? 0;
  const pickupLng = order.pickup_lng ?? 0;

  const candidates = (workers ?? [])
    .filter((w) => !excluded.has(w.user_id))
    .filter((w) => {
      if (!requiredRank) return true;
      const rank = w.vehicle_type ? VEHICLE_RANK[w.vehicle_type as VehicleType] : 1;
      return rank >= requiredRank;
    })
    .map((w) => {
      const loc = locations?.find((l) => l.user_id === w.user_id);
      if (!loc) return null;
      const km = distanceKm(loc.lat, loc.lng, pickupLat, pickupLng);
      const current = (activeOrders ?? []).filter((o) => o.driver_id === w.user_id);
      if (current.length >= (w.max_active_orders ?? 2)) return null;
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
    return { assignedTo: null, status: "searching_driver", message: "لا يوجد مندوب مناسب حالياً" };
  }

  const chosen = candidates[0]!;
  await supabaseAdmin.from("delivery_offers").insert({
    order_id: order.id,
    driver_id: chosen.driverId,
    distance_km: Number(chosen.km.toFixed(2)),
    expires_at: new Date(Date.now() + timeout * 1000).toISOString(),
  });
  await supabaseAdmin.rpc("system_change_order_status", {
    _order_id: order.id,
    _new_status: "offered_to_driver",
  });
  await supabaseAdmin.from("notifications").insert({
    user_id: chosen.driverId,
    title: "طلب توصيل جديد",
    body: "لديك عرض توصيل جديد، لديك مهلة للرد",
    kind: "offer",
    order_id: order.id,
  });

  return { assignedTo: chosen.driverId, status: "offered_to_driver", message: "تم إرسال الطلب لأقرب مندوب" };
}

/** صيانة دورية: إنهاء العروض المنتهية وإكمال الطلبات المسلَّمة بعد المهلة. */
export async function runMaintenance(source = "manual", minSeconds = 30) {
  // قفل يمنع التشغيل المتزامن أو المتكرر خلال فترة قصيرة (cron + fallback معاً)
  const { data: claimed } = await supabaseAdmin.rpc("claim_maintenance_slot", {
    _name: "dispatch_maintenance",
    _min_seconds: minSeconds,
  });
  if (claimed === false) {
    return { skipped: true, expired: 0, completed: 0, redispatched: 0 };
  }

  const { data: expired } = await supabaseAdmin.rpc("expire_stale_offers", {});
  const { data: completed } = await supabaseAdmin.rpc("auto_complete_delivered_orders");

  // إطلاق طلبات التوصيل الخاص المجدولة عند اقتراب موعدها
  const { data: due } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("order_type", "special_delivery")
    .eq("status", "new")
    .is("driver_id", null)
    .lte("scheduled_at", new Date(Date.now() + 15 * 60_000).toISOString())
    .limit(20);

  const { data: stuck } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("status", "searching_driver")
    .is("driver_id", null)
    .limit(20);

  let redispatched = 0;
  for (const o of [...(due ?? []), ...(stuck ?? [])]) {
    try {
      await runDispatch(o.id);
      redispatched += 1;
    } catch {
      // نتجاهل الطلب المتعثر ونكمل البقية
    }
  }

  const result = {
    skipped: false,
    expired: Number(expired ?? 0),
    completed: Number(completed ?? 0),
    redispatched,
  };

  await supabaseAdmin.from("maintenance_runs").insert({
    source,
    expired: result.expired,
    completed: result.completed,
    redispatched: result.redispatched,
  });

  return result;
}
