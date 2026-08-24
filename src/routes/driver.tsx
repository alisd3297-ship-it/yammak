import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, LogOut, MapPin, Navigation } from "lucide-react";
import { OPERATING_LOCATION_COORDS } from "@/lib/location";

import { supabase } from "@/integrations/supabase/client";
import { PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/lib/auth";
import { useSignOut } from "@/lib/sign-out";
import { respondToOffer } from "@/lib/dispatch.functions";
import { changeOrderStatus } from "@/lib/orders.functions";
import { vehicleLabel } from "@/lib/vehicles";
import { completeOrderStop } from "@/lib/special-delivery.functions";
import { changeTripStatus, respondToTripOffer } from "@/lib/taxi.functions";
import {
  TAXI_DRIVER_STEPS,
  TRIP_STATUS_LABELS,
  taxiClassLabel,
  tripTone,
  type TripStatus,
} from "@/lib/taxi";
import { ORDER_STATUS_LABELS, formatIQD, isCourierType, statusTone, type OrderStatus } from "@/lib/orders";

import { requireWorker } from "@/lib/route-guards";

export const Route = createFileRoute("/driver")({
  ssr: false,
  beforeLoad: requireWorker,
  // يسمح لإشعار عرض التوصيل بفتح الطلب الصحيح مباشرة داخل اللوحة
  validateSearch: (search: Record<string, unknown>): { order?: string } => {
    const order = search["order"];
    return typeof order === "string" && order ? { order } : {};
  },
  head: () => ({
    meta: [
      { title: "لوحة المندوب | لبابك" },
      { name: "description", content: "استلم عروض التوصيل القريبة منك وتابع مهامك اليومية في لبابك." },
      { property: "og:title", content: "لوحة المندوب | لبابك" },
      { property: "og:description", content: "عروض التوصيل والمهام النشطة." },
    ],
  }),
  component: DriverDashboard,
});

const DRIVER_STEPS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  driver_accepted: { next: "driver_heading_pickup", label: "متوجه للاستلام" },
  driver_heading_pickup: { next: "picked_up", label: "استلمت الطلب" },
  picked_up: { next: "on_the_way", label: "بالطريق للزبون" },
  on_the_way: { next: "delivered", label: "تم التسليم" },
};

function DriverDashboard() {
  const focusOrderId = Route.useSearch().order;
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const respond = useServerFn(respondToOffer);
  const setStatus = useServerFn(changeOrderStatus);
  const finishStop = useServerFn(completeOrderStop);
  const respondTrip = useServerFn(respondToTripOffer);
  const setTripStatus = useServerFn(changeTripStatus);

  const { data: worker } = useQuery({
    queryKey: ["worker-profile", account?.userId],
    enabled: !!account?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_profiles")
        .select("user_id, is_approved, is_available, worker_kind, rating, vehicle, taxi_class, taxi_seats, application_status, rejection_reason")
        .eq("user_id", account!.userId!)
        .maybeSingle();
      return data;
    },
  });

  const focusedOfferRef = useRef<HTMLElement | null>(null);

  const { data: offers } = useQuery({
    queryKey: ["driver-offers", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 8_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_offers")
        .select("id, order_id, distance_km, expires_at, status, orders(code, total, order_type, notes, pickup_text, dropoff_text, vehicle_type, cargo_description, cargo_weight_kg, scheduled_at)")
        .eq("driver_id", account!.userId!)
        .eq("status", "sent")
        .gt("expires_at", new Date().toISOString());
      return data ?? [];
    },
  });

  useEffect(() => {
    if (focusOrderId && focusedOfferRef.current)
      focusedOfferRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusOrderId, offers]);

  const { data: active } = useQuery({
    queryKey: ["driver-orders", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, total, order_type, notes, pickup_text, dropoff_text, dropoff_lat, dropoff_lng, vehicle_type, cargo_description, scheduled_at, order_stops(id, position, address_text, recipient_name, recipient_phone, notes, is_delivered)")
        .eq("driver_id", account!.userId!)
        .in("status", ["driver_accepted", "driver_heading_pickup", "picked_up", "on_the_way"]);
      return data ?? [];
    },
  });

  const isTaxi = worker?.worker_kind === "taxi";

  const { data: tripOffers } = useQuery({
    queryKey: ["driver-trip-offers", account?.userId],
    enabled: !!account?.userId && isTaxi,
    refetchInterval: 8_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("trip_offers")
        .select(
          "id, trip_id, distance_km, expires_at, trips(code, fare, taxi_class, passengers, pickup_text, destination_text, distance_km, notes)",
        )
        .eq("driver_id", account!.userId!)
        .eq("status", "sent")
        .gt("expires_at", new Date().toISOString());
      return data ?? [];
    },
  });

  const { data: activeTrips } = useQuery({
    queryKey: ["driver-trips", account?.userId],
    enabled: !!account?.userId && isTaxi,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("trips")
        .select(
          "id, code, status, fare, taxi_class, passengers, pickup_text, pickup_lat, pickup_lng, destination_text, destination_lat, destination_lng, notes, customer_id",
        )
        .eq("driver_id", account!.userId!)
        .in("status", ["driver_assigned", "driver_arriving", "driver_arrived", "in_progress"]);
      return data ?? [];
    },
  });



  // بث موقع المندوب أثناء التوفر.
  // ملاحظة مهمة: هذا تتبّع أثناء عمل التطبيق فقط — لا يوجد تتبّع خلفية حقيقي
  // في المتصفح ولا في غلاف Capacitor الحالي. لذلك نستعمل watchPosition + إعادة
  // البث فور عودة التطبيق للواجهة، وقاعدة البيانات تعتمد نضارة الموقع للتوزيع.
  useEffect(() => {
    if (!account?.userId || !worker?.is_available) return;

    const uid = account.userId;
    let warned = false;
    let lastSent = 0;
    let watchId: number | null = null;

    const send = async (lat: number, lng: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastSent < 20_000) return;
      lastSent = now;
      const { error } = await supabase.from("worker_locations").upsert({
        user_id: uid,
        lat,
        lng,
        is_online: true,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        lastSent = 0;
        if (!warned) {
          warned = true;
          toast.error("تعذر تحديث حالتك كمتاح، حدّث الصفحة أو تأكد من الاتصال");
        }
      }
    };

    // بديل عند تعذر GPS: نُعلن التوفر بإحداثيات منطقة التشغيل حتى لا يبقى المندوب
    // خارج التوزيع نهائياً (الموقع الدقيق يُحدَّث فور توفر إذن الموقع).
    const sendFallback = () => void send(OPERATING_LOCATION_COORDS.lat, OPERATING_LOCATION_COORDS.lng, true);

    const onError = () => {
      sendFallback();
      if (warned) return;
      warned = true;
      toast.error("تعذر قراءة موقعك، فعّل صلاحية الموقع حتى تصلك العروض القريبة");
    };

    const hasGeo = typeof navigator !== "undefined" && !!navigator.geolocation;

    const pushOnce = (force = false) => {
      if (!hasGeo) return sendFallback();
      return navigator.geolocation.getCurrentPosition(
        (pos) => void send(pos.coords.latitude, pos.coords.longitude, force),
        onError,
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    };

    pushOnce(true);
    if (hasGeo) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => void send(pos.coords.latitude, pos.coords.longitude),
        onError,
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 15_000 },
      );
    }


    // نبضة احتياطية عندما تكون الشاشة ظاهرة فقط (بدون حلقات في الخلفية)
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") pushOnce();
    }, 45_000);

    // عند عودة التطبيق من الخلفية: تحديث فوري للموقع حتى لا يُستبعد المندوب
    const onResume = () => {
      if (document.visibilityState === "visible") pushOnce(true);
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);

    return () => {
      if (watchId !== null && hasGeo) navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
    };
  }, [account?.userId, worker?.is_available]);

  // تنبيه المندوب لحظياً بالعروض الجديدة: اشتراك realtime على إشعاراته وعروضه،
  // مع تنبيه داخل التطبيق وإشعار جهاز عبر Notification API عندما يكون مسموحاً.
  useEffect(() => {
    const uid = account?.userId;
    if (!uid || typeof window === "undefined") return;

    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    const alert = (title: string, body: string, orderId: string | null) => {
      toast.info(title, { description: body || undefined });
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const n = new Notification(title, {
            body: body || title,
            icon: "/icon-192.png",
            ...(orderId ? { tag: orderId } : {}),
          });

          n.onclick = () => {
            window.focus();
            if (orderId) window.location.assign(`/orders/${orderId}`);
          };
        }
      } catch {
        // بعض المتصفحات تمنع الإشعارات، والتنبيه داخل التطبيق يكفي
      }
    };

    const channel = supabase
      .channel(`driver-alerts-${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as { title: string; body: string | null; order_id: string | null };
          alert(row.title, row.body ?? "", row.order_id ?? null);
          qc.invalidateQueries({ queryKey: ["driver-offers"] });
          qc.invalidateQueries({ queryKey: ["driver-trip-offers"] });
          qc.invalidateQueries({ queryKey: ["notifications-unread", uid] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "delivery_offers", filter: `driver_id=eq.${uid}` },
        () => qc.invalidateQueries({ queryKey: ["driver-offers"] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [account?.userId, qc]);



  async function toggleAvailable(value: boolean) {
    if (!account?.userId) return;
    await supabase.from("worker_profiles").update({ is_available: value }).eq("user_id", account.userId);
    if (!value)
      await supabase.from("worker_locations").update({ is_online: false }).eq("user_id", account.userId);
    qc.invalidateQueries({ queryKey: ["worker-profile"] });
  }

  async function answer(offerId: string, accept: boolean) {
    try {
      await respond({ data: accept ? { offerId, accept } : { offerId, accept, reason: "رفض المندوب" } });
      toast.success(accept ? "قبلت المهمة" : "تم رفض العرض");
      qc.invalidateQueries({ queryKey: ["driver-offers"] });
      qc.invalidateQueries({ queryKey: ["driver-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الرد على العرض");
      qc.invalidateQueries({ queryKey: ["driver-offers"] });
    }
  }

  async function completeStop(stopId: string) {
    try {
      await finishStop({ data: { stopId } });
      qc.invalidateQueries({ queryKey: ["driver-orders"] });
      toast.success("تم تحديث نقطة التسليم");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث النقطة");
    }
  }

  async function advance(orderId: string, next: OrderStatus) {
    try {
      await setStatus({ data: { orderId, status: next } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث حالة الطلب");
      return;
    }
    qc.invalidateQueries({ queryKey: ["driver-orders"] });
  }

  async function answerTrip(offerId: string, accept: boolean) {
    try {
      await respondTrip({
        data: accept ? { offerId, accept } : { offerId, accept, reason: "رفض السائق" },
      });
      toast.success(accept ? "قبلت الرحلة" : "تم رفض العرض");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الرد على العرض");
    }
    qc.invalidateQueries({ queryKey: ["driver-trip-offers"] });
    qc.invalidateQueries({ queryKey: ["driver-trips"] });
  }

  async function advanceTrip(tripId: string, next: TripStatus) {
    try {
      await setTripStatus({ data: { tripId, status: next } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث حالة الرحلة");
      return;
    }
    qc.invalidateQueries({ queryKey: ["driver-trips"] });
  }


  if (!account?.userId)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">هذه اللوحة للمندوبين المعتمدين.</p>
          <Link to="/auth" className="mt-3 inline-block font-semibold text-primary">
            تسجيل الدخول
          </Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black">لوحة المندوب</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/notifications"
              aria-label="الإشعارات"
              className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-semibold backdrop-blur transition hover:bg-primary-foreground/25"
            >
              <Bell className="size-4" />
              الإشعارات
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-semibold backdrop-blur transition hover:bg-primary-foreground/25"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="size-4" />
              خروج
            </button>
          </div>
        </div>


        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/15 px-4 py-3">
          <span className="text-sm font-semibold">
            {worker?.is_available ? "متاح لاستلام الطلبات" : "غير متاح"}
          </span>
          <Switch
            checked={!!worker?.is_available}
            disabled={!worker?.is_approved}
            onCheckedChange={toggleAvailable}
          />
        </div>
        <Link
          to="/driver-earnings"
          className="mt-3 inline-block rounded-full bg-primary-foreground/15 px-4 py-2 text-xs font-semibold backdrop-blur"
        >
          أرباحي والتسويات
        </Link>
      </header>

      <div className="space-y-5 px-4 py-5">
        {!worker && (
          <div className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ما عندك ملف سائق أو مندوب.{" "}
            <Link to="/join/driver" className="font-semibold text-primary">
              قدّم طلب انضمام الآن
            </Link>
          </div>
        )}
        {worker && !worker.is_approved && worker.application_status === "rejected" && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm">
            <p className="font-bold text-destructive">تم رفض طلب الانضمام كمندوب.</p>
            {worker.rejection_reason ? (
              <p className="mt-1 text-muted-foreground">السبب: {worker.rejection_reason}</p>
            ) : null}
            <Link to="/join/driver" className="mt-2 inline-block font-semibold text-primary">
              تعديل البيانات وإعادة التقديم
            </Link>
          </div>
        )}
        {worker && !worker.is_approved && worker.application_status !== "rejected" && (
          <div className="rounded-2xl bg-warning/15 p-4 text-sm">
            <p className="font-bold">بانتظار موافقة المدير</p>
            <p className="mt-1 text-muted-foreground">
              طلبك مسجّل بحالة «قيد المراجعة». ما راح توصلك طلبات ولا تقدر تفتح صلاحيات المندوب قبل الاعتماد.
            </p>
          </div>
        )}

        {!!offers?.length && (
          <section>
            <h2 className="mb-3 font-bold">عروض جديدة</h2>
            <div className="space-y-3">
              {offers.map((o) => {
                const ord = o.orders as {
                  code: string;
                  total: number;
                  order_type: string;
                  notes: string | null;
                  pickup_text: string | null;
                  dropoff_text: string | null;
                  vehicle_type: string | null;
                  cargo_description: string | null;
                  cargo_weight_kg: number | null;
                  scheduled_at: string | null;
                } | null;
                const focused = !!focusOrderId && o.order_id === focusOrderId;
                return (
                  <article
                    key={o.id}
                    id={`offer-${o.order_id}`}
                    ref={focused ? focusedOfferRef : undefined}
                    className={
                      focused
                        ? "rounded-2xl border-2 border-primary bg-primary/5 p-4 shadow-card ring-2 ring-primary/30"
                        : "rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-card"
                    }
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold">
                        {isCourierType(ord?.order_type) ? "طلب مندوب #" : "طلب #"}
                        {ord?.code}
                      </p>
                      <span className="text-sm font-bold text-primary">{formatIQD(Number(ord?.total ?? 0))}</span>
                    </div>
                    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Navigation className="size-3.5" /> يبعد {Number(o.distance_km ?? 0).toFixed(1)} كم
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">من: {ord?.pickup_text}</p>
                    <p className="text-xs text-muted-foreground">إلى: {ord?.dropoff_text}</p>
                    {ord?.vehicle_type && (
                      <p className="mt-1 text-xs font-semibold text-primary">
                        المركبة المطلوبة: {vehicleLabel(ord.vehicle_type)}
                        {ord.cargo_weight_kg ? ` · ${ord.cargo_weight_kg} كغم` : ""}
                      </p>
                    )}
                    {ord?.scheduled_at && (
                      <p className="text-xs text-muted-foreground">
                        الموعد: {new Date(ord.scheduled_at).toLocaleString("ar-IQ-u-nu-latn")}
                      </p>
                    )}
                    {ord?.cargo_description && (
                      <p className="text-xs text-muted-foreground">الحمولة: {ord.cargo_description}</p>
                    )}
                    {isCourierType(ord?.order_type) && ord?.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">الوصف: {ord.notes}</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button className="h-10 flex-1" onClick={() => answer(o.id, true)}>
                        قبول
                      </Button>
                      <Button variant="outline" className="h-10" onClick={() => answer(o.id, false)}>
                        رفض
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!!tripOffers?.length && (
          <section>
            <h2 className="mb-3 font-bold">عروض رحلات تكسي</h2>
            <div className="space-y-3">
              {tripOffers.map((o) => {
                const tr = o.trips as {
                  code: string;
                  fare: number;
                  taxi_class: string;
                  passengers: number;
                  pickup_text: string;
                  destination_text: string;
                  distance_km: number;
                  notes: string | null;
                } | null;
                return (
                  <article key={o.id} className="rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-card">
                    <div className="flex items-center justify-between">
                      <p className="font-bold">رحلة #{tr?.code}</p>
                      <span className="text-sm font-bold text-primary">{formatIQD(Number(tr?.fare ?? 0))}</span>
                    </div>
                    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Navigation className="size-3.5" /> يبعد {Number(o.distance_km ?? 0).toFixed(1)} كم عنك ·{" "}
                      طول الرحلة {Number(tr?.distance_km ?? 0).toFixed(1)} كم
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">من: {tr?.pickup_text}</p>
                    <p className="text-xs text-muted-foreground">إلى: {tr?.destination_text}</p>
                    <p className="mt-1 text-xs font-semibold text-primary">
                      {taxiClassLabel(tr?.taxi_class)} · {tr?.passengers} راكب
                    </p>
                    {tr?.notes && <p className="mt-1 text-xs text-muted-foreground">ملاحظات: {tr.notes}</p>}
                    <div className="mt-3 flex gap-2">
                      <Button className="h-10 flex-1" onClick={() => answerTrip(o.id, true)}>
                        قبول
                      </Button>
                      <Button variant="outline" className="h-10" onClick={() => answerTrip(o.id, false)}>
                        رفض
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!!activeTrips?.length && (
          <section>
            <h2 className="mb-3 font-bold">رحلتي الحالية</h2>
            <div className="space-y-3">
              {activeTrips.map((t) => {
                const step = TAXI_DRIVER_STEPS[t.status as TripStatus];
                return (
                  <article key={t.id} className="rounded-2xl bg-card p-4 shadow-soft">
                    <div className="flex items-center justify-between">
                      <p className="font-bold">رحلة #{t.code}</p>
                      <span className="text-sm font-bold text-primary">{formatIQD(Number(t.fare))}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <StatusDot tone={tripTone(t.status as TripStatus)} />
                      {TRIP_STATUS_LABELS[t.status as TripStatus]} · {taxiClassLabel(t.taxi_class)} ·{" "}
                      {t.passengers} راكب
                    </p>
                    <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" /> من: {t.pickup_text}
                    </p>
                    <p className="text-xs text-muted-foreground">إلى: {t.destination_text}</p>
                    {t.pickup_lat != null && (
                      <a
                        className="mt-1 inline-block text-xs font-semibold text-primary"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${
                          t.status === "in_progress" ? t.destination_lat : t.pickup_lat
                        },${t.status === "in_progress" ? t.destination_lng : t.pickup_lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        فتح الاتجاهات
                      </a>
                    )}
                    {t.notes && <p className="mt-1 text-xs text-muted-foreground">ملاحظات: {t.notes}</p>}
                    {step && (
                      <Button className="mt-3 h-10 w-full" onClick={() => advanceTrip(t.id, step.next)}>
                        {step.label}
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}


        <section>
          <h2 className="mb-3 font-bold">مهامي النشطة</h2>
          <div className="space-y-3">
            {(active ?? []).map((o) => {
              const step = DRIVER_STEPS[o.status as OrderStatus];
              return (
                <article key={o.id} className="rounded-2xl bg-card p-4 shadow-soft">
                  <div className="flex items-center justify-between">
                    <p className="font-bold">طلب #{o.code}</p>
                    <span className="text-sm font-bold text-primary">{formatIQD(Number(o.total))}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusDot tone={statusTone(o.status as OrderStatus)} />
                    {ORDER_STATUS_LABELS[o.status as OrderStatus]}
                  </p>
                  <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" /> {o.dropoff_text}
                  </p>
                  {o.dropoff_lat != null && (
                    <a
                      className="mt-1 inline-block text-xs font-semibold text-primary"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${o.dropoff_lat},${o.dropoff_lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      فتح الاتجاهات
                    </a>
                  )}
                  {o.vehicle_type && (
                    <p className="mt-1 text-xs font-semibold text-primary">
                      المركبة: {vehicleLabel(o.vehicle_type)}
                    </p>
                  )}
                  {!!(o.order_stops ?? []).length && (
                    <ul className="mt-3 space-y-2">
                      {[...(o.order_stops ?? [])]
                        .sort((a, b) => a.position - b.position)
                        .map((s, i) => (
                          <li key={s.id} className="rounded-xl bg-muted/60 p-3 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">النقطة {i + 1}</span>
                              {s.is_delivered ? (
                                <span className="text-success">تم التسليم</span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() => completeStop(s.id)}
                                >
                                  تم التسليم
                                </Button>
                              )}
                            </div>
                            <p className="mt-1">{s.address_text}</p>
                            {s.recipient_phone && (
                              <a href={`tel:${s.recipient_phone}`} className="text-primary">
                                {s.recipient_name ?? "اتصال بالمستلم"} · {s.recipient_phone}
                              </a>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                  {step && (
                    <Button className="mt-3 h-10 w-full" onClick={() => advance(o.id, step.next)}>
                      {step.label}
                    </Button>
                  )}
                </article>
              );
            })}
            {!active?.length && (
              <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو مهام حالياً.</p>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
