import { createFileRoute } from "@tanstack/react-router";

/**
 * إرسال إشعارات الهاتف للإشعارات الجديدة غير المُرسلة.
 * يُستدعى من جدولة (pg_cron / مجدول خارجي) مع ترويسة:
 *   Authorization: Bearer <PUSH_DISPATCH_SECRET>
 * بدون أسرار FCM لا يُرسل شيء ويُرجع سبباً واضحاً.
 */
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
          .select("id, user_id, title, body, kind, order_id")
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
        let reason: string | undefined;
        const invalidTokens: string[] = [];
        const doneIds: string[] = [];

        for (const n of pending) {
          const tokens = byUser.get(n.user_id) ?? [];
          if (tokens.length === 0) {
            doneIds.push(n.id); // لا أجهزة مسجلة: نعتبرها منتهية حتى لا تتراكم
            continue;
          }
          const res = await sendFcm(tokens, {
            title: n.title,
            body: n.body ?? n.title,
            orderId: n.order_id,
            kind: n.order_id ? "order" : n.kind,
          });
          if (res.reason) {
            reason = res.reason;
            break; // إعدادات ناقصة: نتوقف ونترك الإشعارات لإرسال لاحق
          }
          sent += res.sent;
          invalidTokens.push(...res.invalid);
          doneIds.push(n.id);
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

        return Response.json({ ok: !reason, sent, ...(reason ? { reason } : {}) });
      },
    },
  },
});
