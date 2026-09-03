import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BellRing, CheckCircle2, RefreshCw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminNav, PageShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/route-guards";
import { fcmDiagnostics, fcmTestTargets, sendFcmTest } from "@/lib/push-monitor.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/push")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "مراقبة الإشعارات | لبابك" },
      {
        name: "description",
        content: "تشخيص إشعارات FCM: حالة الإعداد، فحص المصادقة، الأجهزة المسجّلة، وإرسال اختبار.",
      },
      { property: "og:title", content: "مراقبة الإشعارات | لبابك" },
      { property: "og:description", content: "أدوات اختبار وتشخيص إشعارات الهاتف في لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPushMonitorPage,
});

function fmt(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-IQ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs font-semibold">
      {ok ? (
        <CheckCircle2 className="size-4 text-emerald-600" />
      ) : (
        <XCircle className="size-4 text-destructive" />
      )}
      <span className={ok ? "text-foreground" : "text-destructive"}>{label}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-background p-3 text-center">
      <p className="text-lg font-extrabold text-foreground">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function AdminPushMonitorPage() {
  const [target, setTarget] = useState("");

  const diag = useQuery({
    queryKey: ["fcm-diagnostics"],
    queryFn: () => fcmDiagnostics(),
    refetchInterval: 60_000,
  });
  const targets = useQuery({ queryKey: ["fcm-targets"], queryFn: () => fcmTestTargets() });

  const test = useMutation({
    mutationFn: (userId: string) => sendFcmTest({ data: { userId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`تم إرسال الإشعار التجريبي (${res.sent} جهاز).`);
      } else {
        const map: Record<string, string> = {
          no_target: "اختر سائقاً أولاً.",
          not_a_driver: "الحساب المحدد ليس سائقاً مسجّلاً.",
          no_device: "لا يوجد جهاز نشط لهذا السائق.",
          fcm_not_configured: "إعداد FCM غير مكتمل.",
          fcm_auth_failed: "فشل مصادقة Firebase — راجع مفتاح الخدمة.",
        };
        toast.error(map[res.reason ?? ""] ?? "تعذر إرسال الإشعار التجريبي.");
      }
      diag.refetch();
    },
    onError: () => toast.error("تعذر تنفيذ الاختبار."),
  });

  const cfg = diag.data?.config;
  const check = diag.data?.selfCheck;

  return (
    <PageShell>
      <AdminNav />
      <div dir="rtl" className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted-foreground">
            تشخيص Firebase Cloud Messaging دون كشف أي مفاتيح أو أسرار.
          </p>
          <button
            type="button"
            onClick={() => {
              diag.refetch();
              targets.refetch();
            }}
            className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold"
          >
            <RefreshCw className={cn("size-3.5", diag.isFetching && "animate-spin")} />
            تحديث
          </button>
        </div>

        {/* حالة الإعداد */}
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-bold text-foreground">حالة إعداد FCM</h2>
          {cfg ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Flag ok={cfg.hasProjectId} label="معرّف المشروع" />
                <Flag ok={cfg.serviceAccountValid} label="مفتاح حساب الخدمة" />
                <Flag ok={cfg.hasDispatchSecret} label="سر الإرسال الدوري" />
                <Flag ok={cfg.configured} label="الإعداد مكتمل" />
              </div>
              <dl className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>Project ID</dt>
                  <dd className="font-mono">{cfg.projectId ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>حساب الخدمة</dt>
                  <dd className="truncate font-mono">{cfg.serviceAccountEmail ?? "—"}</dd>
                </div>
              </dl>
              {cfg.missing.length > 0 ? (
                <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-2 text-xs font-semibold text-destructive">
                  أسرار ناقصة: {cfg.missing.join("، ")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">جارٍ الفحص…</p>
          )}
        </section>

        {/* الفحص الذاتي */}
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-bold text-foreground">الفحص الذاتي لمصادقة Firebase</h2>
          {check ? (
            <div
              className={cn(
                "mt-2 rounded-xl border p-3 text-xs font-semibold",
                check.ok
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                  : "border-destructive/30 bg-destructive/5 text-destructive",
              )}
            >
              <p>{check.ok ? "المصادقة ناجحة وFCM جاهز." : "فشل الفحص الذاتي."}</p>
              <p className="mt-1 font-mono text-[11px]">
                {check.step}
                {check.detail ? ` — ${check.detail}` : ""}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">جارٍ الفحص…</p>
          )}
        </section>

        {/* الأجهزة */}
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-bold text-foreground">الأجهزة المسجّلة</h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Stat label="الكل" value={diag.data?.devices.total ?? 0} />
            <Stat label="نشط" value={diag.data?.devices.active ?? 0} />
            <Stat label="أندرويد" value={diag.data?.devices.android ?? 0} />
            <Stat label="آيفون" value={diag.data?.devices.ios ?? 0} />
          </div>
          <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
            إشعارات معلّقة (٢٤ ساعة): {diag.data?.pending24h ?? 0}
          </p>
        </section>

        {/* اختبار */}
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <BellRing className="size-4 text-primary" /> اختبار FCM
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            يُرسل إشعاراً تجريبياً لجهاز سائق مسجّل فقط، ولا يؤثر على الطلبات.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="flex-1 rounded-xl border bg-background px-3 py-2 text-xs font-semibold"
            >
              <option value="">اختر سائقاً…</option>
              {(targets.data?.drivers ?? []).map((d) => (
                <option key={d.userId} value={d.userId}>
                  {d.name} — {d.platforms.join("/")} ({d.devices} جهاز)
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!target || test.isPending}
              onClick={() => test.mutate(target)}
              className="flex items-center justify-center gap-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              <Send className="size-3.5" /> إرسال اختبار
            </button>
          </div>
          {targets.data && targets.data.drivers.length === 0 ? (
            <p className="mt-2 text-[11px] font-semibold text-destructive">
              لا يوجد سائق بجهاز نشط — يجب فتح تطبيق الأندرويد وقبول إذن الإشعارات أولاً.
            </p>
          ) : null}
          {(targets.data?.drivers ?? []).map((d) => (
            <p key={d.userId} className="mt-1 text-[11px] text-muted-foreground">
              {d.name}: {d.maskedTokens.join("، ")} — آخر ظهور {fmt(d.lastSeen)}
            </p>
          ))}
        </section>

        {/* آخر عمليات الإرسال */}
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-bold text-foreground">آخر عمليات الإرسال (٢٤ ساعة)</h2>
          <ul className="mt-3 space-y-2">
            {(diag.data?.recent ?? []).map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between gap-2 rounded-xl border bg-background p-2 text-[11px]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{n.title}</p>
                  <p className="text-muted-foreground">
                    {n.kind} · {fmt(n.createdAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-1 font-bold",
                    n.status === "sent"
                      ? "bg-emerald-500/10 text-emerald-700"
                      : "bg-amber-500/10 text-amber-700",
                  )}
                >
                  {n.status === "sent" ? `أُرسل ${fmt(n.pushedAt)}` : "معلّق"}
                </span>
              </li>
            ))}
            {diag.data && diag.data.recent.length === 0 ? (
              <li className="text-xs text-muted-foreground">لا توجد إشعارات خلال ٢٤ ساعة.</li>
            ) : null}
          </ul>
        </section>

        {/* الأخطاء */}
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-bold text-foreground">أخطاء الإشعارات</h2>
          <ul className="mt-3 space-y-2">
            {(diag.data?.errors ?? []).map((e) => (
              <li key={e.id} className="rounded-xl border bg-background p-2 text-[11px]">
                <p className="font-semibold text-destructive">{e.message}</p>
                <p className="mt-1 text-muted-foreground">
                  {e.kind} · {e.source} · {fmt(e.createdAt)}
                </p>
              </li>
            ))}
            {diag.data && diag.data.errors.length === 0 ? (
              <li className="text-xs text-muted-foreground">لا توجد أخطاء مسجّلة.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
