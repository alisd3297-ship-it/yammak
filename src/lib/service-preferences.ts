import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Bike,
  Car,
  Pill,
  ShoppingCart,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAccount, isStaffAccount, isWorkerOnlyAccount } from "@/lib/auth";

/**
 * تفضيلات الخدمات: ما الذي يحب المستخدم استخدامه من لبابك؟
 * تُحفظ في profiles.preferred_services حتى لا تتكرر شاشة الاختيار كل تسجيل دخول،
 * ويمكن تعديلها لاحقاً من صفحة «حسابي».
 */

export type ServicePrefKey =
  "restaurants" | "stores" | "pharmacies" | "courier" | "taxi" | "services";

export type ServicePrefOption = {
  key: ServicePrefKey;
  label: string;
  hint: string;
  icon: LucideIcon;
  to: string;
};

export const SERVICE_PREF_OPTIONS: ServicePrefOption[] = [
  {
    key: "restaurants",
    label: "المطاعم",
    hint: "أكل وطلبات سفري",
    icon: UtensilsCrossed,
    to: "/restaurants",
  },
  {
    key: "stores",
    label: "المتاجر والسوبرماركت",
    hint: "تسوّق يومي",
    icon: ShoppingCart,
    to: "/stores",
  },
  { key: "pharmacies", label: "الصيدليات", hint: "أدوية ومستلزمات", icon: Pill, to: "/pharmacies" },
  { key: "courier", label: "التوصيل", hint: "مندوب وتوصيل خاص", icon: Bike, to: "/courier" },
  { key: "taxi", label: "التاكسي", hint: "نقل ورحلات", icon: Car, to: "/taxi" },
  {
    key: "services",
    label: "الخدمات والمهن",
    hint: "كهربائي، سباك وغيرهم",
    icon: Wrench,
    to: "/services",
  },
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

/**
 * يحوّل الزبون الجديد إلى شاشة اختيار الخدمات بعد أول تسجيل دخول فقط.
 * الحسابات ذات الأدوار الخاصة (إدارة/مندوب/تاجر) لا تتأثر.
 */
export function useOnboardingRedirect() {
  const navigate = useNavigate();
  const { needsOnboarding } = useServicePreferences();

  useEffect(() => {
    if (!needsOnboarding) return;
    navigate({ to: "/welcome", replace: true });
  }, [needsOnboarding, navigate]);

  return needsOnboarding;
}
