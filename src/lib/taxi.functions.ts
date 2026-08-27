import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type QuoteInput = {
  taxiClass: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
};

type CreateTripInput = QuoteInput & {
  pickupText: string;
  destinationText: string;
  passengers: number;
  notes?: string | null;
};

function friendly(message: string): string {
  if (message.includes("missing_class")) return "اختر فئة المركبة";
  if (message.includes("missing_pickup")) return "حدد نقطة الانطلاق أو اكتب العنوان";
  if (message.includes("missing_destination")) return "حدد الوجهة أو اكتب العنوان";
  if (message.includes("invalid_passengers")) return "عدد الركاب غير صالح";
  if (message.includes("passengers_exceed_class")) return "عدد الركاب يحتاج فئة عائلي";
  if (message.includes("too_many_active_trips")) return "عندك رحلة نشطة، خلّصها أول";
  if (message.includes("user_blocked")) return "حسابك موقوف حالياً";
  if (message.includes("unauthorized")) return "سجّل الدخول أول";
  return "تعذر إنشاء الرحلة، حاول مرة ثانية";
}

/** تسعير تقديري للرحلة — المسافة والأجرة تُحسبان في قاعدة البيانات فقط. */
export const quoteTaxiTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: QuoteInput) => data)
  .handler(async ({ data, context }) => {
    const { data: quote, error } = await context.supabase.rpc("quote_taxi_trip", {
      _taxi_class: data.taxiClass as never,
      _pickup_lat: (data.pickupLat ?? null) as never,
      _pickup_lng: (data.pickupLng ?? null) as never,
      _dest_lat: (data.destLat ?? null) as never,
      _dest_lng: (data.destLng ?? null) as never,
    });
    if (error) throw new Error("تعذر حساب الأجرة حالياً");
    const q = (quote ?? {}) as { km?: number; fare?: number; eta_minutes?: number };
    return {
      km: Number(q.km ?? 0),
      fare: Number(q.fare ?? 0),
      etaMinutes: Number(q.eta_minutes ?? 0),
    };
  });

/** إنشاء رحلة تكسي ثم توزيعها فوراً على أقرب سائق مناسب. */
export const createTaxiTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateTripInput) => data)
  .handler(async ({ data, context }) => {
    const { data: trip, error } = await context.supabase.rpc("create_taxi_trip", {
      _taxi_class: data.taxiClass as never,
      _pickup_text: (data.pickupText ?? "").trim(),
      _pickup_lat: (data.pickupLat ?? null) as never,
      _pickup_lng: (data.pickupLng ?? null) as never,
      _destination_text: (data.destinationText ?? "").trim(),
      _dest_lat: (data.destLat ?? null) as never,
      _dest_lng: (data.destLng ?? null) as never,
      _passengers: data.passengers ?? 1,
      ...(data.notes ? { _notes: data.notes } : {}),
    });
    if (error || !trip) throw new Error(friendly(error?.message ?? ""));

    try {
      const { runTripDispatch } = await import("@/lib/taxi.server");
      await runTripDispatch(trip.id);
    } catch {
      /* تلتقطه الصيانة الدورية */
    }

    return {
      id: trip.id,
      code: trip.code,
      status: trip.status,
      fare: Number(trip.fare),
      distanceKm: Number(trip.distance_km),
    };
  });

/** رد السائق على عرض الرحلة: قبول ذري أو رفض ثم إعادة التوزيع لسائق آخر. */
export const respondToTripOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { offerId: string; accept: boolean; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    if (data.accept) {
      const { data: trip, error } = await context.supabase.rpc("accept_trip_offer", {
        _offer_id: data.offerId,
      });
      if (error || !trip) {
        const m = error?.message ?? "";
        if (m.includes("trip_already_assigned")) throw new Error("الرحلة انسندت لسائق آخر");
        if (m.includes("offer_expired")) throw new Error("انتهت مهلة العرض");
        if (m.includes("offer_not_active")) throw new Error("العرض لم يعد متاحاً");
        throw new Error("تعذر قبول الرحلة");
      }
      return { ok: true, accepted: true, tripId: trip.id };
    }

    const { data: tripId, error } = await context.supabase.rpc("reject_trip_offer", {
      _offer_id: data.offerId,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error("تعذر رفض العرض");

    if (tripId) {
      try {
        const { runTripDispatch } = await import("@/lib/taxi.server");
        await runTripDispatch(tripId as string);
      } catch {
        /* تلتقطه الصيانة الدورية */
      }
    }
    return { ok: true, accepted: false };
  });

/** تغيير حالة الرحلة عبر قواعد الانتقال في قاعدة البيانات فقط. */
export const changeTripStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tripId: string; status: string; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: trip, error } = await context.supabase.rpc("change_trip_status", {
      _trip_id: data.tripId,
      _new_status: data.status as never,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error || !trip) {
      const m = error?.message ?? "";
      if (m.includes("transition_not_allowed"))
        throw new Error("هذا التغيير غير مسموح بهذه المرحلة");
      if (m.includes("forbidden")) throw new Error("ما عندك صلاحية على هذه الرحلة");
      throw new Error("تعذر تحديث حالة الرحلة");
    }
    return { id: trip.id, status: trip.status };
  });

/** تقييم السائق بعد اكتمال الرحلة — مرة واحدة فقط. */
export const rateTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tripId: string; stars: number; comment?: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("rate_trip", {
      _trip_id: data.tripId,
      _stars: data.stars,
      ...(data.comment ? { _comment: data.comment } : {}),
    });
    if (error) {
      const m = error.message ?? "";
      if (m.includes("already_rated")) throw new Error("قيّمت هذه الرحلة مسبقاً");
      if (m.includes("trip_not_completed")) throw new Error("التقييم بعد انتهاء الرحلة فقط");
      if (m.includes("invalid_stars")) throw new Error("اختر تقييماً من 1 إلى 5");
      throw new Error("تعذر حفظ التقييم");
    }
    return { ok: true };
  });

/** تقديم طلب انضمام كسائق/مندوب — يُسجّل بحالة قيد المراجعة فقط. */
export const applyAsDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      workerKind: "delivery" | "taxi";
      cityId?: string | null;
      vehicleMake?: string | null;
      vehicleModel?: string | null;
      vehicleColor?: string | null;
      plateNumber?: string | null;
      taxiClass?: string | null;
      taxiSeats?: number | null;
      vehicleType?: string | null;
      phone?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: worker, error } = await context.supabase.rpc("apply_as_driver", {
      _worker_kind: data.workerKind as never,
      _taxi_seats: data.taxiSeats ?? 4,
      ...(data.cityId ? { _city_id: data.cityId } : {}),
      ...(data.vehicleMake ? { _vehicle_make: data.vehicleMake } : {}),
      ...(data.vehicleModel ? { _vehicle_model: data.vehicleModel } : {}),
      ...(data.vehicleColor ? { _vehicle_color: data.vehicleColor } : {}),
      ...(data.plateNumber ? { _plate_number: data.plateNumber } : {}),
      ...(data.taxiClass ? { _taxi_class: data.taxiClass as never } : {}),
      ...(data.vehicleType ? { _vehicle_type: data.vehicleType as never } : {}),
      ...(data.phone ? { _phone: data.phone } : {}),
    });
    if (error || !worker) {
      const m = error?.message ?? "";
      if (m.includes("already_approved")) throw new Error("عندك حساب سائق معتمد أصلاً");
      if (m.includes("missing_taxi_class")) throw new Error("اختر فئة المركبة");
      throw new Error("تعذر إرسال طلب الانضمام");
    }
    return { ok: true };
  });

/** اعتماد أو تعليق سائق — للإدارة فقط، والتحقق داخل قاعدة البيانات. */
export const setDriverApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; approve: boolean; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_worker_approval", {
      _user_id: data.userId,
      _approve: data.approve,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) {
      if ((error.message ?? "").includes("forbidden")) throw new Error("غير مصرح");
      throw new Error("تعذر تحديث حالة السائق");
    }
    return { ok: true };
  });

/** إعادة توزيع رحلة متعثرة — للإدارة فقط. */
export const redispatchTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tripId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("غير مصرح");
    const { runTripDispatch } = await import("@/lib/taxi.server");
    return runTripDispatch(data.tripId);
  });
