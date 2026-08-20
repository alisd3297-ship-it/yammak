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

export function formatAdPrice(price: number | null): string {
  if (price == null) return "السعر عند التواصل";
  return `${new Intl.NumberFormat("ar-IQ").format(price)} د.ع`;
}

export const AD_IMAGES_MAX = 5;
