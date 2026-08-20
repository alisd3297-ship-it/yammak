import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Car, LocateFixed, MapPin, Navigation, Star, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/auth";
import { formatIQD } from "@/lib/orders";
import { cn } from "@/lib/utils";
import {
  OPEN_TRIP_STATUSES,
  TAXI_CLASSES,
  TRIP_STATUS_LABELS,
  taxiClassLabel,
  tripTone,
  type TaxiClass,
  type TripStatus,
} from "@/lib/taxi";
import { changeTripStatus, createTaxiTrip, quoteTaxiTrip, rateTrip } from "@/lib/taxi.functions";

export const Route = createFileRoute("/taxi")({
  head: () => ({
    meta: [
      { title: "اطلب تكسي | يمّك" },
      {
        name: "description",
        content: "اطلب تكسي من موقعك إلى وجهتك داخل مدينتك بأجرة واضحة محسوبة مسبقاً ومتابعة حية للسائق.",
      },
      { property: "og:title", content: "اطلب تكسي | يمّك" },
      { property: "og:description", content: "تنقّل داخل المدينة مع سائقي يمّك المعتمدين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaxiPage,
});

type Coords = { lat: number; lng: number } | null;

function TaxiPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const quote = useServerFn(quoteTaxiTrip);
  const create = useServerFn(createTaxiTrip);
  const setStatus = useServerFn(changeTripStatus);
  const rate = useServerFn(rateTrip);

  const [taxiClass, setTaxiClass] = useState<TaxiClass>("economy");
  const [passengers, setPassengers] = useState(1);
  const [pickupText, setPickupText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [pickup, setPickup] = useState<Coords>(null);
  const [dest, setDest] = useState<Coords>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [stars, setStars] = useState(5);

  const { data: fareQuote } = useQuery({
    queryKey: ["taxi-quote", taxiClass, pickup?.lat, pickup?.lng, dest?.lat, dest?.lng],
    enabled: !!account?.userId,
    queryFn: () =>
      quote({
        data: {
          taxiClass,
          pickupLat: pickup?.lat ?? null,
          pickupLng: pickup?.lng ?? null,
          destLat: dest?.lat ?? null,
          destLng: dest?.lng ?? null,
        },
      }),
  });

  const { data: activeTrip } = useQuery({
    queryKey: ["my-active-trip", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 8_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("trips")
        .select(
          "id, code, status, taxi_class, passengers, fare, distance_km, pickup_text, destination_text, driver_id, created_at",
        )
        .eq("customer_id", account!.userId!)
        .in("status", OPEN_TRIP_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: lastCompleted } = useQuery({
    queryKey: ["my-last-trip", account?.userId],
    enabled: !!account?.userId && !activeTrip,
    queryFn: async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, code, status, fare, driver_id, completed_at, trip_ratings(id)")
        .eq("customer_id", account!.userId!)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: driverInfo } = useQuery({
    queryKey: ["trip-driver", activeTrip?.driver_id],
    enabled: !!activeTrip?.driver_id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [profile, worker, location] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", activeTrip!.driver_id!).maybeSingle(),
        supabase
          .from("worker_profiles")
          .select("rating, ratings_count, vehicle_make, vehicle_model, vehicle_color, plate_number, taxi_class")
          .eq("user_id", activeTrip!.driver_id!)
          .maybeSingle(),
        supabase
          .from("worker_locations")
          .select("lat, lng, updated_at")
          .eq("user_id", activeTrip!.driver_id!)
          .maybeSingle(),
      ]);
      return { profile: profile.data, worker: worker.data, location: location.data };
    },
  });

  function locate(target: "pickup" | "dest") {
    if (!navigator.geolocation) {
      toast.error("جهازك ما يدعم تحديد الموقع");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (target === "pickup") setPickup(c);
        else setDest(c);
        toast.success("تم تحديد الموقع");
      },
      () => toast.error("تعذر تحديد موقعك، اكتب العنوان يدوياً"),
    );
  }

  async function send() {
    if (!account?.userId) {
      navigate({ to: "/auth" });
      return;
    }
    setSaving(true);
    try {
      await create({
        data: {
          taxiClass,
          passengers,
          pickupText,
          destinationText,
          pickupLat: pickup?.lat ?? null,
          pickupLng: pickup?.lng ?? null,
          destLat: dest?.lat ?? null,
          destLng: dest?.lng ?? null,
          notes,
        },
      });
      toast.success("تم إرسال طلبك، نبحث لك عن سائق");
      qc.invalidateQueries({ queryKey: ["my-active-trip"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setSaving(false);
    }
  }

  async function cancelTrip(tripId: string) {
    try {
      await setStatus({ data: { tripId, status: "cancelled", reason: "إلغاء من الراكب" } });
      toast.success("تم إلغاء الرحلة");
      qc.invalidateQueries({ queryKey: ["my-active-trip"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إلغاء الرحلة");
    }
  }

  async function sendRating(tripId: string) {
    try {
      await rate({ data: { tripId, stars } });
      toast.success("شكراً لتقييمك");
      qc.invalidateQueries({ queryKey: ["my-last-trip"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ التقييم");
    }
  }

  const maxSeats = TAXI_CLASSES.find((c) => c.key === taxiClass)?.seats ?? 4;

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm opacity-90">
          <ArrowRight className="size-4" /> الرئيسية
        </Link>
        <h1 className="text-2xl font-black">اطلب تكسي</h1>
        <p className="mt-1 text-sm opacity-90">من موقعك لوجهتك، والأجرة معروفة قبل ما تنطلق.</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        {activeTrip ? (
          <section className="rounded-2xl bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-bold">رحلة #{activeTrip.code}</p>
              <span className="text-sm font-bold text-primary">{formatIQD(Number(activeTrip.fare))}</span>
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <StatusDot tone={tripTone(activeTrip.status as TripStatus)} />
              {TRIP_STATUS_LABELS[activeTrip.status as TripStatus]}
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" /> من: {activeTrip.pickup_text}
            </p>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Navigation className="mt-0.5 size-3.5 shrink-0" /> إلى: {activeTrip.destination_text}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {taxiClassLabel(activeTrip.taxi_class)} · {activeTrip.passengers} راكب ·{" "}
              {Number(activeTrip.distance_km).toFixed(1)} كم
            </p>

            {driverInfo?.profile && (
              <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs">
                <p className="font-semibold">السائق: {driverInfo.profile.full_name}</p>
                {driverInfo.worker && (
                  <p className="mt-1 text-muted-foreground">
                    {[
                      driverInfo.worker.vehicle_make,
                      driverInfo.worker.vehicle_model,
                      driverInfo.worker.vehicle_color,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "مركبة معتمدة"}
                    {driverInfo.worker.plate_number ? ` · ${driverInfo.worker.plate_number}` : ""}
                  </p>
                )}
                {driverInfo.worker && (
                  <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                    <Star className="size-3 fill-warning text-warning" />
                    {Number(driverInfo.worker.rating ?? 0).toFixed(1)} ({driverInfo.worker.ratings_count ?? 0})
                  </p>
                )}
                {driverInfo.profile.phone && (
                  <a href={`tel:${driverInfo.profile.phone}`} className="mt-1 inline-block font-semibold text-primary">
                    اتصال بالسائق
                  </a>
                )}
                {driverInfo.location && (
                  <a
                    className="mt-1 block font-semibold text-primary"
                    href={`https://www.google.com/maps/search/?api=1&query=${driverInfo.location.lat},${driverInfo.location.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    موقع السائق الآن على الخريطة
                  </a>
                )}
              </div>
            )}

            {["searching_driver", "driver_assigned", "driver_arriving", "driver_arrived"].includes(
              activeTrip.status,
            ) && (
              <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => cancelTrip(activeTrip.id)}>
                إلغاء الرحلة
              </Button>
            )}
          </section>
        ) : (
          <>
            {lastCompleted && !(Array.isArray(lastCompleted.trip_ratings) ? lastCompleted.trip_ratings : []).length && (
              <section className="rounded-2xl bg-card p-4 shadow-soft">
                <p className="font-bold">قيّم رحلتك الأخيرة #{lastCompleted.code}</p>
                <div className="mt-3 flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setStars(n)} aria-label={`${n} نجوم`}>
                      <Star className={cn("size-7", n <= stars ? "fill-warning text-warning" : "text-muted")} />
                    </button>
                  ))}
                </div>
                <Button className="mt-3 h-11 w-full" onClick={() => sendRating(lastCompleted.id)}>
                  إرسال التقييم
                </Button>
              </section>
            )}

            <section className="rounded-2xl bg-card p-4 shadow-soft">
              <h2 className="mb-3 flex items-center gap-2 font-bold">
                <Car className="size-4 text-primary" /> فئة المركبة
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {TAXI_CLASSES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => {
                      setTaxiClass(c.key);
                      if (passengers > c.seats) setPassengers(c.seats);
                    }}
                    className={cn(
                      "rounded-2xl p-3 text-center text-xs font-semibold shadow-soft transition active:scale-95",
                      taxiClass === c.key ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    <span className="block text-sm">{c.label}</span>
                    <span className="mt-1 block opacity-80">{c.hint}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="size-4 text-primary" /> عدد الركاب
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="size-9"
                    onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                  >
                    −
                  </Button>
                  <span className="w-6 text-center font-bold">{passengers}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="size-9"
                    onClick={() => setPassengers((p) => Math.min(maxSeats, p + 1))}
                  >
                    +
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-card p-4 shadow-soft">
              <h2 className="mb-3 flex items-center gap-2 font-bold">
                <MapPin className="size-4 text-primary" /> نقطة الانطلاق
              </h2>
              <Button variant="secondary" className="mb-3 h-11 w-full" onClick={() => locate("pickup")}>
                <LocateFixed className="size-4" /> استخدم موقعي الحالي
              </Button>
              {pickup && (
                <p className="mb-2 text-xs text-success">
                  الإحداثيات: {pickup.lat.toFixed(4)}، {pickup.lng.toFixed(4)}
                </p>
              )}
              <Input
                value={pickupText}
                onChange={(e) => setPickupText(e.target.value)}
                placeholder="من وين نأخذك؟ المنطقة، الشارع، أقرب نقطة دالة"
                className="h-12"
              />
            </section>

            <section className="rounded-2xl bg-card p-4 shadow-soft">
              <h2 className="mb-3 flex items-center gap-2 font-bold">
                <Navigation className="size-4 text-primary" /> الوجهة
              </h2>
              <Button variant="secondary" className="mb-3 h-11 w-full" onClick={() => locate("dest")}>
                <LocateFixed className="size-4" /> تحديد الوجهة بموقعي الحالي
              </Button>
              {dest && (
                <p className="mb-2 text-xs text-success">
                  الإحداثيات: {dest.lat.toFixed(4)}، {dest.lng.toFixed(4)}
                </p>
              )}
              <Input
                value={destinationText}
                onChange={(e) => setDestinationText(e.target.value)}
                placeholder="لوين رايح؟ المنطقة، الشارع، أقرب نقطة دالة"
                className="h-12"
              />
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات للسائق (اختياري)"
                className="mt-3"
              />
            </section>

            <section className="rounded-2xl bg-card p-4 text-sm shadow-soft">
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">المسافة التقريبية</span>
                <span>{fareQuote ? `${fareQuote.km.toFixed(1)} كم` : "—"}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">الوقت التقريبي</span>
                <span>{fareQuote?.etaMinutes ? `${fareQuote.etaMinutes} دقيقة` : "—"}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-bold">
                <span>الأجرة</span>
                <span>{fareQuote ? formatIQD(fareQuote.fare) : "يتم الحساب…"}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                الدفع نقداً · الأجرة تُحتسب في الخادم حسب فئة المركبة والمسافة.
              </p>
            </section>

            <Button className="h-13 w-full text-base" disabled={saving} onClick={send}>
              {account?.userId ? "اطلب السائق" : "سجّل الدخول لطلب رحلة"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              عندك سيارة وتحب تشتغل ويانا؟{" "}
              <Link to="/join/driver" className="font-semibold text-primary">
                انضم كسائق
              </Link>
            </p>
          </>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
