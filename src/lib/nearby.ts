import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kmBetween, type GeoPoint } from "@/lib/geo";

export type NearbyProvider = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  rating: number;
  isOpen: boolean;
  avgPrepMinutes: number;
  lat: number | null;
  lng: number | null;
  km: number | null;
};

export type NearbyPromotion = {
  id: string;
  title: string;
  description: string | null;
  discountPercent: number;
  endsAt: string | null;
  providerId: string;
  providerName: string;
  providerKind: string;
  km: number | null;
};

/** وجهة صفحة مقدم الخدمة حسب نوعه. */
export function providerRoute(kind: string): "/restaurants/$id" | "/stores/$id" | "/services/$id" {
  if (kind === "restaurant") return "/restaurants/$id";
  if (kind === "profession") return "/services/$id";
  return "/stores/$id";
}

/**
 * المتاجر والعروض القريبة من نقطة معيّنة.
 * الحساب يتم على العميل من إحداثيات مقدمي الخدمة المعتمدين، بدون أي مفتاح خرائط.
 */
export function useNearby(point: GeoPoint, radiusKm = 8) {
  const query = useQuery({
    queryKey: ["nearby-board"],
    staleTime: 60_000,
    queryFn: async () => {
      const [providersRes, promosRes] = await Promise.all([
        supabase
          .from("providers")
          .select("id, name, kind, description, rating, is_open, avg_prep_minutes, lat, lng")
          .eq("status", "approved")
          .eq("is_demo", false),
        supabase
          .from("promotions")
          .select(
            "id, title, description, discount_percent, ends_at, provider_id, providers(name, kind, lat, lng, status, is_demo)",
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(60),
      ]);
      return { providers: providersRes.data ?? [], promos: promosRes.data ?? [] };
    },
  });

  const data = useMemo(() => {
    const providers: NearbyProvider[] = (query.data?.providers ?? [])
      .map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind as string,
        description: p.description,
        rating: Number(p.rating ?? 0),
        isOpen: Boolean(p.is_open),
        avgPrepMinutes: Number(p.avg_prep_minutes ?? 0),
        lat: p.lat,
        lng: p.lng,
        km: p.lat != null && p.lng != null ? kmBetween(point, { lat: p.lat, lng: p.lng }) : null,
      }))
      .sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999));

    const promotions: NearbyPromotion[] = (query.data?.promos ?? [])
      .map((r) => {
        const prov = r.providers as {
          name: string;
          kind: string;
          lat: number | null;
          lng: number | null;
          status: string;
          is_demo: boolean;
        } | null;
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          discountPercent: Number(r.discount_percent ?? 0),
          endsAt: r.ends_at,
          providerId: r.provider_id,
          providerName: prov?.name ?? "",
          providerKind: prov?.kind ?? "store",
          km:
            prov?.lat != null && prov?.lng != null
              ? kmBetween(point, { lat: prov.lat, lng: prov.lng })
              : null,
          _ok: !!prov && prov.status === "approved" && !prov.is_demo,
        };
      })
      .filter((p) => p._ok)
      .map(({ _ok, ...p }) => p)
      .sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999));

    return {
      providers,
      promotions,
      nearProviders: providers.filter((p) => p.km == null || p.km <= radiusKm),
      nearPromotions: promotions.filter((p) => p.km == null || p.km <= radiusKm),
    };
  }, [query.data, point, radiusKm]);

  return { ...query, ...data };
}
