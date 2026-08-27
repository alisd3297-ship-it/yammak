import { createFileRoute } from "@tanstack/react-router";
import { MapPin, PackageCheck } from "lucide-react";
import { DriverShell } from "@/components/driver/driver-shell";
import { BackButton } from "@/components/app-shell";
import { DriverMap } from "@/components/driver/driver-map";
import { useDriverTasks } from "@/lib/driver-data";
import { DRIVER_STAGE_ORDER, stageOf } from "@/lib/driver-flow";

export const Route = createFileRoute("/driver-map")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "خريطة المهمة | لبابك" },
      { name: "description", content: "خريطة المندوب: نقطة الاستلام ونقطة التسليم مع الاتجاهات." },
      { property: "og:title", content: "خريطة المهمة | لبابك" },
      { property: "og:description", content: "موقع الاستلام والتسليم واتجاهات الطريق للمندوب." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriverMapPage,
});

function DriverMapPage() {
  const { data: tasks } = useDriverTasks();
  const list = tasks ?? [];

  return (
    <DriverShell title="الخريطة">
      <div className="space-y-5 px-4 py-5 pb-24">
        <BackButton fallback="/driver" label="اللوحة" />

        {!list.length && (
          <p className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
            ماكو مهمة حالية لعرضها على الخريطة.
          </p>
        )}

        {list.map((t) => {
          const stage = stageOf(t.status, "none");
          const target =
            DRIVER_STAGE_ORDER.indexOf(stage) >= DRIVER_STAGE_ORDER.indexOf("picked_up")
              ? ("dropoff" as const)
              : ("pickup" as const);
          return (
            <section
              key={t.id}
              className="rounded-3xl border border-border bg-card p-4 shadow-card"
            >
              <h2 className="text-base font-black">طلب #{t.code}</h2>
              <p className="mt-2 flex items-start gap-2 text-sm">
                <PackageCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="font-semibold">{t.pickup_text ?? "نقطة الاستلام غير محددة"}</span>
              </p>
              <p className="mt-1 flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="font-semibold">{t.dropoff_text ?? "نقطة التسليم غير محددة"}</span>
              </p>
              <DriverMap
                pickup={
                  t.pickup_lat != null && t.pickup_lng != null
                    ? { lat: t.pickup_lat, lng: t.pickup_lng, label: "الاستلام" }
                    : null
                }
                dropoff={
                  t.dropoff_lat != null && t.dropoff_lng != null
                    ? { lat: t.dropoff_lat, lng: t.dropoff_lng, label: "الزبون" }
                    : null
                }
                target={target}
              />
            </section>
          );
        })}
      </div>
    </DriverShell>
  );
}
