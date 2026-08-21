import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { distanceKm } from "@/lib/orders";
import { TAXI_CLASS_RANK, type TaxiClass } from "@/lib/taxi";

export type TripDispatchResult = { assignedTo: string | null; status: string; message: string };

const ACTIVE_TRIP_STATUSES = [
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
] as const;

/**
 * محرك توزيع الرحلات: يختار أقرب سائق تكسي معتمد ومتاح تنطبق عليه فئة المركبة
 * وعدد الركاب، ويرسل له عرضاً بمهلة. يعمل بصلاحيات الخادم فقط.
 */
export async function runTripDispatch(tripId: string): Promise<TripDispatchResult> {
  await supabaseAdmin.rpc("expire_stale_trip_offers", { _trip_id: tripId });

  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("id, status, driver_id, taxi_class, passengers, pickup_lat, pickup_lng")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) throw new Error("الرحلة غير موجودة");
  if (trip.driver_id)
    return { assignedTo: trip.driver_id, status: trip.status, message: "الرحلة مسندة مسبقاً" };
  if (trip.status === "cancelled" || trip.status === "completed")
    return { assignedTo: null, status: trip.status, message: "الرحلة منتهية" };

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["taxi_offer_timeout_seconds", "driver_location_max_age_minutes", "max_offer_radius_km"]);
  const setting = (key: string, fallback: number) =>
    Number(settings?.find((s) => s.key === key)?.value ?? fallback);
  const timeout = Math.min(Math.max(setting("taxi_offer_timeout_seconds", 90), 45), 300);
  const maxAgeMin = setting("driver_location_max_age_minutes", 10);
  const radiusKm = setting("max_offer_radius_km", 15);

  const { data: liveOffer } = await supabaseAdmin
    .from("trip_offers")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("status", "sent")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (liveOffer)
    return { assignedTo: null, status: trip.status, message: "هناك عرض قائم بانتظار رد السائق" };

  if (trip.status === "requested") {
    await supabaseAdmin.rpc("system_change_trip_status", {
      _trip_id: trip.id,
      _new_status: "searching_driver",
    });
  }

  const { data: previous } = await supabaseAdmin
    .from("trip_offers")
    .select("driver_id")
    .eq("trip_id", trip.id);
  const excluded = new Set((previous ?? []).map((o) => o.driver_id));

  const { data: workers } = await supabaseAdmin
    .from("worker_profiles")
    .select("user_id, taxi_class, taxi_seats, max_active_orders")
    .eq("worker_kind", "taxi")
    .eq("is_approved", true)
    .eq("is_available", true);

  const freshAfter = new Date(Date.now() - maxAgeMin * 60_000).toISOString();
  const { data: locations } = await supabaseAdmin
    .from("worker_locations")
    .select("user_id, lat, lng")
    .eq("is_online", true)
    .gt("updated_at", freshAfter);

  const { data: activeTrips } = await supabaseAdmin
    .from("trips")
    .select("driver_id")
    .not("driver_id", "is", null)
    .in("status", [...ACTIVE_TRIP_STATUSES]);

  const requiredRank = TAXI_CLASS_RANK[(trip.taxi_class ?? "economy") as TaxiClass];
  const pax = trip.passengers ?? 1;
  const pickupLat = trip.pickup_lat ?? 0;
  const pickupLng = trip.pickup_lng ?? 0;

  const candidates = (workers ?? [])
    .filter((w) => !excluded.has(w.user_id))
    .filter((w) => {
      const rank = w.taxi_class ? TAXI_CLASS_RANK[w.taxi_class as TaxiClass] : 1;
      return rank >= requiredRank && (w.taxi_seats ?? 4) >= pax;
    })
    .map((w) => {
      const loc = locations?.find((l) => l.user_id === w.user_id);
      if (!loc) return null;
      const busy = (activeTrips ?? []).filter((t) => t.driver_id === w.user_id).length;
      if (busy >= 1) return null;
      return { driverId: w.user_id, km: distanceKm(loc.lat, loc.lng, pickupLat, pickupLng) };
    })
    .filter((c): c is { driverId: string; km: number } => c !== null && c.km <= radiusKm)
    .sort((a, b) => a.km - b.km);

  if (!candidates.length)
    return { assignedTo: null, status: "searching_driver", message: "ماكو سائق متاح حالياً، نكمل البحث" };

  // إرسال العرض ذرياً داخل قاعدة البيانات لمنع عرضين على نفس الرحلة أو نفس السائق
  let chosen: { driverId: string; km: number } | null = null;
  for (const candidate of candidates.slice(0, 5)) {
    const { data: ok } = await supabaseAdmin.rpc("try_offer_trip", {
      _trip_id: trip.id,
      _driver_id: candidate.driverId,
      _distance_km: Number(candidate.km.toFixed(2)),
      _timeout_seconds: timeout,
    });
    if (ok === true) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen)
    return { assignedTo: null, status: "searching_driver", message: "ماكو سائق متاح حالياً، نكمل البحث" };
  await supabaseAdmin.from("notifications").insert({
    user_id: chosen.driverId,
    title: "طلب رحلة جديد",
    body: "وصلك عرض رحلة تكسي، لديك مهلة للرد",
    kind: "trip_offer",
  });

  return { assignedTo: null, status: "searching_driver", message: "تم إرسال الرحلة لأقرب سائق" };
}

/** صيانة الرحلات: إنهاء العروض المنتهية وإعادة توزيع الرحلات المعلّقة. */
export async function runTripMaintenance(): Promise<{ expired: number; redispatched: number }> {
  const { data: expired } = await supabaseAdmin.rpc("expire_stale_trip_offers", {});

  const { data: stuck } = await supabaseAdmin
    .from("trips")
    .select("id")
    .in("status", ["requested", "searching_driver"])
    .is("driver_id", null)
    .limit(20);

  let redispatched = 0;
  for (const t of stuck ?? []) {
    try {
      await runTripDispatch(t.id);
      redispatched += 1;
    } catch {
      // نتجاهل الرحلة المتعثرة ونكمل البقية
    }
  }

  return { expired: Number(expired ?? 0), redispatched };
}
