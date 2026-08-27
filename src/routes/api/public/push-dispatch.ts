import { createFileRoute } from "@tanstack/react-router";

/**
 * إرسال إشعارات الهاتف للإشعارات الجديدة غير المُرسلة.
 * يُستدعى من جدولة (pg_cron / مجدول خارجي) مع ترويسة:
 *   Authorization: Bearer <PUSH_DISPATCH_SECRET>
 * بدون أسرار FCM لا يُرسل شيء ويُرجع سبباً واضحاً.
 */
/** مهلة انتظار تسجيل جهاز قبل اعتبار الإشعار منتهياً (لا يصل push بدون جهاز). */
const NO_DEVICE_GRACE_MS = 30 * 60 * 1000;

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PUSH_DISPATCH_SECRET"];
        if (!secret) {
          return Response.json({ ok: false, reason: "dispatch_secret_missing" }, { status: 503 });
        }
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${secret}`) {
          return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendFcm } = await import("@/lib/push.server");

        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: pending, error } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id, title, body, kind, order_id, created_at")
          .is("pushed_at", null)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(100);
        if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
        if (!pending || pending.length === 0) return Response.json({ ok: true, sent: 0 });

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
            // قد يسجّل المستخدم جهازه بعد قليل: نترك الإشعار معلّقاً ضمن نافذة الانتظار،
            // ولا نغلقه إلا بعد تجاوز المهلة حتى لا تتراكم الصفوف للأبد.
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
            // فشل شبكي/مصادقة: لا نعلّم الإشعار كمُرسل، ونتوقف لإعادة المحاولة لاحقاً
            reason = err instanceof Error ? err.message : "fcm_send_failed";
            failed += 1;
            break;
          }
          if (res.reason) {
            reason = res.reason;
            break; // إعدادات ناقصة: نتوقف ونترك الإشعارات لإرسال لاحق
          }
          invalidTokens.push(...res.invalid);
          if (res.sent > 0) {
            sent += res.sent;
            doneIds.push(n.id);
          } else {
            // كل الرموز فشلت: نترك الإشعار معلّقاً لمحاولة لاحقة
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

        return Response.json({
          ok: !reason,
          sent,
          failed,
          waitingNoDevice,
          skippedNoDevice,
          invalidated: invalidTokens.length,
          ...(reason ? { reason } : {}),
        });
      },
    },
  },
});
