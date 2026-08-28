import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star, Car, Phone, User, Bell, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/app-shell";
import { DriverShell } from "@/components/driver/driver-shell";
import { useAccount } from "@/lib/auth";
import { useDriverActions, useWorkerProfile } from "@/lib/driver-data";
import { DRIVER_VEHICLE_ORDER, VEHICLE_HINTS, VEHICLE_LABELS, vehicleLabel } from "@/lib/vehicles";
import { cn } from "@/lib/utils";
import { requireWorker } from "@/lib/route-guards";

export const Route = createFileRoute("/driver-account")({
  ssr: false,
  beforeLoad: requireWorker,
  head: () => ({
    meta: [
      { title: "حساب المندوب | لبابك" },
      {
        name: "description",
        content: "بيانات المندوب والمركبة والتقييم وإعدادات الحساب في لبابك.",
      },
      { property: "og:title", content: "حساب المندوب | لبابك" },
      { property: "og:description", content: "بياناتك ومركبتك وتقييمك وإعداداتك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriverAccountPage,
});

function DriverAccountPage() {
  const { data: account } = useAccount();
  const { data: worker } = useWorkerProfile();
  const actions = useDriverActions();

  const { data: profile } = useQuery({
    queryKey: ["driver-profile", account?.userId],
    enabled: !!account?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, phone_verified_at")
        .eq("id", account!.userId!)
        .maybeSingle();
      return data;
    },
  });

  const vehicleText =
    [
      worker?.vehicle_type ? vehicleLabel(worker.vehicle_type) : null,
      worker?.vehicle_make,
      worker?.vehicle_model,
      worker?.vehicle_color,
    ]
      .filter(Boolean)
      .join(" · ") ||
    worker?.vehicle ||
    "غير محددة";

  return (
    <DriverShell
      title="حسابي"
      online={!!worker?.is_available}
      canToggle={!!worker?.is_approved}
      onToggle={(v) => void actions.toggleAvailable(v)}
    >
      <div className="space-y-4 px-4 py-5">
        <BackButton fallback="/driver" label="اللوحة" />

        <section className="rounded-3xl bg-card p-5 shadow-card">
          <p className="flex items-center gap-2 text-lg font-black">
            <User className="size-5 text-primary" />
            {profile?.full_name ?? "مندوب لبابك"}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="size-4" /> {profile?.phone ?? "لم يُضف رقم"}
            {profile?.phone_verified_at ? (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-success">
                موثّق
              </span>
            ) : (
              <Link to="/verify-phone" className="text-xs font-bold text-primary">
                توثيق الرقم
              </Link>
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            الحالة:{" "}
            {worker?.is_approved
              ? "معتمد"
              : worker?.application_status === "rejected"
                ? "مرفوض"
                : "قيد المراجعة"}
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-card p-4 shadow-soft">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Car className="size-4 text-primary" /> المركبة
            </p>
            <p className="mt-1 text-sm font-black">{vehicleText}</p>
            {worker?.plate_number && (
              <p className="mt-1 text-xs text-muted-foreground">اللوحة: {worker.plate_number}</p>
            )}
          </div>
          <div className="rounded-3xl bg-card p-4 shadow-soft">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Star className="size-4 text-primary" /> التقييم
            </p>
            <p className="mt-1 text-2xl font-black">{Number(worker?.rating ?? 0).toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">{worker?.ratings_count ?? 0} تقييم</p>
          </div>
        </section>

        <section className="rounded-3xl bg-card p-4 shadow-soft">
          <p className="flex items-center gap-2 text-sm font-black">
            <Car className="size-4 text-primary" /> نوع وسيلة النقل
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            اختيارك يُحفظ في ملفك ويظهر للإدارة ويُستخدم لتوزيع الطلبات المناسبة.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DRIVER_VEHICLE_ORDER.map((v) => {
              const active = worker?.vehicle_type === v;
              return (
                <button
                  key={v}
                  aria-pressed={active}
                  onClick={() => void actions.setVehicleType(v)}
                  className={cn(
                    "rounded-2xl p-3 text-right transition",
                    active ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  <span className="block text-sm font-bold">{VEHICLE_LABELS[v]}</span>
                  <span
                    className={cn(
                      "block text-[11px]",
                      active ? "opacity-90" : "text-muted-foreground",
                    )}
                  >
                    {VEHICLE_HINTS[v]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {worker?.worker_kind === "taxi" && (
          <section className="rounded-3xl bg-card p-4 shadow-soft">
            <p className="flex items-center gap-2 text-sm font-black">
              <Car className="size-4 text-primary" /> استلام طلبات التوصيل
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              فعّل الخيار حتى تصلك طلبات المطاعم والمتاجر إضافةً إلى رحلات التكسي.
            </p>
            <button
              aria-pressed={!!worker?.delivery_enabled}
              onClick={() => void actions.setDeliveryEnabled(!worker?.delivery_enabled)}
              className={cn(
                "mt-3 w-full rounded-2xl p-3 text-sm font-bold transition",
                worker?.delivery_enabled ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {worker?.delivery_enabled ? "مفعّل للتوصيل" : "غير مفعّل للتوصيل"}
            </button>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl bg-card shadow-soft">
          <SettingLink to="/driver-earnings" icon={Wallet} label="الأرباح والتسويات" />
          <SettingLink to="/notifications" icon={Bell} label="الإشعارات" />
          <SettingLink to="/join/driver" icon={Car} label="تحديث بيانات المركبة" />
        </section>
      </div>
    </DriverShell>
  );
}

function SettingLink({
  to,
  icon: Icon,
  label,
}: {
  to: "/driver-earnings" | "/notifications" | "/join/driver";
  icon: typeof Car;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border-b border-border px-4 py-4 text-sm font-bold last:border-0"
    >
      <Icon className="size-5 text-primary" />
      {label}
    </Link>
  );
}
