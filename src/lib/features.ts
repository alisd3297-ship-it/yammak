import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FeatureFlag = {
  key: string;
  label: string;
  description: string | null;
  phase: number;
  is_enabled: boolean;
  rollout_percent: number;
  audience: "all" | "staff";
};

/** كل مفاتيح الميزات (قراءة عامة، غير حساسة). */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    staleTime: 60_000,
    queryFn: async (): Promise<FeatureFlag[]> => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("key, label, description, phase, is_enabled, rollout_percent, audience")
        .order("phase")
        .order("key");
      if (error) return [];
      return (data ?? []) as FeatureFlag[];
    },
  });
}

/**
 * فحص تقريبي على العميل لإظهار/إخفاء الواجهة فقط.
 * القرار النهائي دائماً في قاعدة البيانات عبر feature_enabled.
 */
export function useFeature(key: string): boolean {
  const { data } = useFeatureFlags();
  const flag = data?.find((f) => f.key === key);
  return Boolean(flag?.is_enabled);
}

export const PHASE_LABELS: Record<number, string> = {
  0: "الأساس",
  1: "المحفظة والتسويات",
  2: "النمو والولاء",
  3: "الكتالوج والمخزون",
  4: "العمليات والتوزيع",
  5: "التواصل والدعم",
  6: "أدوات التاجر",
  7: "التخصيص والاكتشاف",
  8: "الذكاء الاصطناعي",
  9: "الحماية والعلاقات",
};
