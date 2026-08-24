import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PieChart } from "lucide-react";
import { BackButton, PageShell, StatusDot  } from "@/components/app-shell";
import { requireProvider } from "@/lib/route-guards";
import { useAccount } from "@/lib/auth";
import { getProviderFinance, listMySettlements } from "@/lib/finance.functions";
import { formatIQD } from "@/lib/payments";
import { SETTLEMENT_STATUS_LABELS, endOfToday, settlementTone, startOfDaysAgo } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/provider-finance")({
  ssr: false,
  beforeLoad: requireProvider,
  head: () => ({
    meta: [
      { title: "مالية النشاط | لبابك" },
      {
        name: "description",
        content: "مبيعات نشاطك، عمولة المنصة، الصافي المستحق والتسويات المصروفة في لبابك.",
      },
      { property: "og:title", content: "مالية النشاط | لبابك" },
      { property: "og:description", content: "مبيعاتك وعمولتك وصافيك بالتفصيل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProviderFinancePage,
});

const RANGES = [
  { days: 7, label: "٧ أيام" },
  { days: 30, label: "٣٠ يوم" },
  { days: 90, label: "٩٠ يوم" },
] as const;

function ProviderFinancePage() {
  const { data: account } = useAccount();
  const providerId = account?.provider?.id ?? "";
  const [days, setDays] = useState<number>(30);
  const fetchFinance = useServerFn(getProviderFinance);
  const fetchSettlements = useServerFn(listMySettlements);

  const { data, isLoading } = useQuery({
    queryKey: ["provider-finance", providerId, days],
    enabled: Boolean(providerId),
    queryFn: () =>
      fetchFinance({
        data: { providerId, from: startOfDaysAgo(days), to: endOfToday() },
      }),
  });

  const { data: settlements } = useQuery({
    queryKey: ["provider-settlements", providerId],
    enabled: Boolean(providerId),
    queryFn: () => fetchSettlements({ data: { partyType: "provider", partyId: providerId } }),
  });

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/provider" label="لوحة النشاط" />
        <h1 className="text-2xl font-black">مالية النشاط</h1>
        <p className="mt-1 text-sm opacity-90">كل المبالغ بالدينار العراقي</p>
        <div className="mt-4 flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold backdrop-blur",
                days === r.days ? "bg-primary-foreground text-primary" : "bg-primary-foreground/15",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-5 px-4 py-5">
        {!providerId && (
          <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
            ما لقينا نشاطاً مرتبطاً بحسابك.
          </p>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}

        {data && (
          <>
            <div className="rounded-2xl bg-card p-5 shadow-soft">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <PieChart className="size-4 text-primary" /> الصافي المستحق لك
              </span>
              <p className="mt-1 text-3xl font-black">{formatIQD(data.net ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                نسبة عمولة المنصة: {data.commission_percent ?? 0}%
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="طلبات مكتملة" value={String(data.orders_count ?? 0)} />
              <Stat label="مبيعات الطلبات" value={formatIQD(data.sales ?? 0)} />
              <Stat label="عمولة المنصة" value={formatIQD(data.commission ?? 0)} />
              <Stat label="خدمات مكتملة" value={String(data.services_count ?? 0)} />
              <Stat label="مبيعات الخدمات" value={formatIQD(data.services_sales ?? 0)} />
              <Stat label="مصروف لك" value={formatIQD(data.paid_out ?? 0)} />
            </div>
          </>
        )}

        <section>
          <h2 className="mb-2 text-sm font-black">التسويات</h2>
          {!settlements?.length && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
              ماكو تسويات لحد الآن.
            </p>
          )}
          <div className="space-y-2">
            {settlements?.map((s) => (
              <article key={s.id} className="rounded-2xl bg-card p-4 shadow-soft">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-bold">
                    <StatusDot tone={settlementTone(s.status)} />
                    {SETTLEMENT_STATUS_LABELS[s.status]}
                  </span>
                  <span className="font-black">{formatIQD(s.net)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(s.periodStart).toLocaleDateString("ar-IQ-u-nu-latn")} —{" "}
                  {new Date(s.periodEnd).toLocaleDateString("ar-IQ-u-nu-latn")} · مبيعات{" "}
                  {formatIQD(s.gross)} · عمولة {formatIQD(s.commission)}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}
