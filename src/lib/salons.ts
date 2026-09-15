import { normalizeArabic } from "@/lib/search";

export const SALON_KEYWORD = "salon_cosmetics";

const BEAUTY_TERMS = [
  "صالون",
  "صالونات",
  "كوزمتك",
  "كوافير",
  "حلاق",
  "تجميل",
  "مكياج",
  "اظافر",
  "أظافر",
  "عناية بالبشرة",
  "beauty",
  "salon",
  "cosmetics",
];

export type SalonClassifiable = {
  name: string;
  description?: string | null;
  keywords?: string[] | null;
};

export function isSalonProvider(provider: SalonClassifiable): boolean {
  if ((provider.keywords ?? []).includes(SALON_KEYWORD)) return true;
  const text = normalizeArabic(
    [provider.name, provider.description, ...(provider.keywords ?? [])].filter(Boolean).join(" "),
  );
  return BEAUTY_TERMS.some((term) => text.includes(normalizeArabic(term)));
}

export function isBeautyCategoryName(name: string): boolean {
  const normalized = normalizeArabic(name);
  return BEAUTY_TERMS.some((term) => normalized.includes(normalizeArabic(term)));
}