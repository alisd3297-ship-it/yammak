import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** إخفاء رمز الجهاز: لا نعرض إلا بداية ونهاية الرمز. */
function maskToken(token: string): string {
  if (token.length <= 12) return "••••";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

async function assertStaff(context: { supabase: { rpc: (fn: string) => Promise<{ data: unknown }> } }) {
  const { data } = await context.supabase.rpc("is_staff");
  if (!data) throw new Error("غير مصرح بهذا الإجراء");
}

/**
 * تشخيص شامل لإشعارات FCM (لموظفي الإدارة فقط):
 * حالة الإعداد، الفحص الذاتي للمصادقة، عدد الأجهزة، آخر عمليات الإرسال، والأخطاء.
 * لا يُرجع أي سرّ ولا مفتاح خاص ولا رمز جهاز كاملاً.
 */
export const fcmDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);

    const projectId = process.env["FCM_PROJECT_ID"];
    const saRaw = process.env["FCM_SERVICE_ACCOUNT_JSON"];
    const dispatchSecret = process.env["PUSH_DISPATCH_SECRET"];

    let serviceAccountValid = false;
    let serviceAccountEmail: string | null = null;
    if (saRaw) {
      try {
        const sa = JSON.parse(saRaw) as { client_email?: string; private_key?: string };
        serviceAccountValid = Boolean(sa.client_email && sa.private_key);
        // البريد الخدمي ليس سراً (يظهر في Firebase Console) — لا نعرض أي جزء من المفتاح.
        serviceAccountEmail = sa.client_email ?? null;
      } catch {
        serviceAccountValid = false;
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fcmSelfCheck } = await import("@/lib/push.server");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [selfCheck, devicesRes, recentRes, pendingRes, errorsRes] = await Promise.all([
      fcmSelfCheck(),
      supabaseAdmin
        .from("push_devices")
        .select("id, user_id, platform, is_active, last_seen_at, token")
        .order("last_seen_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("notifications")
        .select("id, user_id, title, kind, order_id, created_at, pushed_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("pushed_at", null)
        .gte("created_at", since),
      supabaseAdmin
        .from("app_error_logs")
        .select("id, created_at, kind, message, source")
        .or("message.ilike.%fcm%,message.ilike.%push%,kind.eq.push")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const devices = devicesRes.data ?? [];
    const activeDevices = devices.filter((d) => d.is_active);

    return {
      config: {
        hasProjectId: Boolean(projectId),
        projectId: projectId ?? null,
        hasServiceAccount: Boolean(saRaw),
        serviceAccountValid,
        serviceAccountEmail,
        hasDispatchSecret: Boolean(dispatchSecret),
        configured: Boolean(projectId && serviceAccountValid),
        missing: [
          ...(projectId ? [] : ["FCM_PROJECT_ID"]),
          ...(saRaw ? [] : ["FCM_SERVICE_ACCOUNT_JSON"]),
          ...(dispatchSecret ? [] : ["PUSH_DISPATCH_SECRET"]),
        ],
      },
      selfCheck,
      devices: {
        total: devices.length,
        active: activeDevices.length,
        android: activeDevices.filter((d) => d.platform === "android").length,
        ios: activeDevices.filter((d) => d.platform === "ios").length,
        web: activeDevices.filter((d) => d.platform === "web").length,
      },
      recent: (recentRes.data ?? []).map((n) => ({
        id: n.id,
        title: n.title,
        kind: n.kind,
        orderId: n.order_id,
        createdAt: n.created_at,
        pushedAt: n.pushed_at,
        status: n.pushed_at ? ("sent" as const) : ("pending" as const),
      })),
      pending24h: pendingRes.count ?? 0,
      errors: (errorsRes.data ?? []).map((e) => ({
        id: e.id,
        createdAt: e.created_at,
        kind: e.kind,
        source: e.source,
        // قصّ الرسالة: لا تُعرض أي حمولة طويلة قد تحتوي بيانات حساسة
        message: String(e.message ?? "").slice(0, 300),
      })),
    };
  });

/** قائمة السائقين الذين لديهم جهاز إشعارات نشط (لاختيار هدف الاختبار). */
export const fcmTestTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: workers } = await supabaseAdmin
      .from("worker_profiles")
      .select("user_id, worker_kind, vehicle_type")
      .limit(2000);
    const workerIds = (workers ?? []).map((w) => w.user_id as string);
    if (workerIds.length === 0) return { drivers: [] };

    const [{ data: devices }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("push_devices")
        .select("user_id, platform, last_seen_at, token")
        .eq("is_active", true)
        .in("user_id", workerIds),
      supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", workerIds),
    ]);

    const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    const byUser = new Map<string, { platforms: string[]; lastSeen: string; tokens: string[] }>();
    (devices ?? []).forEach((d) => {
      const cur = byUser.get(d.user_id as string) ?? { platforms: [], lastSeen: "", tokens: [] };
      cur.platforms.push(d.platform);
      cur.tokens.push(maskToken(d.token as string));
      if (!cur.lastSeen || d.last_seen_at > cur.lastSeen) cur.lastSeen = d.last_seen_at;
      byUser.set(d.user_id as string, cur);
    });

    return {
      drivers: [...byUser.entries()].map(([userId, info]) => {
        const p = nameById.get(userId);
        const w = (workers ?? []).find((x) => x.user_id === userId);
        return {
          userId,
          name: (p?.full_name as string) || (p?.phone as string) || "سائق",
          kind: (w?.worker_kind as string) ?? "delivery",
          platforms: [...new Set(info.platforms)],
          devices: info.tokens.length,
          maskedTokens: info.tokens,
          lastSeen: info.lastSeen,
        };
      }),
    };
  });

/** إرسال إشعار تجريبي إلى أجهزة سائق مسجّل واحد فقط (لا يمس دورة الطلبات). */
export const sendFcmTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => ({ userId: String(data?.userId ?? "").trim() }))
  .handler(async ({ data, context }) => {
    await assertStaff(context as never);
    if (!data.userId) return { ok: false as const, sent: 0, reason: "no_target" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // الهدف يجب أن يكون سائقاً/عاملاً مسجّلاً
    const { data: worker } = await supabaseAdmin
      .from("worker_profiles")
      .select("user_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!worker) return { ok: false as const, sent: 0, reason: "not_a_driver" };

    const { data: devices } = await supabaseAdmin
      .from("push_devices")
      .select("token")
      .eq("is_active", true)
      .eq("user_id", data.userId);
    const tokens = (devices ?? []).map((d) => d.token as string);
    if (tokens.length === 0) return { ok: false as const, sent: 0, reason: "no_device" };

    const { sendFcm } = await import("@/lib/push.server");
    const res = await sendFcm(tokens, {
      title: "اختبار إشعارات لبابك",
      body: "هذا إشعار تجريبي من لوحة الإدارة للتأكد من الصوت والاهتزاز.",
      kind: "order",
    });

    if (res.invalid.length > 0) {
      await supabaseAdmin.from("push_devices").update({ is_active: false }).in("token", res.invalid);
    }

    return {
      ok: res.sent > 0,
      sent: res.sent,
      invalidated: res.invalid.length,
      ...(res.reason ? { reason: res.reason } : {}),
    };
  });
