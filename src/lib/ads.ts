import type { Database } from "@/integrations/supabase/types";

export type AdStatus = Database["public"]["Enums"]["ad_status"];

export type AdCategory = {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
};

export type AdRow = {
  id: string;
  category_id: string;
  title: string;
  body: string;
  price: number | null;
  currency?: AdCurrency | string | null;
  governorate?: string | null;
  contact_phone: string;
  address_text: string;
  images: string[];
  status: AdStatus;
  rejection_reason?: string | null;
  sort_order: number;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export const AD_STATUS_LABEL: Record<AdStatus, string> = {
  pending: "قيد المراجعة",
  published: "منشور",
  rejected: "مرفوض",
  paused: "موقوف",
  expired: "منتهي",
};

export const AD_STATUS_TONE: Record<AdStatus, "success" | "danger" | "muted" | "warning"> = {
  pending: "warning",
  published: "success",
  rejected: "danger",
  paused: "muted",
  expired: "muted",
};

/** ألوان الشريط لكل فئة — أسماء نغمات معرّفة في styles.css فقط، بدون ألوان صريحة داخل المكونات. */
const TONES = ["brand", "emerald", "sky", "amber", "violet", "rose"] as const;
export type AdTone = (typeof TONES)[number];

export function adTone(color: string | null | undefined): AdTone {
  return (TONES as readonly string[]).includes(color ?? "") ? (color as AdTone) : "brand";
}

/** رابط عام لصورة الإعلان — يمر عبر مسار الخادم لأن مخزن الصور خاص. */
export function adImageUrl(path: string): string {
  return `/api/public/ad-image/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export type AdCurrency = "IQD" | "USD";

/** العملات المدعومة في الإعلانات والخدمات. */
export const AD_CURRENCIES: Array<{ value: AdCurrency; label: string; symbol: string }> = [
  { value: "IQD", label: "الدينار العراقي (IQD)", symbol: "د.ع" },
  { value: "USD", label: "الدولار الأمريكي (USD)", symbol: "$" },
];

export function adCurrency(value: string | null | undefined): AdCurrency {
  return value === "USD" ? "USD" : "IQD";
}

export function currencySymbol(value: string | null | undefined): string {
  return adCurrency(value) === "USD" ? "$" : "د.ع";
}

export function formatAdPrice(price: number | null, currency?: string | null): string {
  if (price == null) return "السعر عند التواصل";
  const amount = new Intl.NumberFormat("ar-IQ-u-nu-latn").format(price);
  return `${amount} ${currencySymbol(currency)}`;
}

/** المحافظات العراقية الـ18 — قيمة مخزّنة مع الإعلان ومستقلة عن حقل العنوان. */
export const IRAQ_GOVERNORATES = [
  "بغداد",
  "نينوى",
  "البصرة",
  "ذي قار",
  "ميسان",
  "المثنى",
  "القادسية",
  "واسط",
  "بابل",
  "كربلاء",
  "النجف",
  "ديالى",
  "الأنبار",
  "صلاح الدين",
  "كركوك",
  "أربيل",
  "السليمانية",
  "دهوك",
] as const;

export type IraqGovernorate = (typeof IRAQ_GOVERNORATES)[number];

export const AD_IMAGES_MAX = 5;
