import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { distanceKm } from "@/lib/orders";
import { VEHICLE_RANK, type VehicleType } from "@/lib/vehicles";
import { OPERATING_LOCATION_COORDS } from "@/lib/location";

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
    .select(
      "id, status, provider_id, driver_id, customer_id, pickup_lat, pickup_lng, vehicle_type, scheduled_at, order_type, fulfillment, dispatch_attempts, dispatch_last_attempt_at",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("الطلب غير موجود");
  if (order.driver_id)
    return { assignedTo: order.driver_id, status: order.status, message: "الطلب مسند مسبقاً" };
  if (order.status === "cancelled" || order.status === "completed")
    return { assignedTo: null, status: order.status, message: "الطلب منتهي" };
  // طلبات السفري/الصالة لا تحتاج مندوباً إطلاقاً
  if (order.fulfillment && order.fulfillment !== "delivery")
    return { assignedTo: null, status: order.status, message: "طلب استلام من المحل" };
  // الطلب المجدول لا يدخل التوزيع قبل اقتراب موعده
  if (order.scheduled_at && new Date(order.scheduled_at).getTime() - Date.now() > 15 * 60_000)
    return { assignedTo: null, status: order.status, message: "الطلب مجدول لوقت لاحق" };

  // مهلة تصاعدية بين المحاولات الفاشلة حتى لا ندور في حلقة استعلامات
  const attempts = Number(order.dispatch_attempts ?? 0);
  if (attempts > 0 && order.dispatch_last_attempt_at) {
    const waitMs = Math.min(30 * attempts, 300) * 1000;
    const since = Date.now() - new Date(order.dispatch_last_attempt_at).getTime();
    if (since < waitMs)
      return {
        assignedTo: null,
        status: order.status,
        message: "ما زلنا نبحث عن مندوب، إعادة المحاولة بعد قليل",
      };
  }

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "driver_offer_timeout_seconds",
      "driver_location_max_age_minutes",
      "max_offer_radius_km",
    ]);
  const setting = (key: string, fallback: number) =>
    Number(settings?.find((s) => s.key === key)?.value ?? fallback);
  const timeout = Math.min(Math.max(setting("driver_offer_timeout_seconds", 120), 60), 300);
  const maxAgeMin = setting("driver_location_max_age_minutes", 10);
  const baseRadiusKm = setting("max_offer_radius_km", 15);
  // امتياز «لبابك بلس»: نوسّع دائرة البحث لزبائن الاشتراك حتى يُسند طلبهم أسرع
  const { data: isPlus } = await supabaseAdmin.rpc("is_plus", { _user_id: order.customer_id });
  const radiusKm = isPlus === true ? baseRadiusKm * 1.5 : baseRadiusKm;

  const { data: liveOffer } = await supabaseAdmin
    .from("delivery_offers")
    .select("id, driver_id")
    .eq("order_id", order.id)
    .eq("status", "sent")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (liveOffer)
    return {
      assignedTo: null,
      status: "offered_to_driver",
      message: "هناك عرض قائم بانتظار رد المندوب",
    };

  if (order.status === "ready_for_pickup" || order.status === "new") {
    await supabaseAdmin.rpc("system_change_order_status", {
      _order_id: order.id,
      _new_status: "searching_driver",
    });
  }

  // الرافض يُستبعد نهائياً، أما من انتهت مهلته فيُستبعد مؤقتاً فقط (تبريد 10 دقائق)
  // حتى لا يصبح الطلب مستحيل التوزيع بعد جولة عروض منتهية.
  const cooldownFrom = Date.now() - 10 * 60_000;
  const { data: previous } = await supabaseAdmin
    .from("delivery_offers")
    .select("driver_id, status, sent_at, responded_at")
    .eq("order_id", order.id);
  const excluded = new Set(
    (previous ?? [])
      .filter((o) => {
        if (o.status === "rejected") return true;
        const at = new Date(o.responded_at ?? o.sent_at ?? 0).getTime();
        return at > cooldownFrom;
      })
      .map((o) => o.driver_id),
  );

  const { data: workers } = await supabaseAdmin
    .from("worker_profiles")
    .select("user_id, max_active_orders, vehicle_type, rating, ratings_count")
    .eq("worker_kind", "delivery")
    .eq("is_approved", true)
    .eq("is_available", true);

  // نوع المركبة يقيّد فقط طلبات التوصيل الخاص/المندوب المستقل التي تحدد مركبة مطلوبة.
  // طلبات المطاعم والمتاجر تقبل كل أنواع المركبات (دراجة، ستوتة، سيارة، شاحنة حمل، تكسي)
  // ما دام حساب المندوب مفعّلاً للتوصيل ومعتمداً ومتاحاً.
  const vehicleConstrained =
    order.order_type === "special_delivery" || order.order_type === "courier";
  const requiredRank =
    vehicleConstrained && order.vehicle_type
      ? VEHICLE_RANK[order.vehicle_type as VehicleType]
      : 0;


  const freshAfter = new Date(Date.now() - maxAgeMin * 60_000).toISOString();
  const staleAfter = new Date(Date.now() - maxAgeMin * 4 * 60_000).toISOString();
  const { data: freshLocations } = await supabaseAdmin
    .from("worker_locations")
    .select("user_id, lat, lng, updated_at")
    .eq("is_online", true)
    .gt("updated_at", freshAfter);
  // احتياط: مواقع أقدم قليلاً تُستخدم فقط إذا لم يوجد أي مرشح بموقع حديث،
  // حتى لا يبقى الطلب عالقاً بسبب قدم الموقع وحده.
  const { data: staleLocations } = await supabaseAdmin
    .from("worker_locations")
    .select("user_id, lat, lng, updated_at")
    .eq("is_online", true)
    .lte("updated_at", freshAfter)
    .gt("updated_at", staleAfter);

  const { data: activeOrders } = await supabaseAdmin
    .from("orders")
    .select("driver_id, dropoff_lat, dropoff_lng, status")
    .not("driver_id", "is", null)
    .in("status", [...ACTIVE_DRIVER_STATUSES]);

  // إحداثيات الاستلام قد تكون فارغة (مزوّد بلا موقع)، فنعتمد موقع المزوّد ثم موقع التشغيل
  // بدل الصفر، وإلا تُحسب المسافة من نقطة خاطئة ويُستبعد كل المندوبين.
  let pickupLat = order.pickup_lat ?? null;
  let pickupLng = order.pickup_lng ?? null;
  if ((pickupLat == null || pickupLng == null) && order.provider_id) {
    const { data: prov } = await supabaseAdmin
      .from("providers")
      .select("lat, lng")
      .eq("id", order.provider_id)
      .maybeSingle();
    if (prov?.lat != null && prov?.lng != null) {
      pickupLat = prov.lat;
      pickupLng = prov.lng;
    }
  }
  const originLat: number = pickupLat ?? OPERATING_LOCATION_COORDS.lat;
  const originLng: number = pickupLng ?? OPERATING_LOCATION_COORDS.lng;

  const buildCandidates = (locations: { user_id: string; lat: number; lng: number }[]) =>
    (workers ?? [])
      .filter((w) => !excluded.has(w.user_id))
      .filter((w) => {
        if (!requiredRank) return true;
        const rank = w.vehicle_type ? VEHICLE_RANK[w.vehicle_type as VehicleType] : 1;
        return rank >= requiredRank;
      })
      .map((w) => {
        const loc = locations.find((l) => l.user_id === w.user_id);
        if (!loc) return null;
        const km = distanceKm(loc.lat, loc.lng, originLat, originLng);
        const current = (activeOrders ?? []).filter((o) => o.driver_id === w.user_id);
        if (current.length >= (w.max_active_orders ?? 2)) return null;
        const conflicting = current.some((o) => {
          if (o.dropoff_lat == null || o.dropoff_lng == null) return false;
          return distanceKm(o.dropoff_lat, o.dropoff_lng, originLat, originLng) > radiusKm / 2;
        });
        if (conflicting) return null;
        // توزيع ذكي: المسافة أساس الترتيب، مع خصم على الحمل الحالي ومكافأة للتقييم العالي
        // (التقييم يُحتسب فقط بعد عدد كافٍ من التقييمات حتى لا يتحيّز للجدد).
        const rating = Number(w.rating ?? 0);
        const rated = Number(w.ratings_count ?? 0) >= 5;
        const score = km + current.length * 1.5 - (rated ? (rating - 4) * 0.8 : 0);
        return { driverId: w.user_id, km, score };
      })
      .filter(
        (c): c is { driverId: string; km: number; score: number } => c !== null && c.km <= radiusKm,
      )
      .sort((a, b) => a.score - b.score);

  let candidates = buildCandidates((freshLocations ?? []) as never);
  if (!candidates.length) candidates = buildCandidates((staleLocations ?? []) as never);

  if (!candidates.length) {
    const { data: mark } = await supabaseAdmin.rpc("mark_dispatch_attempt", {
      _order_id: order.id,
      _found: false,
    });
    const info = (mark ?? {}) as { attempts?: number; alerted?: boolean };
    return {
      assignedTo: null,
      status: "searching_driver",
      message: info.alerted
        ? "لا يوجد مندوب متاح، تم تنبيه الإدارة"
        : `لا يوجد مندوب مناسب حالياً (محاولة ${info.attempts ?? 1})`,
    };
  }

  // إرسال العرض بشكل ذري داخل قاعدة البيانات: قفل على الطلب والسائق مع إعادة فحص
  // العروض القائمة وسعة السائق، فلا يمكن إرسال عرضين للطلب نفسه أو تجاوز السعة عند التزامن.
  let chosen: { driverId: string; km: number; score: number } | null = null;
  for (const candidate of candidates.slice(0, 5)) {
    const { data: ok } = await supabaseAdmin.rpc("try_offer_delivery", {
      _order_id: order.id,
      _driver_id: candidate.driverId,
      _distance_km: Number(candidate.km.toFixed(2)),
      _timeout_seconds: timeout,
    });
    if (ok === true) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen) {
    await supabaseAdmin.rpc("mark_dispatch_attempt", { _order_id: order.id, _found: false });
    return { assignedTo: null, status: "searching_driver", message: "لا يوجد مندوب مناسب حالياً" };
  }
  await supabaseAdmin.rpc("mark_dispatch_attempt", { _order_id: order.id, _found: true });
  await supabaseAdmin.rpc("system_change_order_status", {
    _order_id: order.id,
    _new_status: "offered_to_driver",
  });
  // إشعار مختصر ومفيد للمندوب: رقم الطلب، المتجر، منطقة التسليم، وأجرة التوصيل.
  const { data: orderInfo } = await supabaseAdmin
    .from("orders")
    .select("code, delivery_fee, dropoff_text, providers(name)")
    .eq("id", order.id)
    .maybeSingle();
  const providerName =
    (orderInfo?.providers as { name?: string } | null)?.name ?? "طلب توصيل مباشر";
  const dropoff = (orderInfo?.dropoff_text ?? "").trim();
  const shortDropoff = dropoff.length > 40 ? `${dropoff.slice(0, 40)}…` : dropoff;
  const fee = Number(orderInfo?.delivery_fee ?? 0);
  const parts = [
    `طلب #${orderInfo?.code ?? ""}`.trim(),
    providerName,
    shortDropoff ? `التسليم: ${shortDropoff}` : null,
    fee > 0 ? `أجرة التوصيل: ${fee.toLocaleString("en-US")} د.ع` : null,
    `المسافة ${chosen.km.toFixed(1)} كم`,
  ].filter(Boolean);
  const { data: notif } = await supabaseAdmin
    .from("notifications")
    .insert({
      user_id: chosen.driverId,
      title: "طلب توصيل جديد",
      body: parts.join(" · "),
      kind: "offer",
      order_id: order.id,
    })
    .select("id")
    .maybeSingle();

  // إرسال فوري للهاتف حتى والتطبيق مغلق؛ أي فشل يترك الإشعار معلّقاً لتلتقطه الصيانة
  if (notif?.id) {
    try {
      const { pushNotificationNow } = await import("@/lib/push.server");
      await pushNotificationNow(notif.id);
    } catch {
      // متروك للصيانة الدورية
    }
  }

  return {
    assignedTo: chosen.driverId,
    status: "offered_to_driver",
    message: "تم إرسال الطلب لأقرب مندوب",
  };
}

/** صيانة دورية: إنهاء العروض المنتهية وإكمال الطلبات المسلَّمة بعد المهلة. */
export async function runMaintenance(source = "manual", minSeconds = 30) {
  // قفل يمنع التشغيل المتزامن أو المتكرر خلال فترة قصيرة (cron + fallback معاً)
  const { data: claimed } = await supabaseAdmin.rpc("claim_maintenance_slot", {
    _name: "dispatch_maintenance",
    _min_seconds: minSeconds,
  });
  if (claimed === false) {
    return { skipped: true, expired: 0, completed: 0, redispatched: 0, pushed: 0 };
  }

  const { data: expired } = await supabaseAdmin.rpc("expire_stale_offers", {});
  const { data: completed } = await supabaseAdmin.rpc("auto_complete_delivered_orders");
  // إنهاء الإعلانات التي انتهت مدة نشرها
  await supabaseAdmin.rpc("expire_due_ads");

  // إطلاق طلبات التوصيل الخاص المجدولة عند اقتراب موعدها
  const { data: due } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("order_type", "special_delivery")
    .eq("status", "new")
    .is("driver_id", null)
    .lte("scheduled_at", new Date(Date.now() + 15 * 60_000).toISOString())
    .limit(20);

  // كل طلب بلا مندوب عالق في مرحلة توزيع: بحث عن مندوب، أو جاهز للاستلام
  // ولم يُستدعَ له التوزيع (فشل نداء الواجهة)، أو عرض منتهي بلا رد.
  const { data: stuck } = await supabaseAdmin
    .from("orders")
    .select("id")
    .in("status", ["searching_driver", "ready_for_pickup", "offered_to_driver"])
    .eq("fulfillment", "delivery")
    .is("driver_id", null)
    .limit(40);

  let redispatched = 0;
  const seen = new Set<string>();
  for (const o of [...(due ?? []), ...(stuck ?? [])]) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    try {
      // runDispatch نفسه يتحقق من وجود عرض قائم ولا يرسل عرضاً مزدوجاً
      const res = await runDispatch(o.id);
      if (res.assignedTo) redispatched += 1;
    } catch {
      // نتجاهل الطلب المتعثر ونكمل البقية
    }
  }

  // إعادة محاولة الاستردادات المعلّقة لدى مزود الدفع
  try {
    const { processPendingRefunds } = await import("@/lib/payments.server");
    await processPendingRefunds();
  } catch {
    // لا نوقف الصيانة بسبب مزود الدفع
  }

  // صيانة رحلات التكسي: إنهاء العروض المنتهية وإعادة توزيع الرحلات المعلّقة
  let tripExpired = 0;
  try {
    const { runTripMaintenance } = await import("@/lib/taxi.server");
    const trips = await runTripMaintenance();
    tripExpired = trips.expired;
    redispatched += trips.redispatched;
  } catch {
    // لا نوقف الصيانة العامة بسبب الرحلات
  }

  // إرسال إشعارات الهاتف المعلّقة ضمن نفس الدورة (كل دقيقة) بدل الاعتماد على مجدول خارجي
  let pushed = 0;
  try {
    const { dispatchPendingPush } = await import("@/lib/push.server");
    const push = await dispatchPendingPush(100);
    pushed = push.sent;
  } catch {
    // فشل الإرسال لا يوقف الصيانة؛ تبقى الإشعارات معلّقة للدورة القادمة
  }

  const result = {
    skipped: false,
    expired: Number(expired ?? 0) + tripExpired,
    completed: Number(completed ?? 0),
    redispatched,
    pushed,
  };

  await supabaseAdmin.from("maintenance_runs").insert({
    source,
    expired: result.expired,
    completed: result.completed,
    redispatched: result.redispatched,
  });

  return result;
}
