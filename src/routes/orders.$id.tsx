import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, MapPin, Phone, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, StatusDot } from "@/components/app-shell";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({
    meta: [
      { title: "تتبع الطلب | يمّك" },
      { name: "description", content: "تابع حالة طلبك ومندوب التوصيل خطوة بخطوة في تطبيق يمّك." },
      { property: "og:title", content: "تتبع الطلب | يمّك" },
      { property: "og:description", content: "حالة الطلب والمندوب لحظة بلحظة." },
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

  const { data } = useQuery({
    queryKey: ["order", id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const [order, items] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, code, status, order_type, total, subtotal, delivery_fee, pickup_text, dropoff_text, notes, created_at, providers(name, phone), driver_id",
          )
          .eq("id", id)
          .maybeSingle(),
        supabase.from("order_items").select("id, name, quantity, unit_price").eq("order_id", id),
      ]);
      return { order: order.data, items: items.data ?? [] };
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

  async function confirmReceived() {
    try {
      await setStatus({ data: { orderId: id, status: "completed" } });
      toast.success("شكراً! تم إغلاق الطلب");
      qc.invalidateQueries({ queryKey: ["order", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تأكيد الاستلام");
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
        <Link to="/orders" className="mb-3 inline-flex items-center gap-1 text-sm opacity-90">
          <ArrowRight className="size-4" /> طلباتي
        </Link>
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
                  آخر تحديث: {new Date(driverLoc.updated_at).toLocaleTimeString("ar-IQ")}
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
