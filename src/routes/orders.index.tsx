import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, PageShell, StatusDot } from "@/components/app-shell";
import { useAccount } from "@/lib/auth";
import { ORDER_STATUS_LABELS, formatIQD, statusTone, type OrderStatus } from "@/lib/orders";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "طلباتي | يمّك" },
      { name: "description", content: "تابع طلباتك الحالية والسابقة وحالتها لحظة بلحظة في يمّك." },
      { property: "og:title", content: "طلباتي | يمّك" },
      { property: "og:description", content: "متابعة الطلبات وحالاتها." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { data: account } = useAccount();

  const { data: orders } = useQuery({
    queryKey: ["my-orders", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, total, created_at, provider_id, providers(name)")
        .eq("customer_id", account!.userId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: trips } = useQuery({
    queryKey: ["my-trips", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, code, status, fare, taxi_class, pickup_text, destination_text, created_at")
        .eq("passenger_id", account!.userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });


  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">طلباتي</h1>
        <p className="mt-1 text-sm opacity-90">متابعة كل طلباتك بمكان واحد</p>
        <Link
          to="/service-requests"
          className="mt-3 inline-block rounded-full bg-white/15 px-4 py-2 text-xs font-semibold"
        >
          طلبات المهن والخدمات
        </Link>
      </header>

      <div className="space-y-3 px-4 py-5">
        {!account?.userId && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            سجّل دخولك حتى تشوف طلباتك.{" "}
            <Link to="/auth" className="font-semibold text-primary">
              تسجيل الدخول
            </Link>
          </p>
        )}
        {(orders ?? []).map((o) => (
          <Link
            key={o.id}
            to="/orders/$id"
            params={{ id: o.id }}
            className="block rounded-2xl bg-card p-4 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <p className="font-bold">
                {(o.providers as { name: string } | null)?.name ?? "طلب"} · #{o.code}
              </p>
              <span className="text-sm font-bold text-primary">{formatIQD(Number(o.total))}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <StatusDot tone={statusTone(o.status as OrderStatus)} />
              {ORDER_STATUS_LABELS[o.status as OrderStatus]}
            </div>
          </Link>
        ))}
        {account?.userId && !orders?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو طلبات لحد الآن.</p>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
