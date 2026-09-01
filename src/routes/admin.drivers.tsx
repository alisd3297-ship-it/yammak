import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/auth";
import { formatIQD } from "@/lib/orders";
import { cn } from "@/lib/utils";
import {
  OPEN_TRIP_STATUSES,
  TRIP_STATUS_LABELS,
  taxiClassLabel,
  tripTone,
  type TripStatus,
} from "@/lib/taxi";
import { changeTripStatus, redispatchTrip, setDriverApproval } from "@/lib/taxi.functions";
import { createDriverAccount } from "@/lib/driver-accounts.functions";
import { VEHICLE_LABELS, vehicleLabel, type VehicleType } from "@/lib/vehicles";

import { requireStaff } from "@/lib/route-guards";

export const Route = createFileRoute("/admin/drivers")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "إدارة السائقين والرحلات | لبابك" },
      {
        name: "description",
        content: "اعتماد وتعليق سائقي التكسي والمندوبين ومتابعة الرحلات النشطة داخل لبابك.",
      },
      { property: "og:title", content: "إدارة السائقين والرحلات | لبابك" },
      { property: "og:description", content: "لوحة إدارة السائقين ورحلات التكسي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDriversPage,
});

function AdminDriversPage() {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const approve = useServerFn(setDriverApproval);
  const redispatch = useServerFn(redispatchTrip);
  const setStatus = useServerFn(changeTripStatus);
  const [tab, setTab] = useState<"drivers" | "trips">("drivers");

  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const createDriver = useServerFn(createDriverAccount);
  const [addForm, setAddForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    kind: "delivery" as "delivery" | "taxi",
    vehicleType: "bike" as VehicleType,
    vehicleMake: "",
    vehicleModel: "",
    vehicleColor: "",
    plateNumber: "",
  });
  const [adding, setAdding] = useState(false);

  async function submitAddDriver() {
    setAdding(true);
    try {
      const res = await createDriver({ data: addForm });
      toast.success(
        res.created
          ? `تم إنشاء حساب السائق واعتماده (${res.email})`
          : `تم تحديث الحساب الحالي واعتماده كسائق (${res.email})`,
      );
      setShowAdd(false);
      setAddForm({
        fullName: "",
        email: "",
        password: "",
        phone: "",
        kind: "delivery",
        vehicleType: "bike",
        vehicleMake: "",
        vehicleModel: "",
        vehicleColor: "",
        plateNumber: "",
      });
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إنشاء الحساب");
    } finally {
      setAdding(false);
    }
  }

  const isStaff = (account?.roles ?? []).some((r) =>
    ["super_admin", "admin", "supervisor"].includes(r),
  );

  const { data: drivers } = useQuery({
    queryKey: ["admin-drivers"],
    enabled: isStaff,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_profiles")
        .select(
          "user_id, worker_kind, requested_kind, is_approved, is_available, application_status, rejection_reason, rating, ratings_count, taxi_class, taxi_seats, vehicle_type, vehicle_make, vehicle_model, vehicle_color, plate_number, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      const rows = data ?? [];
      if (rows.length === 0) return rows.map((r) => ({ ...r, full_name: "", phone: "" }));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in(
          "id",
          rows.map((r) => r.user_id),
        );
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        full_name: byId.get(r.user_id)?.full_name ?? "",
        phone: byId.get(r.user_id)?.phone ?? "",
      }));
    },
  });

  const { data: trips } = useQuery({
    queryKey: ["admin-trips"],
    enabled: isStaff && tab === "trips",
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("trips")
        .select(
          "id, code, status, taxi_class, passengers, fare, distance_km, pickup_text, destination_text, driver_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  async function decide(userId: string, ok: boolean, reason?: string) {
    try {
      await approve({
        data: { userId, approve: ok, reason: reason || (ok ? "اعتماد الإدارة" : "رفض من الإدارة") },
      });
      toast.success(
        ok ? "تم اعتماد المندوب ومنحه صلاحية المندوب" : "تم رفض/تعليق المندوب وسحب صلاحياته",
      );
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
    }
  }

  const pendingCount = (drivers ?? []).filter(
    (d) => !d.is_approved && d.application_status !== "rejected",
  ).length;

  async function retry(tripId: string) {
    try {
      const res = await redispatch({ data: { tripId } });
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["admin-trips"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إعادة التوزيع");
    }
  }

  async function cancel(tripId: string) {
    try {
      await setStatus({ data: { tripId, status: "cancelled", reason: "إلغاء إداري" } });
      toast.success("تم إلغاء الرحلة");
      qc.invalidateQueries({ queryKey: ["admin-trips"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إلغاء الرحلة");
    }
  }

  if (!isStaff)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">هذه اللوحة لإدارة لبابك فقط.</p>
          <Link to="/" className="mt-3 inline-block font-semibold text-primary">
            الرجوع للرئيسية
          </Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black">السائقون والرحلات</h1>
            <p className="mt-1 text-sm opacity-90">اعتماد السائقين ومتابعة رحلات التكسي</p>
          </div>
          <Button
            variant="secondary"
            className="h-10 shrink-0 font-bold"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "إغلاق" : "+ إضافة سائق"}
          </Button>
        </div>
      </header>

      {showAdd && (
        <div className="px-4 pt-4">
          <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="text-base font-bold">إضافة سائق جديد (معتمد مباشرة)</h2>
            <input
              value={addForm.fullName}
              onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="اسم السائق الكامل"
              aria-label="اسم السائق"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="البريد الإلكتروني"
              aria-label="البريد الإلكتروني"
              type="email"
              dir="ltr"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              value={addForm.password}
              onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="كلمة المرور (8 أحرف فأكثر)"
              aria-label="كلمة المرور"
              type="text"
              dir="ltr"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              value={addForm.phone}
              onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="رقم الهاتف (اختياري)"
              aria-label="رقم الهاتف"
              type="tel"
              dir="ltr"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={addForm.kind}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, kind: e.target.value as "delivery" | "taxi" }))
                }
                aria-label="نوع السائق"
                className="h-11 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="delivery">مندوب توصيل</option>
                <option value="taxi">سائق تكسي</option>
              </select>
              <select
                value={addForm.vehicleType}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, vehicleType: e.target.value as VehicleType }))
                }
                aria-label="نوع المركبة"
                className="h-11 rounded-md border border-input bg-background px-2 text-sm"
              >
                {Object.entries(VEHICLE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={addForm.vehicleMake}
                onChange={(e) => setAddForm((f) => ({ ...f, vehicleMake: e.target.value }))}
                placeholder="نوع المركبة (مثال: هوندا)"
                aria-label="ماركة المركبة"
                className="h-11 rounded-md border border-input bg-background px-3 text-sm"
              />
              <input
                value={addForm.vehicleModel}
                onChange={(e) => setAddForm((f) => ({ ...f, vehicleModel: e.target.value }))}
                placeholder="الموديل"
                aria-label="موديل المركبة"
                className="h-11 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={addForm.vehicleColor}
                onChange={(e) => setAddForm((f) => ({ ...f, vehicleColor: e.target.value }))}
                placeholder="اللون"
                aria-label="لون المركبة"
                className="h-11 rounded-md border border-input bg-background px-3 text-sm"
              />
              <input
                value={addForm.plateNumber}
                onChange={(e) => setAddForm((f) => ({ ...f, plateNumber: e.target.value }))}
                placeholder="رقم اللوحة"
                aria-label="رقم اللوحة"
                className="h-11 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <Button
              className="h-11 w-full font-bold"
              disabled={adding}
              onClick={() => void submitAddDriver()}
            >
              {adding ? "جارٍ الإنشاء…" : "إنشاء حساب السائق واعتماده"}
            </Button>
            <p className="text-xs text-muted-foreground">
              إذا كان البريد مسجلاً مسبقاً تُحدَّث كلمة المرور ويُمنح صلاحية السائق المعتمد.
            </p>
          </section>
        </div>
      )}

      <div className="space-y-5 px-4 py-5">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
          {(
            [
              {
                key: "drivers",
                label: `طلبات السائقين${pendingCount ? ` (${pendingCount})` : ""}`,
              },
              { key: "trips", label: "الرحلات" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-xl py-2 text-sm font-semibold transition",
                tab === t.key ? "bg-card shadow-soft" : "text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "drivers" && (
          <div className="space-y-3">
            {(drivers ?? []).map((d) => (
              <article key={d.user_id} className="rounded-2xl bg-card p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <p className="font-bold">
                    {d.worker_kind === "taxi" || d.requested_kind === "taxi"
                      ? "سائق تكسي"
                      : "مندوب توصيل"}
                  </p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      d.is_approved
                        ? "bg-success/15 text-success"
                        : d.application_status === "rejected"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-warning/20 text-warning-foreground",
                    )}
                  >
                    {d.is_approved
                      ? "معتمد"
                      : d.application_status === "rejected"
                        ? "مرفوض"
                        : "قيد المراجعة"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[d.vehicle_make, d.vehicle_model, d.vehicle_color].filter(Boolean).join(" · ") ||
                    "بدون بيانات مركبة"}
                  {d.plate_number ? ` · ${d.plate_number}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.taxi_class
                    ? `فئة: ${taxiClassLabel(d.taxi_class)} · ${d.taxi_seats} مقاعد`
                    : null}
                  {d.vehicle_type ? `مركبة التوصيل: ${vehicleLabel(d.vehicle_type)}` : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  التقييم: {Number(d.rating ?? 0).toFixed(1)} ({d.ratings_count ?? 0}) ·{" "}
                  {d.is_available ? "متاح الآن" : "غير متاح"}
                </p>
                {d.rejection_reason ? (
                  <p className="mt-1 text-xs text-destructive">سبب الرفض: {d.rejection_reason}</p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  {!d.is_approved && (
                    <Button className="h-10 flex-1" onClick={() => decide(d.user_id, true)}>
                      قبول ومنح صلاحية المندوب
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="h-10 flex-1"
                    onClick={() => {
                      setRejectFor(d.user_id);
                      setRejectReason("");
                    }}
                  >
                    {d.is_approved ? "تعليق" : "رفض"}
                  </Button>
                </div>
                {rejectFor === d.user_id && (
                  <div className="mt-3 space-y-2 rounded-xl bg-muted p-3">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="سبب الرفض (اختياري)"
                      aria-label="سبب الرفض"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="h-10 flex-1"
                        onClick={async () => {
                          await decide(d.user_id, false, rejectReason.trim());
                          setRejectFor(null);
                        }}
                      >
                        تأكيد
                      </Button>
                      <Button variant="ghost" className="h-10" onClick={() => setRejectFor(null)}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            ))}
            {!drivers?.length && (
              <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                ماكو طلبات سائقين حالياً.
              </p>
            )}
          </div>
        )}

        {tab === "trips" && (
          <div className="space-y-3">
            {(trips ?? []).map((t) => (
              <article key={t.id} className="rounded-2xl bg-card p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <p className="font-bold">رحلة #{t.code}</p>
                  <span className="text-sm font-bold text-primary">
                    {formatIQD(Number(t.fare))}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusDot tone={tripTone(t.status as TripStatus)} />
                  {TRIP_STATUS_LABELS[t.status as TripStatus]} · {taxiClassLabel(t.taxi_class)} ·{" "}
                  {t.passengers} راكب
                </p>
                <p className="mt-2 text-xs text-muted-foreground">من: {t.pickup_text}</p>
                <p className="text-xs text-muted-foreground">إلى: {t.destination_text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Number(t.distance_km).toFixed(1)} كم ·{" "}
                  {new Date(t.created_at).toLocaleString("ar-IQ-u-nu-latn")}
                </p>
                {OPEN_TRIP_STATUSES.includes(t.status as TripStatus) && (
                  <div className="mt-3 flex gap-2">
                    {!t.driver_id && (
                      <Button
                        variant="secondary"
                        className="h-10 flex-1"
                        onClick={() => retry(t.id)}
                      >
                        إعادة التوزيع
                      </Button>
                    )}
                    <Button variant="outline" className="h-10" onClick={() => cancel(t.id)}>
                      إلغاء
                    </Button>
                  </div>
                )}
              </article>
            ))}
            {!trips?.length && (
              <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                ماكو رحلات مسجلة.
              </p>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
