import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bike, ClipboardList, Store, Users, Wallet } from "lucide-react";
import { AdminNav, PageShell, StatusDot } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireStaff } from "@/lib/route-guards";
import { getAdminReport } from "@/lib/admin.functions";
import { ORDER_STATUS_LABELS, formatIQD, statusTone, type OrderStatus } from "@/lib/orders";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "لوحة الإدارة | لبابك" },
      {
        name: "description",
        content: "نظرة سريعة على الطلبات والمستخدمين والتجار والمندوبين والمبيعات وآخر النشاطات في لبابك.",
      },
      { property: "og:title", content: "لوحة الإدارة | لبابك" },
      { property: "og:description", content: "إحصاءات المنصة وآخر الطلبات في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminHomePage,
});

function AdminHomePage() {
  const loadReport = useServerFn(getAdminReport);

  const { data: report } = useQuery({
    queryKey: ["admin-report", 30],
    queryFn: () => loadReport({ data: { days: 30 } }),
    staleTime: 60_000,
  });

  const { data: counts } = useQuery({
    queryKey: ["admin-overview-counts"],
    staleTime: 60_000,
    queryFn: async () => {
      const head = { count: "exact" as const, head: true };
      const [users, providers, drivers, onlineDrivers, orders] = await Promise.all([
        supabase.from("profiles").select("id", head),
        supabase.from("providers").select("id", head),
        supabase.from("worker_profiles").select("user_id", head),
        supabase.from("worker_profiles").select("user_id", head).eq("is_available", true),
        supabase.from("orders").select("id", head),
      ]);
      return {
        users: users.count ?? 0,
        providers: providers.count ?? 0,
        drivers: drivers.count ?? 0,
        onlineDrivers: onlineDrivers.count ?? 0,
        orders: orders.count ?? 0,
      };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["admin-recent-orders"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, order_type, total, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const sales = report?.can_finance ? Number(report.totals.gross_sales ?? 0) : null;

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">لوحة الإدارة</h1>
        <p className="mt-1 text-sm opacity-90">مراقبة المنصة والتدخل عند الحاجة فقط.</p>
      </header>

      <AdminNav />

      <section className="grid grid-cols-2 gap-3 px-4 pt-5">
        <Card icon={ClipboardList} label="إجمالي الطلبات" value={String(counts?.orders ?? "—")} />
        <Card icon={Users} label="المستخدمون" value={String(counts?.users ?? "—")} />
        <Card icon={Store} label="التجار والمحلات" value={String(counts?.providers ?? "—")} />
        <Card
          icon={Bike}
          label="المندوبون"
          value={`${counts?.drivers ?? "—"}`}
          hint={counts ? `${counts.onlineDrivers} متصل الآن` : undefined}
        />
        <Card
          icon={Wallet}
          label="المبيعات (٣٠ يوم)"
          value={sales != null ? formatIQD(sales) : "—"}
          hint={report ? `${report.totals.orders} طلب` : undefined}
        />
        <Card
          icon={ClipboardList}
          label="طلبات نشطة"
          value={String(report?.totals.active ?? "—")}
          hint={report ? `${report.totals.cancelled} ملغى` : undefined}
        />
      </section>

      <section className="px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black">آخر الطلبات</h2>
          <Link to="/admin/orders" className="text-xs font-bold text-primary">
            كل الطلبات
          </Link>
        </div>
        <div className="space-y-2">
          {(recent ?? []).map((o) => (
            <Link
              key={o.id}
              to="/orders/$id"
              params={{ id: o.id }}
              className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-soft"
            >
              <div>
                <p className="font-bold">#{o.code}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("ar-IQ-u-nu-latn")} · {formatIQD(Number(o.total))}
                </p>
              </div>
              <span className="flex items-center gap-2 text-xs font-semibold">
                <StatusDot tone={statusTone(o.status as OrderStatus)} />
                {ORDER_STATUS_LABELS[o.status as OrderStatus]}
              </span>
            </Link>
          ))}
          {!recent?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو طلبات بعد.</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <Icon className="size-5 text-primary" />
      <p className="mt-2 text-xl font-black leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
