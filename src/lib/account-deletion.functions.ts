import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * حذف نهائي وفعلي لحساب المستخدم:
 * 1) حذف البيانات الشخصية من قاعدة البيانات (دالة purge_user_personal_data).
 * 2) إبطال كل الجلسات والأجهزة.
 * 3) حذف حساب المصادقة نفسه فلا يعود ممكناً تسجيل الدخول.
 * السجلات المالية/القانونية (الطلبات، الرحلات، المدفوعات، الفواتير، التدقيق)
 * تبقى محفوظة لكن بدون أي بيانات شخصية مرتبطة بها.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("يجب تسجيل الدخول أولاً");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: purgeError } = await supabaseAdmin.rpc("purge_user_personal_data", {
      _user_id: userId,
    });
    if (purgeError) {
      console.error("[delete-account] purge failed", purgeError.message);
      throw new Error("تعذر حذف بياناتك، حاول مرة أخرى أو تواصل مع الدعم");
    }

    // حذف حساب المصادقة يبطل كل الجلسات والتوكنات المرتبطة به تلقائياً

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("[delete-account] auth delete failed", deleteError.message);
      throw new Error("تم حذف بياناتك لكن تعذر إغلاق الحساب، تواصل مع الدعم");
    }

    return { ok: true as const };
  });
