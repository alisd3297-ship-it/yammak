import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * الموقع التشغيلي الحالي للمنصة.
 * البنية تبقى قابلة للتوسع: نظام المحافظات الـ18 والمدن والمناطق كما هو،
 * وهذه القيم مجرد الافتراضي المستخدم في النماذج والفلاتر.
 */
export const OPERATING_LOCATION = {
  governorate: "كربلاء",
  cityName: "كربلاء",
  district: "قضاء الحسينية",
} as const;

/** نص الموقع الحالي المعروض للمستخدم (العنوان يبقى حقلاً منفصلاً). */
export const OPERATING_LOCATION_LABEL = `${OPERATING_LOCATION.governorate} — ${OPERATING_LOCATION.district}`;

/** بادئة العنوان المقترحة عند اختيار «الموقع الحالي». */
export const OPERATING_ADDRESS_PREFIX = `${OPERATING_LOCATION.district}، `;

/** مدينة التشغيل الافتراضية من قاعدة البيانات (مع بقاء بقية المدن متاحة). */
export function useOperatingCity() {
  return useQuery({
    queryKey: ["operating-city", OPERATING_LOCATION.cityName],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: city } = await supabase
        .from("cities")
        .select("id, name")
        .eq("name", OPERATING_LOCATION.cityName)
        .maybeSingle();
      if (!city) return null;
      const { data: area } = await supabase
        .from("areas")
        .select("id, name")
        .eq("city_id", city.id)
        .eq("name", OPERATING_LOCATION.district)
        .maybeSingle();
      return { cityId: city.id, cityName: city.name, areaId: area?.id ?? null, areaName: area?.name ?? null };
    },
  });
}
