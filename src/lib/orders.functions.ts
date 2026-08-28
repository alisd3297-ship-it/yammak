import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

export type CartItemInput = { productId: string; quantity: number; notes?: string | null };

function friendly(message: string): string {
  if (message.includes("provider_closed")) return "المتجر مغلق حالياً";
  if (message.includes("provider_not_approved")) return "هذا المتجر غير مفعّل";
  if (message.includes("product_unavailable")) return "أحد المنتجات غير متوفر حالياً";
  if (message.includes("product_out_of_stock")) return "أحد المنتجات نفدت كميته";
  if (message.includes("product_provider_mismatch")) return "لا يمكن الطلب من متجرين بنفس السلة";
  if (message.includes("product_not_found")) return "أحد المنتجات لم يعد موجوداً";
  if (message.includes("missing_dropoff")) return "حدد موقع التوصيل أو اكتب العنوان";
  if (message.includes("empty_cart")) return "سلتك فارغة";
  if (message.includes("transition_not_allowed"))
    return "لا يمكن تنفيذ هذا الإجراء على حالة الطلب الحالية";
  if (message.includes("order_already_assigned")) return "تم إسناد الطلب لمندوب آخر";
  if (message.includes("offer_expired")) return "انتهت مهلة العرض";
  if (message.includes("offer_not_active")) return "هذا العرض لم يعد متاحاً";
  if (message.includes("phone_verification_required")) return "أكمل تأكيد رقم هاتفك أولاً";
  if (message.includes("order_not_found")) return "الطلب غير موجود";
  if (message.includes("forbidden") || message.includes("unauthorized"))
    return "غير مصرح بهذا الإجراء";
  return message.trim()
    ? `تعذر تنفيذ العملية: ${message.trim()}`
    : "تعذر تنفيذ العملية، حاول مرة ثانية";
}

/**
 * إنشاء الطلب من الخادم: الواجهة ترسل المنتجات والكميات والعنوان فقط،
 * وقاعدة البيانات تجلب الأسعار والتوفر وتحسب المجاميع وأجرة التوصيل.
 */
export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      providerId: string;
      items: CartItemInput[];
      address: string;
      lat?: number | null;
      lng?: number | null;
      notes?: string | null;
      fulfillment?: "delivery" | "takeaway" | "dine_in";
      partySize?: number | null;
      scheduledAt?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const items = (data.items ?? [])
      .filter((i) => i && i.productId && Number(i.quantity) > 0)
      .map((i) => ({
        product_id: i.productId,
        quantity: Math.min(Math.max(Math.trunc(Number(i.quantity)), 1), 50),
        notes: i.notes ?? null,
      }));
    if (!items.length) throw new Error("سلتك فارغة");

    const fulfillment =
      data.fulfillment === "takeaway" || data.fulfillment === "dine_in"
        ? data.fulfillment
        : "delivery";

    const { data: order, error } = await context.supabase.rpc("create_customer_order", {
      _provider_id: data.providerId,
      _items: items,
      _dropoff_text: (data.address ?? "").trim(),
      ...(data.lat != null ? { _dropoff_lat: data.lat } : {}),
      ...(data.lng != null ? { _dropoff_lng: data.lng } : {}),
      ...(data.notes ? { _notes: data.notes } : {}),
      _fulfillment: fulfillment,
      ...(fulfillment === "dine_in" && data.partySize ? { _party_size: data.partySize } : {}),
      ...(fulfillment === "dine_in" && data.scheduledAt ? { _scheduled_at: data.scheduledAt } : {}),
    });
    if (error || !order) throw new Error(friendly(error?.message ?? ""));

    return {
      id: order.id,
      code: order.code,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.delivery_fee),
      total: Number(order.total),
    };
  });

/** المسار المركزي الوحيد لتغيير حالة الطلب (يتحقق من الدور والحالة والانتقال). */
export const changeOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; status: OrderStatus; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase.rpc("change_order_status", {
      _order_id: data.orderId,
      _new_status: data.status,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error || !order) {
      // نُسجّل السبب الأصلي في سجل الخادم حتى لا يُخفى الخطأ الحقيقي
      console.error("[changeOrderStatus] failed", {
        orderId: data.orderId,
        status: data.status,
        message: error?.message ?? "no_row_returned",
      });
      throw new Error(friendly(error?.message ?? ""));
    }

    // الإلغاء يسجل طلب استرداد داخل قاعدة البيانات، وهنا ننفّذه فعلياً لدى مزود الدفع
    if (data.status === "cancelled") {
      try {
        const { processPendingRefunds } = await import("@/lib/payments.server");
        await processPendingRefunds();
      } catch {
        // فشل التنفيذ الفوري لا يلغي الإلغاء؛ الصيانة الدورية تعيد المحاولة
      }
    }

    // «الطلب جاهز»: نبدأ البحث عن مندوب من الخادم مباشرة، فلا يعتمد التوزيع على
    // نجاح نداء إضافي من المتصفح. أي فشل هنا تلتقطه الصيانة الدورية كل دقيقة.
    if (data.status === "ready_for_pickup") {
      try {
        const { runDispatch } = await import("@/lib/dispatch.server");
        await runDispatch(order.id);
      } catch (err) {
        console.error("[changeOrderStatus] auto dispatch failed", {
          orderId: order.id,
          message: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    return { id: order.id, status: order.status as OrderStatus };
  });


/**
 * تقدير أجرة التوصيل قبل تأكيد الطلب اعتماداً على قواعد التسعير،
 * بنفس نوع الطلب الذي ستستخدمه قاعدة البيانات عند الإنشاء (مطعم/متجر)
 * حتى يتطابق السعر المعروض مع المبلغ النهائي.
 */
export const quoteDeliveryFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string; lat?: number | null; lng?: number | null }) => data)
  .handler(async ({ data, context }) => {
    const { data: provider } = await context.supabase
      .from("providers")
      .select("id, city_id, lat, lng, kind")
      .eq("id", data.providerId)
      .maybeSingle();
    if (!provider) throw new Error("المتجر غير موجود");
    if (provider.kind !== "restaurant" && provider.kind !== "store")
      throw new Error("هذا النشاط لا يستقبل طلبات توصيل");
    const orderType = provider.kind === "store" ? "store" : "restaurant";

    // نفس دالة المسافة المستخدمة داخل create_customer_order (0 عند غياب الإحداثيات)
    let km = 0;
    if (provider.lat != null && provider.lng != null && data.lat != null && data.lng != null) {
      const { data: d } = await context.supabase.rpc("haversine_km", {
        a_lat: provider.lat,
        a_lng: provider.lng,
        b_lat: data.lat,
        b_lng: data.lng,
      });
      km = Number(d ?? 0);
    }

    const { data: fee } = await context.supabase.rpc("compute_delivery_fee", {
      _order_type: orderType,
      _city_id: provider.city_id as string,
      _provider_id: provider.id,
      _distance_km: km,
    });
    return { fee: Number(fee ?? 0), km, orderType };
  });
