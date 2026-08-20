import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MapPin, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/lib/auth";
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

export const Route = createFileRoute("/driver")({
  head: () => ({
    meta: [
      { title: "لوحة المندوب | يمّك" },
      { name: "description", content: "استلم عروض التوصيل القريبة منك وتابع مهامك اليومية في يمّك." },
      { property: "og:title", content: "لوحة المندوب | يمّك" },
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
  const { data: account } = useAccount();
  const qc = useQueryClient();
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
        .select("user_id, is_approved, is_available, worker_kind, rating, vehicle, taxi_class, taxi_seats")
        .eq("user_id", account!.userId!)
        .maybeSingle();
      return data;
    },
  });

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

  // بث موقع المندوب أثناء التوفر
  useEffect(() => {
    if (!account?.userId || !worker?.is_available || !navigator.geolocation) return;
    const push = () =>
      navigator.geolocation.getCurrentPosition((pos) => {
        void supabase.from("worker_locations").upsert({
          user_id: account.userId!,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          is_online: true,
          updated_at: new Date().toISOString(),
        });
      });
    push();
    const timer = setInterval(push, 30_000);
    return () => clearInterval(timer);
  }, [account?.userId, worker?.is_available]);

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
        <h1 className="text-2xl font-black">لوحة المندوب</h1>
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
      </header>

      <div className="space-y-5 px-4 py-5">
        {!worker && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ما عندك ملف مندوب. قدّم طلب انضمام وتواصل مع إدارة يمّك.
          </p>
        )}
        {worker && !worker.is_approved && (
          <p className="rounded-2xl bg-warning/15 p-4 text-sm">حسابك قيد المراجعة من الإدارة.</p>
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
                return (
                  <article key={o.id} className="rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-card">
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
                        الموعد: {new Date(ord.scheduled_at).toLocaleString("ar-IQ")}
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
