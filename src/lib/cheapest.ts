import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * أقل سعر منتج متاح لكل متجر/مطعم.
 * تُستخدم لفرز «أرخص خيار» بدون الحاجة لتحميل الكتالوج كاملاً في الواجهة.
 */
export function useCheapestPrices(providerIds: string[]) {
  const key = [...providerIds].sort().join(",");
  return useQuery({
    queryKey: ["cheapest-prices", key],
    enabled: providerIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await supabase
        .from("products")
        .select("provider_id, price")
        .in("provider_id", providerIds)
        .eq("is_available", true);
      const out: Record<string, number> = {};
      for (const row of data ?? []) {
        const price = Number(row.price);
        const current = out[row.provider_id];
        if (!Number.isFinite(price)) continue;
        if (current == null || price < current) out[row.provider_id] = price;
      }
      return out;
    },
  });
}

/** ترتيب المتاجر من الأرخص للأغلى، والمتاجر بلا أسعار تنزل للآخر. */
export function sortByCheapest<T extends { id: string }>(
  rows: T[],
  prices: Record<string, number>,
): T[] {
  return [...rows].sort((a, b) => (prices[a.id] ?? Infinity) - (prices[b.id] ?? Infinity));
}
