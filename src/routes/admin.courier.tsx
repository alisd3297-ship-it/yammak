import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/auth";
import { assignDriverManually } from "@/lib/dispatch.functions";
import { changeOrderStatus } from "@/lib/orders.functions";
import { ORDER_STATUS_LABELS, formatIQD, statusTone, type OrderStatus } from "@/lib/orders";
import { vehicleLabel } from "@/lib/vehicles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/courier")({
  head: () => ({
    meta: [
      { title: "إدارة طلبات المندوب | يمّك" },
      {
        name: "description",
        content: "متابعة طلبات المندوب المستقل، تعيين مندوب يدوياً، وإلغاء الطلبات المتعثرة.",
      },
      { property: "og:title", content: "إدارة طلبات المندوب | يمّك" },
      { property: "og:description", content: "لوحة متابعة طلبات الإرسال والاستلام." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCourierPage,
});

const OPEN_STATUSES: OrderStatus[] = [
  "new",
  "searching_driver",
  "offered_to_driver",
  "driver_accepted",
  "driver_heading_pickup",
  "picked_up",
  "on_the_way",
  "delivered",
];

function AdminCourierPage() {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const assign = useServerFn(assignDriverManually);
  const setStatus = useServerFn(changeOrderStatus);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [kind, setKind] = useState<"courier" | "special_delivery">("courier");

  const isStaff = (account?.roles ?? []).some((r) => ["super_admin", "admin", "supervisor"].includes(r));

  const { data: orders } = useQuery({
    queryKey: ["admin-courier-orders", tab, kind],
    enabled: isStaff,
    refetchInterval: 20_000,
    queryFn: async () => {
      const query = supabase
        .from("orders")
        .select("id, code, status, total, pickup_text, dropoff_text, notes, driver_id, created_at, vehicle_type, cargo_description, scheduled_at, order_stops(id, position, address_text, is_delivered)")
        .eq("order_type", kind)
        .order("created_at", { ascending: false })
        .limit(50);
      const { data } =
        tab === "open"
          ? await query.in("status", OPEN_STATUSES)
          : await query.in("status", ["completed", "cancelled"]);
      return data ?? [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["admin-available-drivers"],
    enabled: isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_profiles")
        .select("user_id, vehicle, is_available")
        .eq("worker_kind", "delivery")
        .eq("is_approved", true)
        .limit(50);
      const ids = (data ?? []).map((d) => d.user_id);
      const { data: names } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] };
      return (data ?? []).map((d) => ({
        ...d,
        fullName: (names ?? []).find((n) => n.id === d.user_id)?.full_name ?? null,
      }));
    },
  });

  async function doAssign(orderId: string, driverId: string) {
    try {
      await assign({ data: { orderId, driverId } });
      toast.success("تم تعيين المندوب");
      qc.invalidateQueries({ queryKey: ["admin-courier-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تعيين المندوب");
    }
  }

  async function cancel(orderId: string) {
    try {
      await setStatus({ data: { orderId, status: "cancelled", reason: "إلغاء من الإدارة" } });
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["admin-courier-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إلغاء الطلب");
    }
  }

  if (!isStaff)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">هذه الصفحة لإدارة يمّك فقط.</p>
          <Link to="/" className="mt-3 inline-block font-semibold text-primary">
            الرئيسية
          </Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">التوصيل والمندوب المستقل</h1>
        <p className="mt-1 text-sm opacity-90">متابعة الإرسال والاستلام وتعيين المندوبين.</p>
        <Link to="/admin/providers" className="mt-3 inline-block text-sm font-semibold underline">
          اعتماد المزوّدين
        </Link>
      </header>

      <div className="space-y-4 px-4 py-5">
        <div className="flex gap-2">
          {(["courier", "special_delivery"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-semibold",
                kind === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              {k === "courier" ? "مندوب مستقل" : "توصيل خاص"}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {(["open", "closed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-semibold",
                tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {t === "open" ? "الطلبات النشطة" : "المنتهية"}
            </button>
          ))}
        </div>

        {!orders?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ما توجد طلبات هنا.</p>
        )}

        {(orders ?? []).map((o) => {
          const status = o.status as OrderStatus;
          return (
            <article key={o.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="font-bold">طلب #{o.code}</p>
                <span className="text-sm font-bold text-primary">{formatIQD(Number(o.total))}</span>
              </div>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <StatusDot tone={statusTone(status)} /> {ORDER_STATUS_LABELS[status]}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">من: {o.pickup_text}</p>
              <p className="text-xs text-muted-foreground">إلى: {o.dropoff_text}</p>
              {o.notes && <p className="mt-1 text-xs text-muted-foreground">الوصف: {o.notes}</p>}
              {o.vehicle_type && (
                <p className="mt-1 text-xs font-semibold text-primary">
                  المركبة: {vehicleLabel(o.vehicle_type)}
                  {o.scheduled_at ? ` · موعد ${new Date(o.scheduled_at).toLocaleString("ar-IQ")}` : ""}
                </p>
              )}
              {!!(o.order_stops ?? []).length && (
                <p className="mt-1 text-xs text-muted-foreground">
                  نقاط التسليم: {(o.order_stops ?? []).filter((s) => s.is_delivered).length} /{" "}
                  {(o.order_stops ?? []).length}
                </p>
              )}

              {tab === "open" && (
                <div className="mt-3 space-y-2">
                  {!o.driver_id && (
                    <select
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) void doAssign(o.id, e.target.value);
                      }}
                      aria-label="تعيين مندوب"
                    >
                      <option value="">تعيين مندوب يدوياً…</option>
                      {(drivers ?? []).map((d) => (
                        <option key={d.user_id} value={d.user_id}>
                          {d.fullName ?? d.user_id.slice(0, 8)} {d.is_available ? "· متاح" : "· غير متاح"}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button variant="outline" className="h-10 w-full" onClick={() => cancel(o.id)}>
                    إلغاء الطلب
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </PageShell>
  );
}
