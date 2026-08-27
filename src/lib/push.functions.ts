import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** تسجيل رمز جهاز (FCM/APNs) وربطه بالمستخدم الحالي. */
export const registerPushDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string; platform: string }) => ({
    token: String(data?.token ?? "").trim(),
    platform: ["android", "ios", "web"].includes(String(data?.platform))
      ? String(data.platform)
      : "android",
  }))
  .handler(async ({ data, context }) => {
    if (!data.token) return { ok: false as const, reason: "empty_token" };
    const { error } = await context.supabase.from("push_devices").upsert(
      {
        user_id: context.userId,
        token: data.token,
        platform: data.platform,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) return { ok: false as const, reason: error.message };
    return { ok: true as const };
  });

/** إلغاء تفعيل رمز جهاز (تسجيل خروج أو رفض إذن الإشعارات). */
export const deactivatePushDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "").trim() }))
  .handler(async ({ data, context }) => {
    if (!data.token) return { ok: true as const };
    await context.supabase
      .from("push_devices")
      .update({ is_active: false })
      .eq("user_id", context.userId)
      .eq("token", data.token);
    return { ok: true as const };
  });

/** هل إعدادات إرسال إشعارات الهاتف (FCM) مضبوطة على الخادم؟ */
export const pushDeliveryStatus = createServerFn({ method: "GET" }).handler(async () => {
  const configured = Boolean(
    process.env["FCM_SERVICE_ACCOUNT_JSON"] && process.env["FCM_PROJECT_ID"],
  );
  return { configured };
});
