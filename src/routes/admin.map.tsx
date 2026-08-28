import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Bike, Package } from "lucide-react";
import { AdminNav, PageShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireStaff } from "@/lib/route-guards";
import { OPERATING_LOCATION_COORDS } from "@/lib/location";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders";
import { LOAD_LABELS, LOAD_TONES, useOrdersLoad } from "@/lib/delivery-zones";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/map")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "خريطة الطلبات | إدارة لبابك" },
      {
        name: "description",
        content: "خريطة تشغيلية لحظية لطلبات لبابك النشطة ومواقع المندوبين المتصلين ومؤشر الضغط.",
      },
      { property: "og:title", content: "خريطة الطلبات | إدارة لبابك" },
      { property: "og:description", content: "متابعة لحظية للطلبات والمندوبين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminMapPage,
});

const ACTIVE: OrderStatus[] = [
  "new",
  "awaiting_provider",
  "accepted",
  "ready_for_pickup",
  "searching_driver",
  "offered_to_driver",
  "driver_accepted",
  "driver_heading_pickup",
  "picked_up",
  "on_the_way",
];

function AdminMapPage() {
  const load = useOrdersLoad();

  const { data: orders } = useQuery({
    queryKey: ["admin-map-orders"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, order_type, dropoff_text, dropoff_lat, dropoff_lng, created_at")
        .in("status", ACTIVE)
        .order("created_at", { ascending: false })
        .limit(60);
      return data ?? [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["admin-map-drivers"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data } = await supabase
        .from("worker_locations")
        .select("user_id, lat, lng, is_online, updated_at")
        .eq("is_online", true)
        .gt("updated_at", since);
      return data ?? [];
    },
  });

  const points = (orders ?? []).filter((o) => o.dropoff_lat != null && o.dropoff_lng != null);
  const center = points[0]
    ? { lat: Number(points[0].dropoff_lat), lng: Number(points[0].dropoff_lng) }
    : OPERATING_LOCATION_COORDS;
  const delta = 0.06;
  const bbox = `${center.lng - delta},${center.lat - delta},${center.lng + delta},${center.lat + delta}`;
  const level = load.data?.level ?? "low";

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground">
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <MapIcon className="size-6" /> خريطة الطلبات
        </h1>
        <p className="mt-1 text-sm opacity-90">متابعة لحظية للطلبات النشطة والمندوبين المتصلين</p>
      </header>
      <AdminNav />

      <div className="space-y-4 px-4 py-5">
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={Package} label="طلبات نشطة" value={String(orders?.length ?? 0)} />
          <Stat icon={Bike} label="مندوبون متصلون" value={String(drivers?.length ?? 0)} />
          <div className={cn("rounded-2xl p-3 text-center text-xs font-bold", LOAD_TONES[level])}>
            <p className="text-lg">{load.data?.active ?? 0}</p>
            {LOAD_LABELS[level]}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <iframe
            title="خريطة الطلبات"
            className="h-72 w-full border-0"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.lat},${center.lng}`}
          />
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-bold">الطلبات النشطة</h2>
          {(orders ?? []).map((o) => (
            <div key={o.id} className="rounded-2xl bg-card p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{o.code}</p>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
                  {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {o.dropoff_text ?? "بدون عنوان تسليم"}
              </p>
            </div>
          ))}
          {!orders?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              ماكو طلبات نشطة حالياً.
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-3 text-center shadow-soft">
      <Icon className="mx-auto size-5 text-primary" />
      <p className="text-lg font-black">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
