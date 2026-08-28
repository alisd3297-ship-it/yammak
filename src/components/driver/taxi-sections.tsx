import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DriverStandQueue } from "@/components/taxi-stands";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MapPin, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/auth";
import { changeTripStatus, respondToTripOffer } from "@/lib/taxi.functions";
import {
  TAXI_DRIVER_STEPS,
  TRIP_STATUS_LABELS,
  taxiClassLabel,
  tripTone,
  type TripStatus,
} from "@/lib/taxi";
import { formatIQD } from "@/lib/orders";

/** أقسام التاكسي للسائق (عروض ورحلة حالية) — نفس المنطق السابق بترتيب أوضح. */
export function TaxiSections({ enabled }: { enabled: boolean }) {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const respondTrip = useServerFn(respondToTripOffer);
  const setTripStatus = useServerFn(changeTripStatus);

  const { data: tripOffers } = useQuery({
    queryKey: ["driver-trip-offers", account?.userId],
    enabled: !!account?.userId && enabled,
    refetchInterval: 8_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("trip_offers")
        .select(
          "id, trip_id, distance_km, expires_at, trips(code, fare, taxi_class, passengers, pickup_text, destination_text, distance_km, notes)",
        )
        .eq("driver_id", account!.userId!)
        .eq("status", "sent")
        .gt("expires_at", new Date().toISOString());
      return data ?? [];
    },
  });

  const { data: activeTrips } = useQuery({
    queryKey: ["driver-trips", account?.userId],
    enabled: !!account?.userId && enabled,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("trips")
        .select(
          "id, code, status, fare, taxi_class, passengers, pickup_text, pickup_lat, pickup_lng, destination_text, destination_lat, destination_lng, notes",
        )
        .eq("driver_id", account!.userId!)
        .in("status", ["driver_assigned", "driver_arriving", "driver_arrived", "in_progress"]);
      return data ?? [];
    },
  });

  async function answerTrip(offerId: string, accept: boolean) {
    try {
      await respondTrip({
        data: accept ? { offerId, accept } : { offerId, accept, reason: "رفض السائق" },
      });
      toast.success(accept ? "قبلت الرحلة" : "تم رفض العرض");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الرد على العرض");
    }
    qc.invalidateQueries({ queryKey: ["driver-trip-offers"] });
    qc.invalidateQueries({ queryKey: ["driver-trips"] });
  }

  async function advanceTrip(tripId: string, next: TripStatus) {
    try {
      await setTripStatus({ data: { tripId, status: next } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث حالة الرحلة");
      return;
    }
    qc.invalidateQueries({ queryKey: ["driver-trips"] });
  }

  if (!enabled) return null;

  return (
    <>
      <DriverStandQueue />
      {!!tripOffers?.length && (
        <section>
          <h2 className="mb-3 text-base font-black">عروض رحلات تكسي</h2>
          <div className="space-y-3">
            {tripOffers.map((o) => {
              const tr = o.trips as {
                code: string;
                fare: number;
                taxi_class: string;
                passengers: number;
                pickup_text: string;
                destination_text: string;
                distance_km: number;
                notes: string | null;
              } | null;
              return (
                <article
                  key={o.id}
                  className="rounded-3xl border border-primary/30 bg-card p-4 shadow-card"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-black">رحلة #{tr?.code}</p>
                    <span className="text-lg font-black text-primary">
                      {formatIQD(Number(tr?.fare ?? 0))}
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Navigation className="size-3.5" /> يبعد {Number(o.distance_km ?? 0).toFixed(1)}{" "}
                    كم · طول الرحلة {Number(tr?.distance_km ?? 0).toFixed(1)} كم
                  </p>
                  <p className="mt-1 text-sm">من: {tr?.pickup_text}</p>
                  <p className="text-sm">إلى: {tr?.destination_text}</p>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    {taxiClassLabel(tr?.taxi_class)} · {tr?.passengers} راكب
                  </p>
                  {tr?.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">ملاحظات: {tr.notes}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button
                      className="h-14 flex-1 rounded-2xl font-black"
                      onClick={() => answerTrip(o.id, true)}
                    >
                      قبول الرحلة
                    </Button>
                    <Button
                      variant="outline"
                      className="h-14 rounded-2xl px-5"
                      onClick={() => answerTrip(o.id, false)}
                    >
                      رفض
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {!!activeTrips?.length && (
        <section>
          <h2 className="mb-3 text-base font-black">رحلتي الحالية</h2>
          <div className="space-y-3">
            {activeTrips.map((t) => {
              const step = TAXI_DRIVER_STEPS[t.status as TripStatus];
              return (
                <article key={t.id} className="rounded-3xl bg-card p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="font-black">رحلة #{t.code}</p>
                    <span className="text-lg font-black text-primary">
                      {formatIQD(Number(t.fare))}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusDot tone={tripTone(t.status as TripStatus)} />
                    {TRIP_STATUS_LABELS[t.status as TripStatus]} · {taxiClassLabel(t.taxi_class)} ·{" "}
                    {t.passengers} راكب
                  </p>
                  <p className="mt-2 flex items-start gap-2 text-sm">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> من: {t.pickup_text}
                  </p>
                  <p className="text-sm">إلى: {t.destination_text}</p>
                  {t.pickup_lat != null && (
                    <a
                      className="mt-2 inline-block text-xs font-bold text-primary"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${
                        t.status === "in_progress" ? t.destination_lat : t.pickup_lat
                      },${t.status === "in_progress" ? t.destination_lng : t.pickup_lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      فتح الاتجاهات
                    </a>
                  )}
                  {t.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">ملاحظات: {t.notes}</p>
                  )}
                  {step && (
                    <Button
                      className="mt-3 h-14 w-full rounded-2xl font-black"
                      onClick={() => advanceTrip(t.id, step.next)}
                    >
                      {step.label}
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
