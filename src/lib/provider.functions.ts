import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type ProviderKind = Database["public"]["Enums"]["provider_kind"];
type ProviderStatus = Database["public"]["Enums"]["provider_status"];

function friendly(message: string): string {
  if (message.includes("provider_already_exists")) return "عندك طلب أو متجر مسجّل بحسابك مسبقاً";
  if (message.includes("kind_not_allowed")) return "نوع النشاط غير مدعوم حالياً";
  if (message.includes("missing_name")) return "اكتب اسم النشاط";
  if (message.includes("missing_category")) return "اختر تصنيف المهنة";
  if (message.includes("provider_not_found")) return "الطلب غير موجود";
  if (message.includes("forbidden") || message.includes("unauthorized")) return "غير مصرح بهذا الإجراء";
  return "تعذر تنفيذ العملية، حاول مرة ثانية";
}

/** تقديم طلب انضمام كمزوّد — يُنشأ دائماً بحالة «قيد المراجعة» من الخادم. */
export const applyAsProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      kind: ProviderKind;
      name: string;
      description?: string | null;
      phone?: string | null;
      cityId?: string | null;
      addressText?: string | null;
      lat?: number | null;
      lng?: number | null;
      professionCategoryId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: provider, error } = await context.supabase.rpc("apply_as_provider", {
      _kind: data.kind,
      _name: (data.name ?? "").trim(),
      ...(data.description ? { _description: data.description } : {}),
      ...(data.phone ? { _phone: data.phone } : {}),
      ...(data.cityId ? { _city_id: data.cityId } : {}),
      ...(data.addressText ? { _address_text: data.addressText } : {}),
      ...(data.lat != null ? { _lat: data.lat } : {}),
      ...(data.lng != null ? { _lng: data.lng } : {}),
      ...(data.professionCategoryId ? { _profession_category_id: data.professionCategoryId } : {}),
    });
    if (error || !provider) throw new Error(friendly(error?.message ?? ""));
    return { id: provider.id, status: provider.status as ProviderStatus };
  });

/** تغيير حالة اعتماد المزوّد — طاقم الإدارة فقط (التحقق داخل قاعدة البيانات). */
export const setProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string; status: ProviderStatus; reason?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { data: provider, error } = await context.supabase.rpc("set_provider_status", {
      _provider_id: data.providerId,
      _status: data.status,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error || !provider) throw new Error(friendly(error?.message ?? ""));
    return { id: provider.id, status: provider.status as ProviderStatus };
  });
