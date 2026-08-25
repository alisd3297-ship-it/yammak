import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminNav, PageShell, StatusDot } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/lib/route-guards";
import { ORDER_STATUS_LABELS, formatIQD, statusTone, type OrderStatus } from "@/lib/orders";

export const Route = createFileRoute("/admin/orders")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "مراقبة الطلبات | لبابك" },
      {
        name: "description",
        content: "عرض جميع طلبات لبابك مع البحث والتصفية حسب الحالة والنوع وتتبع حالة كل طلب.",
      },
      { property: "og:title", content: "مراقبة الطلبات | لبابك" },
      { property: "og:description", content: "متابعة الطلبات وحالاتها للإدارة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOrdersPage,
});

/** مجموعات الحالات المعتمدة: جديد → مقبول → جاهز → استلام/توصيل → مكتمل. */
const STATUS_GROUPS = [
  { key: "all", label: "الكل", statuses: [] as OrderStatus[] },
  { key: "new", label: "جديد", statuses: ["new", "awaiting_provider"] as OrderStatus[] },
  { key: "accepted", label: "مقبول", statuses: ["accepted", "preparing"] as OrderStatus[] },
  { key: "ready", label: "جاهز", statuses: ["ready_for_pickup", "searching_driver", "offered_to_driver"] as OrderStatus[] },
  {
    key: "delivery",
    label: "استلام/توصيل",
    statuses: ["driver_accepted", "driver_heading_pickup", "picked_up", "on_the_way", "delivered"] as OrderStatus[],
  },
  { key: "completed", label: "مكتمل", statuses: ["completed"] as OrderStatus[] },
  { key: "cancelled", label: "ملغى", statuses: ["cancelled"] as OrderStatus[] },
] as const;

const TYPES = [
  { key: "all", label: "كل الأنواع" },
  { key: "restaurant", label: "مطاعم" },
  { key: "store", label: "محلات وسوبر ماركت" },
  { key: "courier", label: "مندوب مستقل" },
  { key: "special_delivery", label: "توصيل خاص" },
  { key: "profession", label: "مهن وخدمات" },
  { key: "taxi", label: "تكسي" },
] as const;

function AdminOrdersPage() {
  const [group, setGroup] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders", group, type],
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, code, status, order_type, fulfillment, total, delivery_fee, created_at, dropoff_text")
        .order("created_at", { ascending: false })
        .limit(120);
      const statuses = STATUS_GROUPS.find((g) => g.key === group)?.statuses ?? [];
      if (statuses.length) q = q.in("status", statuses);
      if (type !== "all") q = q.eq("order_type", type as never);
      const { data } = await q;
      return data ?? [];
    },
  });

  const term = search.trim().toLowerCase();
  const rows = (orders ?? []).filter(
    (o) =>
      !term ||
      o.code.toLowerCase().includes(term) ||
      (o.dropoff_text ?? "").toLowerCase().includes(term),
  );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">الطلبات</h1>
        <p className="mt-1 text-sm opacity-90">مراقبة كل الطلبات وتتبع حالتها بدون موافقة إدارية إجبارية.</p>
      </header>

      <AdminNav />

      <div className="px-4 pt-4">
        <Input
          className="h-11"
          placeholder="ابحث برمز الطلب أو العنوان"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-3 overflow-x-auto px-4">
        <div className="flex gap-2">
          {STATUS_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold",
                group === g.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 overflow-x-auto px-4">
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold",
                type === t.key ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 px-4 py-5">
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && !rows.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو طلبات بهذي التصفية.</p>
        )}
        {rows.map((o) => (
          <Link
            key={o.id}
            to="/orders/$id"
            params={{ id: o.id }}
            className="block rounded-2xl bg-card p-4 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <p className="font-bold">#{o.code}</p>
              <span className="flex items-center gap-2 text-xs font-semibold">
                <StatusDot tone={statusTone(o.status as OrderStatus)} />
                {ORDER_STATUS_LABELS[o.status as OrderStatus]}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {TYPES.find((t) => t.key === o.order_type)?.label ?? o.order_type} ·{" "}
              {new Date(o.created_at).toLocaleString("ar-IQ-u-nu-latn")}
            </p>
            <p className="mt-1 text-sm font-semibold">{formatIQD(Number(o.total))}</p>
            {o.dropoff_text ? (
              <p className="mt-1 text-xs text-muted-foreground">{o.dropoff_text}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
