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

/**
 * تشخيص فعلي لجاهزية إشعارات الهاتف (لموظفي الإدارة):
 * عدد الأجهزة المسجّلة، الأجهزة حسب دور العامل، والإشعارات المعلّقة.
 * لا يكشف أي رمز جهاز ولا أي سرّ.
 */
export const pushReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff");
    if (!isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: devices }, { data: workers }, { count: pendingPush }] = await Promise.all([
      supabaseAdmin.from("push_devices").select("user_id, platform, is_active"),
      supabaseAdmin
        .from("worker_profiles")
        .select("user_id, worker_kind, vehicle_type, is_approved, is_available"),
      supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("pushed_at", null),
    ]);

    const activeUsers = new Set(
      (devices ?? []).filter((d) => d.is_active).map((d) => d.user_id as string),
    );
    const workerRows = workers ?? [];
    const summarize = (rows: typeof workerRows) => ({
      total: rows.length,
      withDevice: rows.filter((w) => activeUsers.has(w.user_id as string)).length,
    });

    return {
      devices: {
        total: (devices ?? []).length,
        active: (devices ?? []).filter((d) => d.is_active).length,
        android: (devices ?? []).filter((d) => d.is_active && d.platform === "android").length,
        ios: (devices ?? []).filter((d) => d.is_active && d.platform === "ios").length,
      },
      workers: {
        delivery: summarize(workerRows.filter((w) => w.worker_kind === "delivery")),
        taxi: summarize(workerRows.filter((w) => w.worker_kind === "taxi")),
        bike: summarize(workerRows.filter((w) => w.vehicle_type === "bike")),
      },
      pendingPush: pendingPush ?? 0,
      // فحص فعلي لمصادقة FCM من الخادم (لا يُظهر أي سر)
      fcm: await (await import("@/lib/push.server")).fcmSelfCheck(),
    };
  });


/** هل لحساب المستخدم الحالي جهاز إشعارات نشط؟ (تشخيص ذاتي للمندوب). */
export const myPushDevice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("push_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("is_active", true);
    return { active: (count ?? 0) > 0 };
  });
