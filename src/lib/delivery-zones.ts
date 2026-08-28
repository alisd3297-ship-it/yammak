import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { distanceKm } from "@/lib/orders";

export type DeliveryZone = {
  id: string;
  name: string;
  cityId: string | null;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number;
  baseFee: number;
  perKmFee: number;
  minFee: number;
  maxFee: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  surgeMultiplier: number;
  isActive: boolean;
  sortOrder: number;
};

/** مناطق التوصيل الذكية المفعّلة (قراءة عامة للتسعير والتقدير). */
export function useDeliveryZones() {
  return useQuery({
    queryKey: ["delivery-zones"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DeliveryZone[]> => {
      const { data, error } = await supabase
        .from("delivery_zones")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) return [];
      return (data ?? []).map(mapZone);
    },
  });
}

export function mapZone(row: Record<string, unknown>): DeliveryZone {
  const n = (v: unknown, fallback = 0) => (v == null ? fallback : Number(v));
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    cityId: (row["city_id"] as string | null) ?? null,
    centerLat: row["center_lat"] == null ? null : Number(row["center_lat"]),
    centerLng: row["center_lng"] == null ? null : Number(row["center_lng"]),
    radiusKm: n(row["radius_km"], 5),
    baseFee: n(row["base_fee"], 2000),
    perKmFee: n(row["per_km_fee"], 500),
    minFee: n(row["min_fee"], 1000),
    maxFee: n(row["max_fee"], 15000),
    etaMinMinutes: n(row["eta_min_minutes"], 25),
    etaMaxMinutes: n(row["eta_max_minutes"], 45),
    surgeMultiplier: n(row["surge_multiplier"], 1),
    isActive: Boolean(row["is_active"]),
    sortOrder: n(row["sort_order"], 0),
  };
}

/** اختيار المنطقة التي يقع فيها الموقع، أو أقربها إذا كان خارج كل النطاقات. */
export function zoneForPoint(
  zones: DeliveryZone[] | undefined,
  point: { lat: number; lng: number } | null,
): DeliveryZone | null {
  if (!zones?.length) return null;
  if (!point) return zones[0] ?? null;
  const scored = zones
    .filter((z) => z.centerLat != null && z.centerLng != null)
    .map((z) => ({ zone: z, km: distanceKm(point.lat, point.lng, z.centerLat!, z.centerLng!) }))
    .sort((a, b) => a.km - b.km);
  const inside = scored.find((s) => s.km <= s.zone.radiusKm);
  return inside?.zone ?? scored[0]?.zone ?? zones[0] ?? null;
}

export type LoadLevel = "low" | "medium" | "high";

export const LOAD_LABELS: Record<LoadLevel, string> = {
  low: "ضغط خفيف",
  medium: "ضغط متوسط",
  high: "ضغط عالي",
};

export const LOAD_TONES: Record<LoadLevel, string> = {
  low: "bg-success/15 text-success",
  medium: "bg-warning/20 text-warning-foreground",
  high: "bg-destructive/15 text-destructive",
};

export function loadLevelOf(activeOrders: number): LoadLevel {
  if (activeOrders >= 25) return "high";
  if (activeOrders >= 10) return "medium";
  return "low";
}

export function loadSurge(level: LoadLevel): number {
  if (level === "high") return 1.25;
  if (level === "medium") return 1.1;
  return 1;
}

/** مؤشر ضغط الطلبات الحالي على المنصة (آخر 45 دقيقة). */
export function useOrdersLoad() {
  return useQuery({
    queryKey: ["orders-load"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{ active: number; level: LoadLevel }> => {
      const since = new Date(Date.now() - 45 * 60_000).toISOString();
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since)
        .not("status", "in", "(completed,cancelled,delivered)");
      const active = count ?? 0;
      return { active, level: loadLevelOf(active) };
    },
  });
}

/** تسعير ذكي: رسوم أساس المنطقة + المسافة + معامل الذروة، ضمن حدّي المنطقة. */
export function smartDeliveryFee(input: {
  zone: DeliveryZone | null;
  km: number;
  level?: LoadLevel;
}): number {
  const z = input.zone;
  const base = z?.baseFee ?? 2000;
  const perKm = z?.perKmFee ?? 500;
  const min = z?.minFee ?? 1000;
  const max = z?.maxFee ?? 15000;
  const surge = (z?.surgeMultiplier ?? 1) * loadSurge(input.level ?? "low");
  const raw = (base + Math.max(input.km, 0) * perKm) * surge;
  return Math.round(Math.min(Math.max(raw, min), max) / 250) * 250;
}

/** توقع وقت الوصول بالدقائق حسب المنطقة، المسافة، وقت التحضير، وضغط الطلبات. */
export function estimateEta(input: {
  zone: DeliveryZone | null;
  km: number;
  prepMinutes?: number;
  level?: LoadLevel;
}): { min: number; max: number; label: string } {
  const z = input.zone;
  const prep = input.prepMinutes ?? 0;
  const travel = Math.round(Math.max(input.km, 0) * 3);
  const extra = input.level === "high" ? 12 : input.level === "medium" ? 6 : 0;
  const min = Math.max(10, (z?.etaMinMinutes ?? 25) + prep + travel + extra);
  const max = Math.max(min + 5, (z?.etaMaxMinutes ?? 45) + prep + travel + extra);
  return { min, max, label: `${min}–${max} دقيقة` };
}
