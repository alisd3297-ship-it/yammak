import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp } from "lucide-react";
import { BackButton, PageShell, StatusDot } from "@/components/app-shell";
import { requireWorker } from "@/lib/route-guards";
import { useAccount } from "@/lib/auth";
import { getDriverEarnings, listMySettlements } from "@/lib/finance.functions";
import { formatIQD } from "@/lib/payments";
import {
  SETTLEMENT_STATUS_LABELS,
  endOfToday,
  settlementTone,
  startOfDaysAgo,
} from "@/lib/finance";
import { cn } from "@/lib/utils";
import { driverSummary, useDriverHistory } from "@/lib/driver-data";

export const Route = createFileRoute("/driver-earnings")({
  ssr: false,
  beforeLoad: requireWorker,
  head: () => ({
    meta: [
      { title: "أرباح المندوب | لبابك" },
      {
        name: "description",
        content:
          "أرباح المندوب من التوصيل والرحلات، المبالغ المصروفة والمستحقة والتسويات في لبابك.",
      },
      { property: "og:title", content: "أرباح المندوب | لبابك" },
      { property: "og:description", content: "أرباحك وتسوياتك بالتفصيل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriverEarningsPage,
});

const RANGES = [
  { days: 1, label: "اليوم" },
  { days: 7, label: "٧ أيام" },
  { days: 30, label: "٣٠ يوم" },
  { days: 90, label: "٩٠ يوم" },
] as const;

function DriverEarningsPage() {
  const { data: account } = useAccount();
  const [days, setDays] = useState<number>(7);
  const fetchEarnings = useServerFn(getDriverEarnings);
  const fetchSettlements = useServerFn(listMySettlements);

  const range = { from: startOfDaysAgo(days), to: endOfToday() };

  const { data, isLoading } = useQuery({
    queryKey: ["driver-earnings", days],
    queryFn: () => fetchEarnings({ data: range }),
  });

  const { data: history } = useDriverHistory();
  const summary = driverSummary(history);

  const { data: settlements } = useQuery({
    queryKey: ["driver-settlements", account?.userId],
    enabled: Boolean(account?.userId),
    queryFn: () =>
      fetchSettlements({ data: { partyType: "driver", partyId: account?.userId ?? "" } }),
  });

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/driver" label="لوحة المندوب" />
        <h1 className="text-2xl font-black">أرباحي</h1>
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
        <div className="grid grid-cols-3 gap-2">
          <Stat label="أرباح اليوم" value={formatIQD(summary.todayEarnings)} />
          <Stat label="توصيلات اليوم" value={String(summary.todayCount)} />
          <Stat label="أرباح الأسبوع" value={formatIQD(summary.weekEarnings)} />
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}

        {data && (
          <>
            <div className="rounded-2xl bg-card p-5 shadow-soft">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="size-4 text-primary" /> إجمالي الأرباح
              </span>
              <p className="mt-1 text-3xl font-black">{formatIQD(data.total)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="طلبات موصّلة" value={String(data.orders.count)} />
              <Stat label="أجور توصيل" value={formatIQD(data.orders.delivery_fees ?? 0)} />
              <Stat label="رحلات تكسي" value={String(data.trips.count)} />
              <Stat label="أجور الرحلات" value={formatIQD(data.trips.fares ?? 0)} />
              <Stat label="مصروف لك" value={formatIQD(data.paid_out ?? 0)} />
              <Stat label="مستحق بانتظار التسوية" value={formatIQD(data.pending_settlement ?? 0)} />
            </div>

            {!!data.daily?.length && (
              <section>
                <h2 className="mb-2 text-sm font-black">اليومي</h2>
                <div className="space-y-2">
                  {data.daily.map((d) => (
                    <div
                      key={d.day}
                      className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 text-sm shadow-soft"
                    >
                      <span className="text-muted-foreground">
                        {new Date(d.day).toLocaleDateString("ar-IQ-u-nu-latn")}
                      </span>
                      <span className="font-bold">{formatIQD(d.amount ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <section>
          <h2 className="mb-2 text-sm font-black">سجل المهام المكتملة</h2>
          {!history?.length && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
              ماكو مهام مكتملة هذا الأسبوع.
            </p>
          )}
          <div className="space-y-2">
            {history?.map((h) => (
              <article
                key={h.id}
                className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-soft"
              >
                <div>
                  <p className="text-sm font-bold">طلب #{h.code}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(h.completed_at ?? h.updated_at).toLocaleString("ar-IQ-u-nu-latn")}
                  </p>
                </div>
                <span className="text-sm font-black text-primary">
                  {formatIQD(Number(h.delivery_fee ?? 0))}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-black">تسوياتي</h2>
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
                  {new Date(s.periodEnd).toLocaleDateString("ar-IQ-u-nu-latn")} · {s.itemsCount} بند
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
