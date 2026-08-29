import { createFileRoute } from "@tanstack/react-router";
import { DriverShell } from "@/components/driver/driver-shell";
import { BackButton } from "@/components/app-shell";
import { OfferCard } from "@/components/driver/offer-card";
import { TaskCard } from "@/components/driver/task-card";
import { TaxiSections } from "@/components/driver/taxi-sections";
import {
  useDriverActions,
  useDriverOffers,
  useDriverTasks,
  useWorkerProfile,
} from "@/lib/driver-data";
import { requireWorker } from "@/lib/route-guards";

export const Route = createFileRoute("/driver-tasks")({
  ssr: false,
  beforeLoad: requireWorker,
  head: () => ({
    meta: [
      { title: "طلبات المندوب | لبابك" },
      {
        name: "description",
        content: "الطلبات الجديدة المتاحة والمهام قيد التنفيذ للمندوب في لبابك.",
      },
      { property: "og:title", content: "طلبات المندوب | لبابك" },
      { property: "og:description", content: "قبول الطلبات الجديدة ومتابعة المهام الحالية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriverTasksPage,
});

function DriverTasksPage() {
  const { data: worker } = useWorkerProfile();
  const { data: offers } = useDriverOffers();
  const { data: tasks } = useDriverTasks();
  const actions = useDriverActions();

  const online = !!worker?.is_available;

  return (
    <DriverShell
      title="الطلبات"
      online={online}
      canToggle={!!worker?.is_approved}
      onToggle={(v) => void actions.toggleAvailable(v)}
    >
      <div className="space-y-5 px-4 py-5">
        <BackButton fallback="/driver" label="اللوحة" />

        <section>
          <h2 className="mb-3 text-base font-black">طلبات جديدة ({offers?.length ?? 0})</h2>
          <div className="space-y-3">
            {online &&
              (offers ?? []).map((o) => (
                <OfferCard
                  key={o.id}
                  offer={o}
                  onAccept={() => void actions.answerOffer(o.id, true)}
                  onReject={() => void actions.answerOffer(o.id, false)}
                />
              ))}
            {!online && (
              <p className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
                حالتك «غير متصل» — شغّل زر الاتصال فوق حتى تظهر الطلبات القريبة.
              </p>
            )}
            {online && !offers?.length && (
              <p className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
                ماكو طلبات جديدة الآن.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-black">طلب حالي</h2>
          <div className="space-y-3">
            {(tasks ?? []).map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onAdvance={(id, chain) => void actions.advanceMany(id, chain)}
                onCompleteStop={(id) => void actions.completeStop(id)}
              />
            ))}
            {!tasks?.length && (
              <p className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
                ماكو مهمة قيد التنفيذ.
              </p>
            )}
          </div>
        </section>

        <TaxiSections enabled={worker?.worker_kind === "taxi"} />
      </div>
    </DriverShell>
  );
}
