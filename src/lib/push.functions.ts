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
    // عبر RPC آمنة: نفس الهاتف قد يكون مسجّلاً سابقاً بحساب آخر (دراجة/تكسي/زبون)،
    // وسياسة الصفوف تمنع تحديث صف يملكه مستخدم آخر، فتفشل إعادة التسجيل بصمت.
    // الدالة تنقل ملكية الرمز للحساب الحالي ذرياً.
    const rpc = context.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc("register_push_device", {
      _token: data.token,
      _platform: data.platform,
    });
    if (error) {
      console.error("[push] device register failed", error.message);
      return { ok: false as const, reason: error.message };
    }
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
