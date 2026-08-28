import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav, PageShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/route-guards";
import { pushDeliveryStatus, pushReadiness } from "@/lib/push.functions";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/monitoring")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "مراقبة التشغيل | لبابك" },
      {
        name: "description",
        content: "تجميع أخطاء التطبيق ونجاح وفشل الطلبات وحالة الإشعارات مع فلترة حسب الفترة.",
      },
      { property: "og:title", content: "مراقبة التشغيل | لبابك" },
      { property: "og:description", content: "لوحة مراقبة الأخطاء والطلبات والإشعارات في لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminMonitoringPage,
});

const PERIODS = [
  { key: "24h", label: "آخر ٢٤ ساعة", hours: 24 },
  { key: "7d", label: "آخر ٧ أيام", hours: 24 * 7 },
  { key: "30d", label: "آخر ٣٠ يوم", hours: 24 * 30 },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

const SUCCESS_STATUSES = ["delivered", "completed"];
const FAILED_STATUSES = ["cancelled"];

const KIND_LABELS: Record<string, string> = {
  error: "خطأ في الواجهة",
  unhandled_rejection: "عملية فشلت بدون معالجة",
  network: "مشكلة اتصال",
  boundary: "انهيار شاشة",
};

function fmtDate(value: string) {
  return new Date(value).toLocaleString("ar-IQ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

/** جاهزية إشعارات الهاتف: إعداد FCM + أجهزة المناديب المسجّلة فعلياً. */
function PushReadinessPanel() {
  const cfg = useQuery({ queryKey: ["push-config"], queryFn: () => pushDeliveryStatus() });
  const stats = useQuery({ queryKey: ["push-readiness"], queryFn: () => pushReadiness() });

  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">جاهزية إشعارات الهاتف</h2>
      {cfg.data ? (
        cfg.data.configured ? (
          <p className="mt-2 text-xs font-semibold text-emerald-600">إعداد FCM مكتمل.</p>
        ) : (
          <p className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 p-2 text-xs font-semibold text-destructive">
            إشعارات الهاتف معطّلة: الأسرار الناقصة {cfg.data.missing.join("، ") || "غير محددة"}.
            أضفها من إعدادات المشروع ← Secrets.
          </p>
        )
      ) : null}
      {stats.data ? (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>
            أجهزة نشطة: {stats.data.devices.active} (أندرويد {stats.data.devices.android})
          </li>
          <li>
            مناديب توصيل بجهاز مسجّل: {stats.data.workers.delivery.withDevice} من{" "}
            {stats.data.workers.delivery.total}
          </li>
          <li>
            سائقو تكسي بجهاز مسجّل: {stats.data.workers.taxi.withDevice} من{" "}
            {stats.data.workers.taxi.total}
          </li>
          <li>
            دراجات بجهاز مسجّل: {stats.data.workers.bike.withDevice} من{" "}
            {stats.data.workers.bike.total}
          </li>
          <li>إشعارات بانتظار الإرسال للهاتف: {stats.data.pendingPush}</li>
        </ul>
      ) : null}
      <p className="mt-3 text-[11px] text-muted-foreground">
        رمز الجهاز يُسجَّل فقط عند فتح التطبيق المُثبّت على الهاتف (APK) والموافقة على إذن
        الإشعارات؛ المتصفح لا يسجّل جهازاً.
      </p>
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: "ok" | "bad" | "warn" | "info";
  icon: React.ReactNode;
}) {
  const tones = {
    ok: "text-emerald-600",
    bad: "text-destructive",
    warn: "text-amber-600",
    info: "text-primary",
  } as const;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className={cn("flex items-center gap-2 text-xs font-semibold", tones[tone])}>
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-black text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AdminMonitoringPage() {
  const [period, setPeriod] = useState<PeriodKey>("24h");
  const hours = PERIODS.find((p) => p.key === period)?.hours ?? 24;

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-monitoring", period],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 3600_000).toISOString();

      const [ordersRes, notificationsRes, errorsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, code, status, order_type, cancel_reason, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("notifications")
          .select("id, kind, is_read, pushed_at, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("app_error_logs")
          .select("id, kind, message, path, source, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (notificationsRes.error) throw notificationsRes.error;
      if (errorsRes.error) throw errorsRes.error;

      const orders = ordersRes.data ?? [];
      const notifications = notificationsRes.data ?? [];
      const errors = errorsRes.data ?? [];

      const success = orders.filter((o) => SUCCESS_STATUSES.includes(o.status)).length;
      const failed = orders.filter((o) => FAILED_STATUSES.includes(o.status)).length;
      const open = orders.length - success - failed;

      const byType = new Map<string, { total: number; success: number; failed: number }>();
      for (const o of orders) {
        const row = byType.get(o.order_type) ?? { total: 0, success: 0, failed: 0 };
        row.total += 1;
        if (SUCCESS_STATUSES.includes(o.status)) row.success += 1;
        if (FAILED_STATUSES.includes(o.status)) row.failed += 1;
        byType.set(o.order_type, row);
      }

      const cancelReasons = new Map<string, number>();
      for (const o of orders) {
        if (!FAILED_STATUSES.includes(o.status)) continue;
        const key = (o.cancel_reason ?? "غير محدد").slice(0, 80);
        cancelReasons.set(key, (cancelReasons.get(key) ?? 0) + 1);
      }

      const errorGroups = new Map<string, { count: number; kind: string; last: string }>();
      for (const e of errors) {
        const key = `${e.kind}|${e.message}`;
        const row = errorGroups.get(key) ?? { count: 0, kind: e.kind, last: e.created_at };
        row.count += 1;
        if (e.created_at > row.last) row.last = e.created_at;
        errorGroups.set(key, row);
      }

      return {
        orders: {
          total: orders.length,
          success,
          failed,
          open,
          byType: [...byType.entries()].sort((a, b) => b[1].total - a[1].total),
          cancelReasons: [...cancelReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
        },
        notifications: {
          total: notifications.length,
          pushed: notifications.filter((n) => n.pushed_at).length,
          read: notifications.filter((n) => n.is_read).length,
          byKind: [
            ...notifications
              .reduce(
                (map, n) => map.set(n.kind, (map.get(n.kind) ?? 0) + 1),
                new Map<string, number>(),
              )
              .entries(),
          ].sort((a, b) => b[1] - a[1]),
        },
        errors: {
          total: errors.length,
          groups: [...errorGroups.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 15)
            .map(([key, v]) => ({ message: key.split("|").slice(1).join("|"), ...v })),
          latest: errors.slice(0, 12),
        },
      };
    },
  });

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">مراقبة التشغيل</h1>
        <p className="mt-1 text-sm opacity-90">
          أخطاء التطبيق، نجاح وفشل الطلبات، وحالة الإشعارات — مجمّعة حسب الفترة.
        </p>
      </header>

      <AdminNav />

      <div className="mt-4 flex items-center gap-2 overflow-x-auto px-4">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold",
              period === p.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void refetch()}
          className="mr-auto whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold text-muted-foreground"
        >
          {isFetching ? "جارٍ التحديث…" : "تحديث"}
        </button>
      </div>

      <div className="space-y-5 px-4 pb-24 pt-4">
        {error ? (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            تعذّر تحميل بيانات المراقبة. تأكد من الاتصال وحاول مرة ثانية.
          </p>
        ) : null}

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">جارٍ تحميل البيانات…</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3">
              <StatCard
                label="طلبات ناجحة"
                value={data.orders.success}
                hint={`${pct(data.orders.success, data.orders.total)} من ${data.orders.total} طلب`}
                tone="ok"
                icon={<CheckCircle2 className="size-4" />}
              />
              <StatCard
                label="طلبات ملغاة"
                value={data.orders.failed}
                hint={`${pct(data.orders.failed, data.orders.total)} من الإجمالي`}
                tone="bad"
                icon={<XCircle className="size-4" />}
              />
              <StatCard
                label="أخطاء مسجّلة"
                value={data.errors.total}
                hint={`${data.errors.groups.length} نوع مختلف`}
                tone="warn"
                icon={<AlertTriangle className="size-4" />}
              />
              <StatCard
                label="إشعارات"
                value={data.notifications.total}
                hint={`مُرسلة للهاتف: ${data.notifications.pushed} · مقروءة: ${data.notifications.read}`}
                tone="info"
                icon={<BellRing className="size-4" />}
              />
            </section>

            <PushReadinessPanel />

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">الطلبات حسب الخدمة</h2>
              {data.orders.byType.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">لا توجد طلبات في هذه الفترة.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.orders.byType.map(([type, row]) => (
                    <li key={type} className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-foreground">{type}</span>
                      <span className="text-muted-foreground">
                        الإجمالي {row.total} · ناجحة {row.success} · ملغاة {row.failed} · نسبة
                        النجاح {pct(row.success, row.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                طلبات قيد التنفيذ الآن: {data.orders.open}
              </p>
            </section>

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">أسباب الإلغاء الأكثر تكراراً</h2>
              {data.orders.cancelReasons.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">لا توجد طلبات ملغاة.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.orders.cancelReasons.map(([reason, count]) => (
                    <li key={reason} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-foreground">{reason}</span>
                      <span className="font-bold text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">الإشعارات حسب النوع</h2>
              {data.notifications.byKind.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">لا توجد إشعارات في هذه الفترة.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.notifications.byKind.map(([kind, count]) => (
                    <li key={kind} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-foreground">{kind}</span>
                      <span className="font-bold text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">أكثر الأخطاء تكراراً</h2>
              {data.errors.groups.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  ما تم تسجيل أي خطأ في هذه الفترة.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.errors.groups.map((g) => (
                    <li key={`${g.kind}-${g.message}`} className="rounded-xl bg-muted/50 p-3">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{KIND_LABELS[g.kind] ?? g.kind}</span>
                        <span>
                          تكرار {g.count} · آخر مرة {fmtDate(g.last)}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-xs font-semibold text-foreground">
                        {g.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">آخر الأخطاء</h2>
              {data.errors.latest.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">لا يوجد شيء هنا.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.errors.latest.map((e) => (
                    <li key={e.id} className="text-xs">
                      <span className="text-muted-foreground">{fmtDate(e.created_at)}</span>{" "}
                      <span className="font-semibold text-foreground">{e.message}</span>
                      {e.path ? <span className="text-muted-foreground"> — {e.path}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
