import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminNav, PageShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/lib/route-guards";
import { getAdminReport } from "@/lib/admin.functions";
import { ORDER_STATUS_LABELS, formatIQD, type OrderStatus } from "@/lib/orders";

export const Route = createFileRoute("/admin/reports")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "تقارير الإدارة | لبابك" },
      {
        name: "description",
        content:
          "إحصاءات الطلبات والمبيعات ورسوم التوصيل وأداء المزوّدين والمندوبين يومياً وأسبوعياً وشهرياً.",
      },
      { property: "og:title", content: "تقارير الإدارة | لبابك" },
      { property: "og:description", content: "لوحة إحصاءات وأداء منصة لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminReportsPage,
});

const PERIODS = [
  { days: 1, label: "اليوم" },
  { days: 7, label: "أسبوع" },
  { days: 30, label: "شهر" },
  { days: 90, label: "٣ أشهر" },
] as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function AdminReportsPage() {
  const load = useServerFn(getAdminReport);
  const [days, setDays] = useState<number>(7);

  const { data: report, isLoading } = useQuery({
    queryKey: ["admin-report", days],
    queryFn: () => load({ data: { days } }),
    staleTime: 60_000,
  });

  const money = (v: number | null | undefined) =>
    report?.can_finance && v != null ? formatIQD(Number(v)) : "—";

  /** عرض مبلغ بعملته دون خلط الدينار بالدولار. */
  const fmt = (v: number | string, currency: string) =>
    currency === "USD"
      ? `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })} $`
      : formatIQD(Number(v));

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">تقارير الإدارة</h1>
        <p className="mt-1 text-sm opacity-90">أرقام المنصة وأداء المزوّدين والمندوبين</p>
      </header>

      <AdminNav />

      <div className="mt-4 flex gap-2 px-4">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-xs font-semibold transition",
              days === p.days
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="px-4 py-6 text-sm text-muted-foreground">جاري حساب التقرير…</p>}

      {report && (
        <div className="space-y-5 px-4 py-5">
          {!report.can_finance && (
            <p className="rounded-2xl bg-warning/15 p-3 text-xs">
              البيانات المالية مخفية عن حسابك حسب صلاحياتك.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Stat label="عدد الطلبات" value={String(report.totals.orders)} />
            <Stat label="مكتملة" value={String(report.totals.completed)} />
            <Stat label="ملغاة" value={String(report.totals.cancelled)} />
            <Stat label="نشطة" value={String(report.totals.active)} />
            <Stat label="إجمالي المبيعات" value={money(report.totals.gross_sales)} />
            <Stat label="رسوم التوصيل" value={money(report.totals.delivery_fees)} />
            <Stat label="إجمالي الإيراد" value={money(report.totals.revenue)} />
            <Stat
              label="رحلات التكسي"
              value={`${report.trips.count}${report.can_finance && report.trips.fare != null ? ` · ${formatIQD(Number(report.trips.fare))}` : ""}`}
            />
          </div>

          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="mb-3 font-bold">الطلبات حسب الحالة</h2>
            {Object.keys(report.by_status).length === 0 ? (
              <p className="text-sm text-muted-foreground">ماكو بيانات بهذه الفترة.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {Object.entries(report.by_status).map(([status, count]) => (
                  <li key={status} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {ORDER_STATUS_LABELS[status as OrderStatus] ?? status}
                    </span>
                    <span className="font-semibold">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="mb-3 font-bold">الإحصاء اليومي</h2>
            {report.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">ماكو بيانات بهذه الفترة.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {report.daily.map((d) => (
                  <li key={d.day} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {new Date(d.day).toLocaleDateString("ar-IQ-u-nu-latn")}
                    </span>
                    <span className="font-semibold">
                      {d.orders} طلب
                      {report.can_finance && d.revenue != null
                        ? ` · ${formatIQD(Number(d.revenue))}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="mb-3 font-bold">أداء المزوّدين</h2>
            {report.providers.length === 0 ? (
              <p className="text-sm text-muted-foreground">ماكو بيانات بهذه الفترة.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {report.providers.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>
                      {p.name}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · تقييم {Number(p.rating).toFixed(1)}
                      </span>
                    </span>
                    <span className="font-semibold">
                      {p.orders} طلب
                      {report.can_finance && p.revenue != null
                        ? ` · ${formatIQD(Number(p.revenue))}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="mb-3 font-bold">أداء المندوبين</h2>
            {report.drivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">ماكو بيانات بهذه الفترة.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {report.drivers.map((d) => (
                  <li key={d.id} className="flex justify-between">
                    <span>
                      {d.name}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · تقييم {Number(d.rating).toFixed(1)}
                      </span>
                    </span>
                    <span className="font-semibold">
                      {d.delivered} تسليم · {d.cancelled} ملغى
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-card p-4 text-sm shadow-soft">
            <h2 className="mb-2 font-bold">طلبات الخدمات والمهن</h2>
            <p className="text-muted-foreground">
              {report.service_requests.count} طلب
              {report.can_finance && report.service_requests.amount != null
                ? ` · ${formatIQD(Number(report.service_requests.amount))}`
                : ""}
            </p>
          </section>

          {report.can_finance && report.finance_by_currency && (
            <section className="space-y-3">
              <h2 className="px-1 font-bold">الأرباح والتكاليف — كل عملة على حدة</h2>
              {report.finance_by_currency.length === 0 ? (
                <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-soft">
                  ماكو مبيعات مكتملة بهذه الفترة.
                </p>
              ) : (
                report.finance_by_currency.map((f) => (
                  <div key={f.currency} className="rounded-2xl bg-card p-4 shadow-soft">
                    <h3 className="mb-3 text-sm font-black">
                      {f.currency === "USD" ? "الدولار الأمريكي (USD)" : "الدينار العراقي (IQD)"}
                    </h3>
                    <ul className="space-y-1 text-sm">
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">المبيعات (سعر البيع)</span>
                        <span className="font-semibold">{fmt(f.sales, f.currency)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">التكاليف (منتجات وخدمات)</span>
                        <span className="font-semibold">{fmt(f.costs, f.currency)}</span>
                      </li>
                      <li className="flex justify-between border-t pt-1">
                        <span className="text-muted-foreground">الربح الإجمالي (بيع − تكلفة)</span>
                        <span className="font-bold">{fmt(f.gross_profit, f.currency)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">عمولة لبابك</span>
                        <span className="font-semibold">{fmt(f.commission, f.currency)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">رسوم التوصيل</span>
                        <span className="font-semibold">{fmt(f.delivery_fees, f.currency)}</span>
                      </li>
                      <li className="flex justify-between border-t pt-1">
                        <span className="text-muted-foreground">
                          صافي ربح لبابك (عمولة + توصيل)
                        </span>
                        <span className="font-black">{fmt(f.platform_net, f.currency)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">
                          صافي ربح المزوّد (بعد العمولة)
                        </span>
                        <span className="font-semibold">{fmt(f.provider_net, f.currency)}</span>
                      </li>
                    </ul>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      التكلفة محسوبة على {f.cost_known_items} من أصل {f.items} صنف/خدمة (بدون تكلفة
                      مسجّلة = غير محتسبة). لا يتم جمع الدينار مع الدولار في أي إجمالي.
                    </p>
                  </div>
                ))
              )}
            </section>
          )}

          {report.can_finance && report.payments_by_currency && (
            <section className="rounded-2xl bg-card p-4 shadow-soft">
              <h2 className="mb-3 font-bold">المدفوعات حسب العملة</h2>
              {report.payments_by_currency.length === 0 ? (
                <p className="text-sm text-muted-foreground">ماكو مدفوعات بهذه الفترة.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {report.payments_by_currency.map((c) => (
                    <li key={c.currency} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {c.currency} · {c.count} عملية
                      </span>
                      <span className="font-semibold">
                        {Number(c.net).toLocaleString("en-US")} {c.currency}
                        {Number(c.refunded) > 0
                          ? ` (مسترجع ${Number(c.refunded).toLocaleString("en-US")})`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {report.refunds && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  الاستردادات: ناجحة {report.refunds.succeeded} · قيد التنفيذ{" "}
                  {report.refunds.pending} · تحتاج معالجة يدوية {report.refunds.manual_required} ·
                  فاشلة {report.refunds.failed}
                </p>
              )}
            </section>
          )}

          {report.can_finance && report.ads_by_currency && report.ads_by_currency.length > 0 && (
            <section className="rounded-2xl bg-card p-4 shadow-soft">
              <h2 className="mb-3 font-bold">الإعلانات حسب العملة</h2>
              <ul className="space-y-1 text-sm">
                {report.ads_by_currency.map((c) => (
                  <li key={c.currency} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {c.currency} · {c.count} إعلان
                    </span>
                    <span className="font-semibold">
                      {Number(c.amount).toLocaleString("en-US")} {c.currency}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-[11px] text-muted-foreground">
            أرقام الطلبات بالدينار العراقي. المدفوعات والإعلانات معروضة منفصلة لكل عملة ولا تُجمع مع
            بعضها.
          </p>
        </div>
      )}
    </PageShell>
  );
}
