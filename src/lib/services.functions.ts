import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type ServiceStatus = Database["public"]["Enums"]["service_request_status"];

function friendly(message: string): string {
  if (message.includes("service_not_found")) return "هذه الخدمة لم تعد موجودة";
  if (message.includes("service_unavailable")) return "هذه الخدمة غير متاحة حالياً";
  if (message.includes("provider_not_approved")) return "مقدم الخدمة غير مفعّل";
  if (message.includes("provider_kind_not_service")) return "هذا المزوّد ليس مقدم خدمة مهنية";
  if (message.includes("cannot_order_own_service")) return "لا تقدر تطلب خدمتك بنفسك";
  if (message.includes("missing_location")) return "حدد موقعك أو اكتب العنوان";
  if (message.includes("invalid_schedule")) return "الموعد المختار غير صالح";
  if (message.includes("request_not_completed")) return "التقييم متاح بعد إكمال الخدمة";
  if (message.includes("already_rated")) return "قيّمت هذه الخدمة مسبقاً";
  if (message.includes("invalid_stars")) return "اختر تقييماً بين 1 و5";
  if (message.includes("transition_not_allowed")) return "لا يمكن تنفيذ هذا الإجراء على حالة الطلب الحالية";
  if (message.includes("forbidden") || message.includes("unauthorized")) return "غير مصرح بهذا الإجراء";
  return "تعذر تنفيذ العملية، حاول مرة ثانية";
}

/** إنشاء طلب خدمة — السعر ولقطة الخدمة تُجلب من قاعدة البيانات لا من الواجهة. */
export const createServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      serviceId: string;
      address: string;
      description?: string | null;
      lat?: number | null;
      lng?: number | null;
      scheduledAt?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: request, error } = await context.supabase.rpc("create_service_request", {
      _service_id: data.serviceId,
      _address_text: (data.address ?? "").trim(),
      ...(data.description ? { _description: data.description } : {}),
      ...(data.lat != null ? { _lat: data.lat } : {}),
      ...(data.lng != null ? { _lng: data.lng } : {}),
      ...(data.scheduledAt ? { _scheduled_at: data.scheduledAt } : {}),
    });
    if (error || !request) throw new Error(friendly(error?.message ?? ""));
    return { id: request.id, code: request.code, status: request.status as ServiceStatus };
  });

/** المسار المركزي الوحيد لتغيير حالة طلب الخدمة. */
export const changeServiceRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { requestId: string; status: ServiceStatus; reason?: string | null; scheduledAt?: string | null }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    const { data: request, error } = await context.supabase.rpc("change_service_request_status", {
      _request_id: data.requestId,
      _new_status: data.status,
      ...(data.reason ? { _reason: data.reason } : {}),
      ...(data.scheduledAt ? { _scheduled_at: data.scheduledAt } : {}),
    });
    if (error || !request) throw new Error(friendly(error?.message ?? ""));
    return { id: request.id, status: request.status as ServiceStatus };
  });

/** تقييم الخدمة بعد الإكمال — الزبون صاحب الطلب فقط. */
export const rateServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string; stars: number; comment?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { data: rating, error } = await context.supabase.rpc("rate_service_request", {
      _request_id: data.requestId,
      _stars: Math.min(Math.max(Math.trunc(Number(data.stars)), 1), 5),
      ...(data.comment ? { _comment: data.comment } : {}),
    });
    if (error || !rating) throw new Error(friendly(error?.message ?? ""));
    return { id: rating.id, stars: rating.stars };
  });
