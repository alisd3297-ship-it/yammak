import { forwardRef } from "react";
import { Navigation, PackageCheck, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIQD, isCourierType } from "@/lib/orders";
import { vehicleLabel } from "@/lib/vehicles";
import type { DriverOffer } from "@/lib/driver-data";

const TYPE_LABELS: Record<string, string> = {
  restaurant: "طلب مطعم",
  store: "طلب متجر",
  courier: "توصيل مندوب",
  special_delivery: "توصيل خاص",
  profession: "خدمة مهنية",
};

/** بطاقة عرض توصيل جديدة: نوع الطلب، الاستلام، التسليم، المسافة، الأجر. */
export const OfferCard = forwardRef<
  HTMLElement,
  { offer: DriverOffer; focused?: boolean; onAccept: () => void; onReject: () => void }
>(function OfferCard({ offer, focused, onAccept, onReject }, ref) {
  const ord = offer.orders;
  const fee = Number(ord?.delivery_fee ?? 0);
  return (
    <article
      ref={ref}
      id={`offer-${offer.order_id}`}
      className={
        focused
          ? "rounded-3xl border-2 border-primary bg-primary/5 p-4 shadow-card ring-2 ring-primary/30"
          : "rounded-3xl border border-primary/30 bg-card p-4 shadow-card"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground">
            {TYPE_LABELS[ord?.order_type ?? ""] ?? "طلب"}
          </span>
          <p className="mt-2 text-base font-black">#{ord?.code}</p>
        </div>
        <div className="text-end">
          <p className="text-xl font-black text-primary">{formatIQD(fee || Number(ord?.total ?? 0))}</p>
          <p className="text-[11px] text-muted-foreground">{fee ? "أجر التوصيل" : "قيمة الطلب"}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-2xl bg-muted/60 p-3 text-sm">
        <p className="flex items-start gap-2">
          <PackageCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="font-semibold">{ord?.pickup_text ?? "نقطة الاستلام غير محددة"}</span>
        </p>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="font-semibold">{ord?.dropoff_text ?? "نقطة التسليم غير محددة"}</span>
        </p>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Navigation className="size-3.5" /> يبعد عنك {Number(offer.distance_km ?? 0).toFixed(1)} كم
          {ord?.vehicle_type ? ` · ${vehicleLabel(ord.vehicle_type)}` : ""}
          {ord?.cargo_weight_kg ? ` · ${ord.cargo_weight_kg} كغم` : ""}
        </p>
        {ord?.scheduled_at && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> الموعد: {new Date(ord.scheduled_at).toLocaleString("ar-IQ-u-nu-latn")}
          </p>
        )}
        {ord?.cargo_description && (
          <p className="text-xs text-muted-foreground">الحمولة: {ord.cargo_description}</p>
        )}
        {isCourierType(ord?.order_type) && ord?.notes && (
          <p className="text-xs text-muted-foreground">الوصف: {ord.notes}</p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button className="h-14 flex-1 rounded-2xl text-base font-black" onClick={onAccept}>
          قبول المهمة
        </Button>
        <Button variant="outline" className="h-14 rounded-2xl px-5 text-base" onClick={onReject}>
          رفض
        </Button>
      </div>
    </article>
  );
});
