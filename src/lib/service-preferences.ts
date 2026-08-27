import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount, isStaffAccount, isWorkerOnlyAccount } from "@/lib/auth";

/**
 * تفضيلات الخدمات: ما الذي يحب المستخدم استخدامه من لبابك؟
 * تُحفظ في profiles.preferred_services حتى لا تتكرر شاشة الاختيار كل تسجيل دخول،
 * ويمكن تعديلها لاحقاً من صفحة «حسابي».
 */

export type ServicePrefKey =
  | "restaurants"
  | "stores"
  | "pharmacies"
  | "courier"
  | "taxi"
  | "services";

export type ServicePrefOption = {
  key: ServicePrefKey;
  label: string;
  hint: string;
  emoji: string;
  to: string;
};

export const SERVICE_PREF_OPTIONS: ServicePrefOption[] = [
  { key: "restaurants", label: "المطاعم", hint: "أكل وطلبات سفري", emoji: "🍔", to: "/restaurants" },
  { key: "stores", label: "المتاجر والسوبرماركت", hint: "تسوّق يومي", emoji: "🛒", to: "/stores" },
  { key: "pharmacies", label: "الصيدليات", hint: "أدوية ومستلزمات", emoji: "💊", to: "/pharmacies" },
  { key: "courier", label: "التوصيل", hint: "مندوب وتوصيل خاص", emoji: "🛵", to: "/courier" },
  { key: "taxi", label: "التاكسي", hint: "نقل ورحلات", emoji: "🚕", to: "/taxi" },
  { key: "services", label: "الخدمات والمهن", hint: "كهربائي، سباك وغيرهم", emoji: "🧰", to: "/services" },
];

const VALID_KEYS = new Set(SERVICE_PREF_OPTIONS.map((o) => o.key));

export function sanitizePrefs(values: string[] | null | undefined): ServicePrefKey[] {
  return (values ?? []).filter((v): v is ServicePrefKey => VALID_KEYS.has(v as ServicePrefKey));
}

/** أول وجهة مناسبة حسب اختيارات المستخدم (أو الرئيسية عند تعدد الاختيارات). */
export function routeForPrefs(prefs: ServicePrefKey[]): string {
  if (prefs.length !== 1) return "/";
  return SERVICE_PREF_OPTIONS.find((o) => o.key === prefs[0])?.to ?? "/";
}

export function useServicePreferences() {
  const { data: account } = useAccount();
  const userId = account?.userId ?? null;

  const query = useQuery({
    queryKey: ["service-preferences", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("preferred_services, preferences_set_at")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return {
        prefs: sanitizePrefs(data?.preferred_services ?? []),
        isSet: !!data?.preferences_set_at,
      };
    },
  });

  return {
    userId,
    prefs: query.data?.prefs ?? [],
    isSet: query.data?.isSet ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    /** حسابات الإدارة/المندوب/التاجر لا تحتاج شاشة اختيار خدمات الزبون. */
    needsOnboarding:
      !!userId &&
      !isStaffAccount(account) &&
      !isWorkerOnlyAccount(account) &&
      !account?.provider &&
      query.isSuccess &&
      !query.data.isSet,
  };
}

export function useSaveServicePreferences() {
  const qc = useQueryClient();
  return async (userId: string, prefs: ServicePrefKey[]) => {
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_services: prefs, preferences_set_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["service-preferences", userId] });
  };
}
