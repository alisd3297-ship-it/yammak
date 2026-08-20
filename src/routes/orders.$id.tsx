import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, StatusDot } from "@/components/app-shell";
import {
  CUSTOMER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  formatIQD,
  statusTone,
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

function OrderTrackPage() {
  const { id } = Route.useParams();

  const { data } = useQuery({
    queryKey: ["order", id],
    refetchInterval: 10_000,
    queryFn: async () => {
      const [order, items] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, code, status, total, subtotal, delivery_fee, dropoff_text, notes, created_at, providers(name, phone), driver_id",
          )
          .eq("id", id)
          .maybeSingle(),
        supabase.from("order_items").select("id, name, quantity, unit_price").eq("order_id", id),
      ]);
      return { order: order.data, items: items.data ?? [] };
    },
  });

  const order = data?.order;
  const status = (order?.status ?? "pending") as OrderStatus;
  const activeIndex = CUSTOMER_STATUS_FLOW.indexOf(status);
  const provider = order?.providers as { name: string; phone: string | null } | null;

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
            {CUSTOMER_STATUS_FLOW.map((s, i) => {
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
        </section>

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
