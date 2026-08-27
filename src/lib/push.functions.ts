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
    if (error) {
      console.error("[push] device upsert failed", error.message);
      return { ok: false as const, reason: error.message };
    }
    // أي رموز قديمة لنفس الجهاز/المستخدم تبقى، لكن نحدّث الرمز الحالي كنشط أعلاه
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

/**
 * فحص إعداد FCM من جهة الخادم دون كشف أي سرّ:
 * يُرجع فقط ما إذا كان كل عنصر موجوداً/صالح الشكل، لا القيم.
 */
export const pushDeliveryStatus = createServerFn({ method: "GET" }).handler(async () => {
  const projectId = process.env["FCM_PROJECT_ID"];
  const saRaw = process.env["FCM_SERVICE_ACCOUNT_JSON"];
  const dispatchSecret = process.env["PUSH_DISPATCH_SECRET"];

  let serviceAccountValid = false;
  if (saRaw) {
    try {
      const sa = JSON.parse(saRaw) as { client_email?: string; private_key?: string };
      serviceAccountValid = Boolean(sa.client_email && sa.private_key);
    } catch {
      serviceAccountValid = false;
    }
  }

  const missing = [
    ...(projectId ? [] : ["FCM_PROJECT_ID"]),
    ...(saRaw ? [] : ["FCM_SERVICE_ACCOUNT_JSON"]),
    ...(dispatchSecret ? [] : ["PUSH_DISPATCH_SECRET"]),
  ];

  return {
    configured: Boolean(projectId && serviceAccountValid),
    hasProjectId: Boolean(projectId),
    hasServiceAccount: Boolean(saRaw),
    serviceAccountValid,
    hasDispatchSecret: Boolean(dispatchSecret),
    missing,
  };
});
