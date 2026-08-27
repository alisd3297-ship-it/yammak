import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** توزيع الطلب على أقرب مندوب مناسب (يستدعى بعد جاهزية الطلب). */
export const dispatchOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data, context }) => {
    const actor = await context.supabase.rpc("order_actor", {
      _user_id: context.userId,
      _order_id: data.orderId,
    });
    if (!actor.data || !["provider", "staff"].includes(actor.data)) throw new Error("غير مصرح");

    const { runDispatch } = await import("@/lib/dispatch.server");
    return runDispatch(data.orderId);
  });

/** رد المندوب على العرض: قبول ذري أو رفض ثم إعادة التوزيع لمندوب آخر. */
export const respondToOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { offerId: string; accept: boolean; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    if (data.accept) {
      const { data: order, error } = await context.supabase.rpc("accept_delivery_offer", {
        _offer_id: data.offerId,
      });
      if (error || !order) {
        const msg = error?.message ?? "";
        if (msg.includes("order_already_assigned")) throw new Error("تم إسناد الطلب لمندوب آخر");
        if (msg.includes("offer_expired")) throw new Error("انتهت مهلة العرض");
        throw new Error("تعذر قبول العرض");
      }
      return { ok: true, accepted: true, orderId: order.id };
    }

    const { data: orderId, error } = await context.supabase.rpc("reject_delivery_offer", {
      _offer_id: data.offerId,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error("تعذر رفض العرض");

    if (orderId) {
      const { runDispatch } = await import("@/lib/dispatch.server");
      try {
        await runDispatch(orderId);
      } catch {
        // يبقى الطلب في حالة البحث عن مندوب وتلتقطه الصيانة الدورية
      }
    }
    return { ok: true, accepted: false, orderId };
  });

/** صيانة: إنهاء العروض المنتهية، إعادة التوزيع، وإكمال الطلبات المسلَّمة. */
export const runDispatchMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("غير مصرح");
    const { runMaintenance } = await import("@/lib/dispatch.server");
    return runMaintenance();
  });

/** تعيين مندوب يدوياً من قبل الإدارة. */
export const assignDriverManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; driverId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("غير مصرح");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // التعيين اليدوي يمر عبر انتقالات الحالة المسموحة داخل قاعدة البيانات
    const { error } = await supabaseAdmin.rpc("system_assign_driver", {
      _order_id: data.orderId,
      _driver_id: data.driverId,
    });
    if (error) {
      const m = error.message ?? "";
      if (m.includes("order_already_assigned")) throw new Error("الطلب مسند لمندوب آخر");
      if (m.includes("order_closed")) throw new Error("الطلب منتهي");
      if (m.includes("driver_not_eligible")) throw new Error("هذا المندوب غير معتمد للتوصيل");
      if (m.includes("order_not_dispatchable"))
        throw new Error("حالة الطلب لا تسمح بتعيين مندوب الآن");
      throw new Error("تعذر تعيين المندوب");
    }
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "assign_driver",
      entity: "orders",
      entity_id: data.orderId,
      after_data: { driver_id: data.driverId },
    });
    return { ok: true };
  });
