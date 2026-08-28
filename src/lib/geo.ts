import { useEffect, useState } from "react";
import { OPERATING_LOCATION_COORDS, OPERATING_LOCATION_LABEL } from "@/lib/location";

export type GeoPoint = { lat: number; lng: number };

export type GeoState = {
  point: GeoPoint;
  /** هل هذا موقع المستخدم الحقيقي أم الموقع الافتراضي لمنطقة التشغيل؟ */
  precise: boolean;
  status: "idle" | "loading" | "granted" | "denied" | "unsupported";
  label: string;
  retry: () => void;
};

/**
 * موقع المستخدم مع بديل آمن: عند رفض الإذن أو تعذر القراءة نستخدم مركز منطقة
 * التشغيل حتى تبقى كل الشاشات المعتمدة على الموقع تعمل بدون كسر.
 */
export function useUserLocation(): GeoState {
  const [point, setPoint] = useState<GeoPoint>(OPERATING_LOCATION_COORDS);
  const [precise, setPrecise] = useState(false);
  const [status, setStatus] = useState<GeoState["status"]>("idle");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus("loading");
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (cancelled) return;
        setPoint({ lat: p.coords.latitude, lng: p.coords.longitude });
        setPrecise(true);
        setStatus("granted");
      },
      () => {
        if (cancelled) return;
        setPoint(OPERATING_LOCATION_COORDS);
        setPrecise(false);
        setStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 120_000 },
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    point,
    precise,
    status,
    label: precise ? "موقعك الحالي" : OPERATING_LOCATION_LABEL,
    retry: () => setTick((t) => t + 1),
  };
}

/** مسافة تقريبية بالكيلومتر بين نقطتين. */
export function kmBetween(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** نص مختصر للمسافة يناسب الواجهة العربية. */
export function formatKm(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} م`;
  return `${km.toFixed(1)} كم`;
}

/** رابط اتجاهات يعمل بدون أي مفتاح خرائط. */
export function directionsUrl(to: GeoPoint, from?: GeoPoint | null): string {
  const dest = `${to.lat},${to.lng}`;
  if (from) {
    return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${dest}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${dest}`;
}

/** خريطة OpenStreetMap مضمّنة (بدون مفتاح) حول نقطة محددة. */
export function osmEmbedUrl(center: GeoPoint, zoomDelta = 0.02): string {
  const d = zoomDelta;
  const bbox = `${center.lng - d},${center.lat - d},${center.lng + d},${center.lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.lat},${center.lng}`;
}
