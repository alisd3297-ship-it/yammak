import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BarChart3, Percent, Plus } from "lucide-react";
import { BackButton, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/lib/auth";
import { requireProvider } from "@/lib/route-guards";
import { formatIQD } from "@/lib/orders";
import { cn } from "@/lib/utils";
import {
  getProviderStats,
  listProviderPromotions,
  savePromotion,
  setPromotionActive,
} from "@/lib/provider-insights.functions";

export const Route = createFileRoute("/provider-insights")({
  ssr: false,
  beforeLoad: requireProvider,
  head: () => ({
    meta: [
      { title: "لوحة التاجر الذكية | لبابك" },
      {
        name: "description",
        content: "تابع مبيعاتك وأكثر منتجاتك طلباً وأدر عروضك الترويجية من مكان واحد.",
      },
      { property: "og:title", content: "لوحة التاجر الذكية | لبابك" },
      { property: "og:description", content: "إحصاءات المبيعات وإدارة العروض." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderInsightsPage,
});

const RANGES = [
  { days: 7, label: "٧ أيام" },
  { days: 30, label: "٣٠ يوم" },
  { days: 90, label: "٩٠ يوم" },
];

function ProviderInsightsPage() {
  const { data: account } = useAccount();
  const providerId = account?.provider?.id ?? null;
  const qc = useQueryClient();
  const statsFn = useServerFn(getProviderStats);
  const promosFn = useServerFn(listProviderPromotions);
  const saveFn = useServerFn(savePromotion);
  const toggleFn = useServerFn(setPromotionActive);

  const [days, setDays] = useState(30);
  const [title, setTitle] = useState("");
  const [discount, setDiscount] = useState("10");
  const [busy, setBusy] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["provider-stats", providerId, days],
    enabled: !!providerId,
    queryFn: () => statsFn({ data: { providerId: providerId!, days } }),
  });

  const { data: promos } = useQuery({
    queryKey: ["provider-promos", providerId],
    enabled: !!providerId,
    queryFn: () => promosFn({ data: { providerId: providerId! } }),
  });

  async function addPromo() {
    if (!providerId || busy) return;
    setBusy(true);
    try {
      await saveFn({
        data: { providerId, title, discountPercent: Number(discount) || 0 },
      });
      toast.success("تم نشر العرض");
      setTitle("");
      void qc.invalidateQueries({ queryKey: ["provider-promos", providerId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ العرض");
    } finally {
      setBusy(false);
    }
  }

  const maxRevenue = Math.max(1, ...(stats?.daily ?? []).map((d) => Number(d.revenue)));

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/provider" label="لوحة المتجر" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <BarChart3 className="size-6" /> لوحة ذكية
        </h1>
        <p className="mt-1 text-sm opacity-90">مبيعاتك وعروضك بنظرة واحدة</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-bold",
                days === r.days ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <section className="grid grid-cols-2 gap-3">
          <StatCard label="مبيعات مكتملة" value={formatIQD(Number(stats?.revenue ?? 0))} />
          <StatCard label="متوسط الطلب" value={formatIQD(Number(stats?.avg_ticket ?? 0))} />
          <StatCard label="طلبات مكتملة" value={String(stats?.orders_completed ?? 0)} />
          <StatCard label="طلبات ملغاة" value={String(stats?.orders_cancelled ?? 0)} tone="danger" />
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 font-bold">المبيعات اليومية</h2>
          {stats?.daily?.length ? (
            <div className="flex h-32 items-end gap-1">
              {stats.daily.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${(Number(d.revenue) / maxRevenue) * 100}%` }}
                    title={`${d.day}: ${formatIQD(Number(d.revenue))}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">ما توجد بيانات ضمن هذه الفترة.</p>
          )}
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 font-bold">الأكثر طلباً</h2>
          <div className="space-y-2">
            {(stats?.top_products ?? []).map((p) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 font-bold">
                  {p.quantity} · {formatIQD(Number(p.revenue))}
                </span>
              </div>
            ))}
            {!stats?.top_products?.length && (
              <p className="text-sm text-muted-foreground">لا توجد مبيعات بعد.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <Percent className="size-4 text-primary" /> عروضي الترويجية
          </h2>
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان العرض"
              className="h-11 flex-1"
              aria-label="عنوان العرض"
            />
            <Input
              type="number"
              min={0}
              max={90}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="h-11 w-20"
              aria-label="نسبة الخصم"
            />
            <Button className="h-11 px-4" onClick={() => void addPromo()} disabled={busy}>
              <Plus className="size-4" />
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {(promos ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{p.title}</p>
                  <p className="text-xs text-muted-foreground">خصم {p.discountPercent}%</p>
                </div>
                <Button
                  variant={p.isActive ? "outline" : "default"}
                  className="h-9 px-3 text-xs"
                  onClick={async () => {
                    await toggleFn({ data: { id: p.id, isActive: !p.isActive } });
                    void qc.invalidateQueries({ queryKey: ["provider-promos", providerId] });
                  }}
                >
                  {p.isActive ? "إيقاف" : "تفعيل"}
                </Button>
              </div>
            ))}
            {!promos?.length && (
              <p className="text-sm text-muted-foreground">ما عندك عروض منشورة.</p>
            )}
          </div>
        </section>

        <Link to="/provider-finance" className="block text-center text-sm font-bold text-primary">
          التقارير المالية التفصيلية
        </Link>
      </div>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-black", tone === "danger" && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}
