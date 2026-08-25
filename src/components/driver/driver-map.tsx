import { useEffect, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { OPERATING_LOCATION_COORDS } from "@/lib/location";

type Point = { lat: number; lng: number; label: string };

/**
 * خريطة خفيفة داخل بطاقة المهمة: تعرض الهدف الحالي وموقع المندوب
 * وتفتح الاتجاهات في تطبيق الخرائط. بدون مكتبات إضافية حفاظاً على البنية الحالية.
 */
export function DriverMap({
  pickup,
  dropoff,
  target,
}: {
  pickup: Point | null;
  dropoff: Point | null;
  target: "pickup" | "dropoff";
}) {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setMe(OPERATING_LOCATION_COORDS),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const focus = (target === "pickup" ? pickup : dropoff) ?? dropoff ?? pickup ?? null;
  if (!focus) return null;

  const d = 0.012;
  const bbox = `${focus.lng - d},${focus.lat - d},${focus.lng + d},${focus.lat + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${focus.lat},${focus.lng}`;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border">
      <iframe
        title="خريطة المهمة"
        src={src}
        className="h-44 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <div className="grid grid-cols-2 gap-px bg-border">
        <MapLink point={pickup} me={me} label="اتجاهات الاستلام" active={target === "pickup"} />
        <MapLink point={dropoff} me={me} label="اتجاهات الزبون" active={target === "dropoff"} />
      </div>
    </div>
  );
}

function MapLink({
  point,
  me,
  label,
  active,
}: {
  point: Point | null;
  me: { lat: number; lng: number } | null;
  label: string;
  active: boolean;
}) {
  if (!point)
    return (
      <span className="bg-card px-3 py-3 text-center text-xs text-muted-foreground">
        الموقع غير متوفر
      </span>
    );
  const origin = me ? `&origin=${me.lat},${me.lng}` : "";
  return (
    <a
      href={`https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}${origin}`}
      target="_blank"
      rel="noreferrer"
      className={
        active
          ? "flex items-center justify-center gap-1.5 bg-primary px-3 py-3 text-xs font-bold text-primary-foreground"
          : "flex items-center justify-center gap-1.5 bg-card px-3 py-3 text-xs font-semibold text-primary"
      }
    >
      {active ? <Navigation className="size-4" /> : <MapPin className="size-4" />}
      {label}
    </a>
  );
}
