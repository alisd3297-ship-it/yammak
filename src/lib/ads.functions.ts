import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AdStatus = Database["public"]["Enums"]["ad_status"];

const MAX_IMAGES = 5;

function friendly(message: string): string {
  if (message.includes("ad_category_not_found")) return "فئة الإعلان غير متاحة";
  if (message.includes("ad_images_limit")) return "الحد الأقصى 5 صور للإعلان";
  if (message.includes("too_many_active_ads")) return "عندك إعلانات نشطة كثيرة، انتظر مراجعتها أولاً";
  if (message.includes("ads_title_len")) return "عنوان الإعلان لازم بين 3 و120 حرف";
  if (message.includes("ads_body_len")) return "نص الإعلان لازم بين 5 و2000 حرف";
  if (message.includes("ads_phone_len")) return "رقم الاتصال غير صحيح";
  if (message.includes("ads_address_len")) return "العنوان غير صحيح";
  if (message.includes("ads_price_positive")) return "السعر غير صالح";
  if (message.includes("ad_currency_invalid") || message.includes("ads_currency_valid")) return "العملة غير مدعومة";
  if (message.includes("ads_governorate_valid")) return "المحافظة غير صحيحة";
  if (message.includes("ad_not_found")) return "الإعلان غير موجود";
  if (message.includes("forbidden") || message.includes("unauthorized")) return "غير مصرح بهذا الإجراء";
  return "تعذر تنفيذ العملية، حاول مرة ثانية";
}

/** التحقق النهائي من الصور يتم هنا وفي قاعدة البيانات، لا في المتصفح. الصور اختيارية. */
function sanitizeImages(images: string[] | undefined, userId: string): string[] {
  const clean = Array.from(
    new Set((images ?? []).map((p) => String(p).trim()).filter((p) => p.length > 0)),
  );
  if (clean.length > MAX_IMAGES) throw new Error("ad_images_limit");
  for (const path of clean) {
    if (!path.startsWith(`${userId}/`) || path.includes("..")) throw new Error("forbidden");
  }
  return clean;
}

/** إنشاء إعلان جديد — يبدأ دائماً بحالة «قيد المراجعة». */
export const createAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      categoryId: string;
      title: string;
      body: string;
      contactPhone: string;
      addressText: string;
      images?: string[];
      price?: number | null;
      currency?: string | null;
      governorate?: string | null;
      cityId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    let images: string[];
    try {
      images = sanitizeImages(data.images, context.userId);
    } catch (error) {
      throw new Error(friendly((error as Error).message));
    }

    const { data: ad, error } = await context.supabase.rpc("create_ad", {
      _category_id: data.categoryId,
      _title: (data.title ?? "").trim(),
      _body: (data.body ?? "").trim(),
      _contact_phone: (data.contactPhone ?? "").trim(),
      _address_text: (data.addressText ?? "").trim(),
      _images: images,
      _currency: data.currency === "USD" ? "USD" : "IQD",
      ...((data.governorate ?? "").trim() ? { _governorate: (data.governorate ?? "").trim() } : {}),
      ...(data.price != null ? { _price: data.price } : {}),
      ...(data.cityId ? { _city_id: data.cityId } : {}),
    });
    if (error || !ad) throw new Error(friendly(error?.message ?? ""));
    return { id: ad.id as string, status: ad.status as AdStatus };
  });

/** قرار الإدارة على الإعلان: نشر، رفض، إيقاف، أو إعادة للمراجعة — مع الترتيب وتاريخ الانتهاء. */
export const setAdStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      adId: string;
      status: AdStatus;
      reason?: string | null;
      sortOrder?: number | null;
      expiresAt?: string | null;
      categoryId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: ad, error } = await context.supabase.rpc("set_ad_status", {
      _ad_id: data.adId,
      _status: data.status,
      ...(data.reason ? { _reason: data.reason } : {}),
      ...(data.sortOrder != null ? { _sort_order: data.sortOrder } : {}),
      ...(data.expiresAt ? { _expires_at: data.expiresAt } : {}),
      ...(data.categoryId ? { _category_id: data.categoryId } : {}),
    });
    if (error || !ad) throw new Error(friendly(error?.message ?? ""));
    return { id: ad.id as string, status: ad.status as AdStatus };
  });

/** حذف إعلان — للمالك فقط عبر سياسات الصفوف. */
export const deleteAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { adId: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ads").delete().eq("id", data.adId);
    if (error) throw new Error(friendly(error.message));
    return { ok: true };
  });
