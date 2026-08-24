import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MapPin, Phone, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BackButton, PageShell, StatusDot  } from "@/components/app-shell";
import { PaymentPanel } from "@/components/payment-panel";
import { Button } from "@/components/ui/button";
import { changeOrderStatus } from "@/lib/orders.functions";
import {
  COURIER_STATUS_FLOW,
  CUSTOMER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  formatIQD,
  statusTone,
  isCourierType,
  type OrderStatus,
} from "@/lib/orders";
import { vehicleLabel } from "@/lib/vehicles";
import { cn } from "@/lib/utils";
import { requireSignedIn } from "@/lib/route-guards";
import { OrderRatingCard } from "@/components/order-rating";

export const Route = createFileRoute("/orders/$id")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "تتبع الطلب | لبابك" },
      { name: "description", content: "تابع حالة طلبك ومندوب التوصيل خطوة بخطوة في تطبيق لبابك." },
      { property: "og:title", content: "تتبع الطلب | لبابك" },
      { property: "og:description", content: "حالة الطلب والمندوب لحظة بلحظة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderTrackPage,
});

const TERMINAL: OrderStatus[] = ["delivered", "completed", "cancelled"];
const TRACKING_STATUSES: OrderStatus[] = [
  "driver_accepted",
  "driver_heading_pickup",
  "picked_up",
  "on_the_way",
];

function OrderTrackPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const setStatus = useServerFn(changeOrderStatus);

  const { data, isError, refetch } = useQuery({
    queryKey: ["order", id],
    // يتوقف الاستطلاع نهائياً عند الحالات النهائية (تسليم/إكمال/إلغاء)
    refetchInterval: (query) => {
      const s = query.state.data?.order?.status as OrderStatus | undefined;
      return s && TERMINAL.includes(s) ? false : 15_000;
    },
    queryFn: async () => {
      const [order, items, stops] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, code, status, order_type, total, subtotal, delivery_fee, pickup_text, dropoff_text, notes, created_at, vehicle_type, cargo_description, cargo_weight_kg, scheduled_at, providers(name, phone), provider_id, driver_id, admin_review_reason, requires_admin_approval, admin_approved_at",
          )
          .eq("id", id)
          .maybeSingle(),
        supabase.from("order_items").select("id, name, quantity, unit_price").eq("order_id", id),
        supabase
          .from("order_stops")
          .select("id, position, address_text, recipient_name, recipient_phone, notes, is_delivered")
          .eq("order_id", id)
          .order("position"),
      ]);
      return { order: order.data, items: items.data ?? [], stops: stops.data ?? [] };
    },
  });

  const order = data?.order;
  const status = (order?.status ?? "awaiting_provider") as OrderStatus;
  const courier = isCourierType(order?.order_type);
  const flow = courier ? COURIER_STATUS_FLOW : CUSTOMER_STATUS_FLOW;
  const activeIndex = flow.indexOf(status);
  const provider = order?.providers as { name: string; phone: string | null } | null;
  const driverId = order?.driver_id ?? null;
  const tracking = !!driverId && TRACKING_STATUSES.includes(status);

  // تحديث لحظي لحالة الطلب
  useEffect(() => {
    if (!order?.id || TERMINAL.includes(status)) return;
    const channel = supabase
      .channel(`order-${order.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${order.id}` },
        () => qc.invalidateQueries({ queryKey: ["order", id] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [order?.id, status, id, qc]);

  // موقع المندوب المعيّن لهذا الطلب فقط، ويتوقف عند انتهاء الطلب
  const { data: driverLoc } = useQuery({
    queryKey: ["driver-location", driverId],
    enabled: tracking,
    refetchInterval: tracking ? 15_000 : false,
    queryFn: async () => {
      const { data: loc } = await supabase
        .from("worker_locations")
        .select("lat, lng, updated_at, is_online")
        .eq("user_id", driverId!)
        .maybeSingle();
      return loc;
    },
  });

  useEffect(() => {
    if (!tracking || !driverId) return;
    const channel = supabase
      .channel(`driver-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "worker_locations",
          filter: `user_id=eq.${driverId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["driver-location", driverId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tracking, driverId, qc]);

  const navigate = useNavigate();

  async function confirmReceived() {
    try {
      await setStatus({ data: { orderId: id, status: "completed" } });
      toast.success("شكراً! تم إغلاق الطلب");
      qc.invalidateQueries({ queryKey: ["order", id] });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      if (raw.includes("phone_verification_required")) {
        toast.error("لازم تأكد رقم هاتفك قبل تأكيد الاستلام", {
          action: { label: "تأكيد الرقم", onClick: () => navigate({ to: "/verify-phone" }) },
        });
        return;
      }
      toast.error(raw || "تعذر تأكيد الاستلام");
    }
  }


  async function cancelOrder() {
    try {
      await setStatus({ data: { orderId: id, status: "cancelled", reason: "إلغاء من العميل" } });
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["order", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ما نكدر نلغي الطلب بهذه المرحلة");
    }
  }

  const canCancel = courier
    ? (["new", "searching_driver", "offered_to_driver", "driver_accepted"] as OrderStatus[]).includes(status)
    : (["new", "awaiting_provider", "accepted"] as OrderStatus[]).includes(status);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/orders" label="طلباتي" />
        <h1 className="text-2xl font-black">طلب #{order?.code ?? "..."}</h1>
        <p className="mt-1 flex items-center gap-2 text-sm opacity-90">
          <StatusDot tone={statusTone(status)} /> {ORDER_STATUS_LABELS[status]}
        </p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-4 font-bold">مراحل الطلب</h2>
          <ol className="space-y-3">
            {flow.map((s, i) => {
              const done = activeIndex >= i && activeIndex !== -1;
              return (
                <li key={s} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "size-3 rounded-full",
                      done ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  />
                  <span className={cn("text-sm", done ? "font-semibold" : "text-muted-foreground")}>
                    {ORDER_STATUS_LABELS[s]}
                  </span>
                </li>
              );
            })}
          </ol>
          {status === "cancelled" && (
            <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              تم إلغاء هذا الطلب.
            </p>
          )}
          {status === "completed" && (
            <p className="mt-3 rounded-xl bg-success/10 p-3 text-sm text-success">تم إكمال الطلب.</p>
          )}
          {status === "delivered" && (
            <Button className="mt-4 h-11 w-full" onClick={confirmReceived}>
              تأكيد الاستلام وإنهاء الطلب
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" className="mt-3 h-11 w-full" onClick={cancelOrder}>
              إلغاء الطلب
            </Button>
          )}
        </section>

        {order?.id && Number(order.total) > 0 && (
          <PaymentPanel subjectType="order" subjectId={order.id} amount={Number(order.total)} />
        )}

        {order?.id && (status === "completed" || status === "delivered") && (
          <OrderRatingCard
            orderId={order.id}
            providerId={order.provider_id}
            driverId={order.driver_id}
          />
        )}

        {tracking && (
          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="mb-2 flex items-center gap-2 font-bold">
              <Navigation className="size-4 text-primary" /> تتبع المندوب
            </h2>
            {driverLoc ? (
              <>
                <p className="text-sm text-muted-foreground">
                  الموقع الحالي: {driverLoc.lat.toFixed(4)}، {driverLoc.lng.toFixed(4)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  آخر تحديث: {new Date(driverLoc.updated_at).toLocaleTimeString("ar-IQ-u-nu-latn")}
                </p>
                <a
                  className="mt-2 inline-block text-xs font-semibold text-primary"
                  href={`https://www.google.com/maps/search/?api=1&query=${driverLoc.lat},${driverLoc.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  عرض على الخريطة
                </a>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">بانتظار تحديث موقع المندوب…</p>
            )}
          </section>
        )}

        {courier ? (
          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="mb-3 font-bold">تفاصيل الإرسال والاستلام</h2>
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <span className="block text-xs text-muted-foreground">نقطة الاستلام</span>
                {order?.pickup_text}
              </span>
            </p>
            <p className="mt-3 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <span className="block text-xs text-muted-foreground">نقطة التسليم</span>
                {order?.dropoff_text}
              </span>
            </p>
            {(data?.stops?.length ?? 0) > 1 && (
              <ul className="mt-3 space-y-2">
                {data!.stops.map((s, i) => (
                  <li key={s.id} className="rounded-xl bg-muted/60 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">النقطة {i + 1}</span>
                      <span className={s.is_delivered ? "text-xs text-success" : "text-xs text-muted-foreground"}>
                        {s.is_delivered ? "تم التسليم" : "بالانتظار"}
                      </span>
                    </div>
                    <p className="mt-1">{s.address_text}</p>
                    {s.recipient_name && (
                      <p className="text-xs text-muted-foreground">المستلم: {s.recipient_name}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {order?.vehicle_type && (
              <p className="mt-3 text-xs text-muted-foreground">
                المركبة المطلوبة: {vehicleLabel(order.vehicle_type)}
                {order.cargo_weight_kg ? ` · الوزن التقريبي ${order.cargo_weight_kg} كغم` : ""}
              </p>
            )}
            {order?.cargo_description && (
              <p className="mt-1 text-xs text-muted-foreground">الحمولة: {order.cargo_description}</p>
            )}
            {order?.scheduled_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                الموعد: {new Date(order.scheduled_at).toLocaleString("ar-IQ-u-nu-latn")}
              </p>
            )}
            {order?.notes && (
              <p className="mt-3 text-xs text-muted-foreground">الوصف والملاحظات: {order.notes}</p>
            )}
          </section>
        ) : (
        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 font-bold">{provider?.name}</h2>
          {provider?.phone && (
            <a href={`tel:${provider.phone}`} className="flex items-center gap-2 text-sm text-primary">
              <Phone className="size-4" /> {provider.phone}
            </a>
          )}
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" /> {order?.dropoff_text}
          </p>
          {order?.notes && <p className="mt-2 text-xs text-muted-foreground">ملاحظات: {order.notes}</p>}
        </section>
        )}

        <section className="rounded-2xl bg-card p-4 text-sm shadow-soft">
          <h2 className="mb-3 font-bold">تفاصيل الفاتورة</h2>
          {(data?.items ?? []).map((i) => (
            <div key={i.id} className="flex justify-between py-1">
              <span className="text-muted-foreground">
                {i.name} × {i.quantity}
              </span>
              <span>{formatIQD(Number(i.unit_price) * i.quantity)}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">التوصيل</span>
              <span>{formatIQD(Number(order?.delivery_fee ?? 0))}</span>
            </div>
            <div className="flex justify-between py-1 font-bold">
              <span>الإجمالي</span>
              <span>{formatIQD(Number(order?.total ?? 0))}</span>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
