/**
 * إرسال إشعارات الهاتف عبر FCM HTTP v1.
 * يتطلب سرّين خارجيين: FCM_PROJECT_ID و FCM_SERVICE_ACCOUNT_JSON.
 * بدونهما لا يُرسل شيء ويُرجع سبباً واضحاً (لا ادعاء بالعمل).
 */

type ServiceAccount = { client_email: string; private_key: string };

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const assertion = `${header}.${claim}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`fcm_token_failed_${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("fcm_token_missing");
  return json.access_token;
}

/**
 * معرّفات القنوات (نسخة v2): أندرويد يحتفظ بإعدادات القناة القديمة حتى لو كانت صامتة،
 * فأي تصحيح للصوت يحتاج معرّف قناة جديد. يجب أن تطابق src/lib/native-push.ts.
 */
const CHANNEL_ORDERS = "lubabak_orders_v2";
const CHANNEL_TAXI = "lubabak_taxi_v2";
const CHANNEL_DEFAULT = "lubabak_default_v2";

/**
 * الإشعارات العاجلة (طلب جديد، عرض للمندوب، تحديث حالة طلب، طلب خدمة، عرض سعر)
 * تذهب لقناة عالية الأهمية بصوت واهتزاز حتى والتطبيق مغلق.
 */
const URGENT_KIND = /^(order|offer|delivery|dispatch|service|request|quote|tab|payment)/i;

function isUrgent(msg: { kind?: string | null; orderId?: string | null }): boolean {
  return Boolean(msg.orderId) || URGENT_KIND.test(msg.kind ?? "") || isTaxi(msg);
}

function isTaxi(msg: { kind?: string | null }): boolean {
  return (msg.kind ?? "").startsWith("trip") || (msg.kind ?? "").startsWith("taxi");
}

function androidChannelId(msg: { kind?: string | null; orderId?: string | null }): string {
  if (isTaxi(msg)) return CHANNEL_TAXI;
  if (isUrgent(msg)) return CHANNEL_ORDERS;
  return CHANNEL_DEFAULT;
}

export type PushMessage = {
  title: string;
  body: string;
  orderId?: string | null;
  kind?: string | null;
};

/** إرسال رسالة لعدة رموز أجهزة. يُرجع الرموز غير الصالحة لتعطيلها. */
export async function sendFcm(
  tokens: readonly string[],
  msg: PushMessage,
): Promise<{ sent: number; invalid: string[]; reason?: string }> {
  const projectId = process.env["FCM_PROJECT_ID"];
  const saRaw = process.env["FCM_SERVICE_ACCOUNT_JSON"];
  if (!projectId || !saRaw) return { sent: 0, invalid: [], reason: "fcm_not_configured" };
  if (tokens.length === 0) return { sent: 0, invalid: [] };

  let sa: ServiceAccount & { project_id?: string };
  try {
    sa = JSON.parse(saRaw) as ServiceAccount & { project_id?: string };
  } catch {
    // القيمة المحفوظة ليست JSON (مثلاً نص ملصوق ناقص) — لا نرمي استثناءً حتى لا تتعطل دورة الطلب.
    return { sent: 0, invalid: [], reason: "fcm_service_account_invalid" };
  }
  if (!sa?.client_email || !sa?.private_key) {
    return { sent: 0, invalid: [], reason: "fcm_service_account_incomplete" };
  }
  if (sa.project_id && sa.project_id !== projectId) {
    return { sent: 0, invalid: [], reason: "fcm_project_mismatch" };
  }

  let token: string;
  try {
    token = await accessToken(sa);
  } catch (err) {
    // فشل مصادقة Google (مفتاح خاطئ/منتهٍ) — لا يُسقط إنشاء الطلب أو العرض.
    console.error("[push] google auth failed", err instanceof Error ? err.message : "unknown");
    return { sent: 0, invalid: [], reason: "fcm_auth_failed" };
  }
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const invalid: string[] = [];
  let sent = 0;


  const urgent = isUrgent(msg);
  const channelId = androidChannelId(msg);

  for (const deviceToken of tokens) {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          // notification + data معاً: النظام يعرض الإشعار بصوت القناة والتطبيق مغلق،
          // وفي المقدمة يستلمه التطبيق ويشغّل نغمته الداخلية.
          notification: { title: msg.title, body: msg.body },
          data: {
            orderId: msg.orderId ?? "",
            kind: msg.kind ?? "",
            urgent: urgent ? "1" : "0",
          },
          android: {
            priority: "HIGH",
            ...(urgent ? { ttl: "180s" } : {}),
            notification: {
              channel_id: channelId,
              sound: "default",
              default_sound: true,
              default_vibrate_timings: !urgent,
              ...(urgent
                ? { vibrate_timings: ["0s", "0.2s", "0.1s", "0.2s", "0.1s", "0.4s"] }
                : {}),
              default_light_settings: true,
              notification_priority: urgent ? "PRIORITY_MAX" : "PRIORITY_HIGH",
              visibility: "PUBLIC",
              // تجميع إشعارات نفس الطلب بدل تكديسها
              ...(msg.orderId ? { tag: msg.orderId } : {}),
            },
          },
          apns: {
            headers: {
              // alert دائماً: يضمن عرض الإشعار وتشغيل الصوت والتطبيق مغلق
              "apns-push-type": "alert",
              "apns-priority": "10",
              ...(msg.orderId ? { "apns-collapse-id": msg.orderId.slice(0, 63) } : {}),
            },
            payload: {
              aps: {
                // كائن الصوت يضمن أعلى مستوى للنغمة على iOS
                sound: { name: "default", volume: 1.0, critical: 0 },
                badge: 1,
                ...(urgent ? { "interruption-level": "time-sensitive" } : {}),
                ...(msg.orderId ? { "thread-id": msg.orderId } : {}),
              },
            },
          },
        },
      }),
    });
    if (res.ok) sent += 1;
    else if (res.status === 404 || res.status === 400) invalid.push(deviceToken);
  }

  return { sent, invalid };
}

/** مهلة انتظار تسجيل جهاز قبل اعتبار الإشعار منتهياً (لا يصل push بدون جهاز). */
const NO_DEVICE_GRACE_MS = 30 * 60 * 1000;

export type PushDispatchResult = {
  ok: boolean;
  sent: number;
  failed: number;
  waitingNoDevice: number;
  skippedNoDevice: number;
  invalidated: number;
  reason?: string;
};

/**
 * إرسال الإشعارات المعلّقة (pushed_at = null) إلى أجهزة أصحابها.
 * تُستدعى من الصيانة الدورية (كل دقيقة) ومن نقطة /api/public/push-dispatch معاً،
 * حتى لا يعتمد التسليم على مجدول خارجي وحده.
 */
export async function dispatchPendingPush(limit = 100): Promise<PushDispatchResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await supabaseAdmin
    .from("notifications")
    .select("id, user_id, title, body, kind, order_id, created_at")
    .is("pushed_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error)
    return {
      ok: false,
      sent: 0,
      failed: 0,
      waitingNoDevice: 0,
      skippedNoDevice: 0,
      invalidated: 0,
      reason: error.message,
    };
  if (!pending || pending.length === 0)
    return { ok: true, sent: 0, failed: 0, waitingNoDevice: 0, skippedNoDevice: 0, invalidated: 0 };

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const { data: devices } = await supabaseAdmin
    .from("push_devices")
    .select("user_id, token")
    .eq("is_active", true)
    .in("user_id", userIds);

  const byUser = new Map<string, string[]>();
  (devices ?? []).forEach((d) => {
    byUser.set(d.user_id, [...(byUser.get(d.user_id) ?? []), d.token]);
  });

  let sent = 0;
  let failed = 0;
  let skippedNoDevice = 0;
  let waitingNoDevice = 0;
  let reason: string | undefined;
  const invalidTokens: string[] = [];
  const doneIds: string[] = [];

  for (const n of pending) {
    const tokens = byUser.get(n.user_id) ?? [];
    if (tokens.length === 0) {
      const age = Date.now() - new Date(n.created_at).getTime();
      if (age > NO_DEVICE_GRACE_MS) {
        doneIds.push(n.id);
        skippedNoDevice += 1;
      } else {
        waitingNoDevice += 1;
      }
      continue;
    }
    let res: Awaited<ReturnType<typeof sendFcm>>;
    try {
      res = await sendFcm(tokens, {
        title: n.title,
        body: n.body ?? n.title,
        orderId: n.order_id,
        kind: n.order_id ? "order" : n.kind,
      });
    } catch (err) {
      reason = err instanceof Error ? err.message : "fcm_send_failed";
      failed += 1;
      break;
    }
    if (res.reason) {
      reason = res.reason;
      break;
    }
    invalidTokens.push(...res.invalid);
    if (res.sent > 0) {
      sent += res.sent;
      doneIds.push(n.id);
    } else {
      failed += 1;
    }
  }

  if (doneIds.length > 0) {
    await supabaseAdmin
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .in("id", doneIds);
  }
  if (invalidTokens.length > 0) {
    await supabaseAdmin
      .from("push_devices")
      .update({ is_active: false })
      .in("token", invalidTokens);
  }

  return {
    ok: !reason,
    sent,
    failed,
    waitingNoDevice,
    skippedNoDevice,
    invalidated: invalidTokens.length,
    ...(reason ? { reason } : {}),
  };
}

/**
 * إرسال فوري لإشعار واحد لمستخدم واحد (أقل زمن وصول لعروض المندوب).
 * أي فشل يترك pushed_at فارغاً فتلتقطه الصيانة الدورية لاحقاً.
 */
export async function pushNotificationNow(notificationId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: n } = await supabaseAdmin
    .from("notifications")
    .select("id, user_id, title, body, kind, order_id, pushed_at")
    .eq("id", notificationId)
    .maybeSingle();
  if (!n || n.pushed_at) return false;

  const { data: devices } = await supabaseAdmin
    .from("push_devices")
    .select("token")
    .eq("is_active", true)
    .eq("user_id", n.user_id);
  const tokens = (devices ?? []).map((d) => d.token);
  if (tokens.length === 0) return false;

  const res = await sendFcm(tokens, {
    title: n.title,
    body: n.body ?? n.title,
    orderId: n.order_id,
    kind: n.order_id ? "order" : n.kind,
  });
  if (res.invalid.length > 0) {
    await supabaseAdmin.from("push_devices").update({ is_active: false }).in("token", res.invalid);
  }
  if (res.sent > 0) {
    await supabaseAdmin
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", n.id);
    return true;
  }
  return false;
}
