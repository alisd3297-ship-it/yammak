import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Bike, ClipboardList, Wallet } from "lucide-react";
import { PageShell } from "@/components/app-shell";
import { DriverShell, useDriverPresence } from "@/components/driver/driver-shell";
import { OfferCard } from "@/components/driver/offer-card";
import { TaskCard } from "@/components/driver/task-card";
import { TaxiSections } from "@/components/driver/taxi-sections";
import { useAccount } from "@/lib/auth";
import {
  driverSummary,
  useDriverActions,
  useDriverHistory,
  useDriverOffers,
  useDriverTasks,
  useWorkerProfile,
} from "@/lib/driver-data";
import { formatIQD } from "@/lib/orders";
import { requireWorker } from "@/lib/route-guards";

export const Route = createFileRoute("/driver")({
  ssr: false,
  beforeLoad: requireWorker,
  // يسمح لإشعار عرض التوصيل بفتح الطلب الصحيح مباشرة داخل اللوحة
  validateSearch: (search: Record<string, unknown>): { order?: string } => {
    const order = search["order"];
    return typeof order === "string" && order ? { order } : {};
  },
  head: () => ({
    meta: [
      { title: "لوحة المندوب | لبابك" },
      { name: "description", content: "حالتك، مهمتك الحالية، والعروض القريبة منك في لوحة مندوب لبابك." },
      { property: "og:title", content: "لوحة المندوب | لبابك" },
      { property: "og:description", content: "حالة الاتصال والمهمة الحالية والعروض القريبة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriverDashboard,
});

function DriverDashboard() {
  const focusOrderId = Route.useSearch().order;
  const { data: account } = useAccount();
  const { data: worker } = useWorkerProfile();
  const { data: offers } = useDriverOffers();
  const { data: tasks } = useDriverTasks();
  const { data: history } = useDriverHistory();
  const actions = useDriverActions();

  const isOnline = !!worker?.is_available;
  useDriverPresence(isOnline);

  const focusedOfferRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focusOrderId && focusedOfferRef.current)
      focusedOfferRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusOrderId, offers]);

  const summary = driverSummary(history);

  if (!account?.userId)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">هذه اللوحة للمندوبين المعتمدين.</p>
          <Link to="/auth" className="mt-3 inline-block font-semibold text-primary">
            تسجيل الدخول
          </Link>
        </div>
      </PageShell>
    );

  return (
    <DriverShell
      title="المندوب"
      online={!!worker?.is_available}
      canToggle={!!worker?.is_approved}
      onToggle={(v) => void actions.toggleAvailable(v)}
    >
      <div className="space-y-5 px-4 py-5">
        {!worker && (
          <div className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ما عندك ملف مندوب.{" "}
            <Link to="/join/driver" className="font-semibold text-primary">
              قدّم طلب انضمام الآن
            </Link>
          </div>
        )}
        {worker && !worker.is_approved && worker.application_status === "rejected" && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm">
            <p className="font-bold text-destructive">تم رفض طلب الانضمام كمندوب.</p>
            {worker.rejection_reason ? (
              <p className="mt-1 text-muted-foreground">السبب: {worker.rejection_reason}</p>
            ) : null}
            <Link to="/join/driver" className="mt-2 inline-block font-semibold text-primary">
              تعديل البيانات وإعادة التقديم
            </Link>
          </div>
        )}
        {worker && !worker.is_approved && worker.application_status !== "rejected" && (
          <div className="rounded-2xl bg-warning/15 p-4 text-sm">
            <p className="font-bold">بانتظار موافقة المدير</p>
            <p className="mt-1 text-muted-foreground">
              طلبك مسجّل بحالة «قيد المراجعة». ما راح توصلك طلبات قبل الاعتماد.
            </p>
          </div>
        )}

        <section className="grid grid-cols-3 gap-2">
          <Metric icon={Bike} label="توصيلات اليوم" value={String(summary.todayCount)} />
          <Metric icon={Wallet} label="أرباح اليوم" value={formatIQD(summary.todayEarnings)} />
          <Metric icon={ClipboardList} label="عروض متاحة" value={String(offers?.length ?? 0)} />
        </section>

        <section>
          <h2 className="mb-3 text-base font-black">مهمتي الحالية</h2>
          <div className="space-y-3">
            {(tasks ?? []).map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onAdvance={(id, next) => void actions.advance(id, next)}
                onCompleteStop={(id) => void actions.completeStop(id)}
              />
            ))}
            {!tasks?.length && (
              <p className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
                ماكو مهمة حالية. خلي حالتك «متصل» حتى توصلك الطلبات القريبة.
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black">طلبات جديدة قريبة</h2>
            <Link to="/driver-tasks" className="text-xs font-bold text-primary">
              كل الطلبات
            </Link>
          </div>
          <div className="space-y-3">
            {isOnline &&
              (offers ?? []).slice(0, 3).map((o) => (
                <OfferCard
                  key={o.id}
                  offer={o}
                  {...(focusOrderId && o.order_id === focusOrderId
                    ? { focused: true, ref: focusedOfferRef }
                    : {})}
                  onAccept={() => void actions.answerOffer(o.id, true)}
                  onReject={() => void actions.answerOffer(o.id, false)}
                />
              ))}
            {!isOnline && (
              <p className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
                حالتك «غير متصل» — اضغط زر الاتصال فوق حتى توصلك الطلبات القريبة.
              </p>
            )}
            {isOnline && !offers?.length && (
              <p className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
                ماكو طلبات جديدة الآن.
              </p>
            )}
          </div>
        </section>

        <TaxiSections enabled={worker?.worker_kind === "taxi"} />
      </div>
    </DriverShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bike;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-3 text-center shadow-soft">
      <Icon className="mx-auto size-5 text-primary" />
      <p className="mt-1 text-base font-black leading-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
