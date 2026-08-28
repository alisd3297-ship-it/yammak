import { createFileRoute } from "@tanstack/react-router";

/**
 * إرسال إشعارات الهاتف للإشعارات الجديدة غير المُرسلة.
 * المنطق نفسه يعمل تلقائياً كل دقيقة داخل الصيانة الدورية (dispatch.server → runMaintenance)،
 * وهذه النقطة تبقى متاحة لمجدول خارجي أو لإطلاق يدوي مع ترويسة:
 *   Authorization: Bearer <PUSH_DISPATCH_SECRET>
 * بدون أسرار FCM لا يُرسل شيء ويُرجع سبباً واضحاً.
 */
export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      // فحص جاهزية FCM (محمي بنفس السر، ولا يعيد أي قيمة سرية)
      GET: async ({ request }) => {
        const secret = process.env["PUSH_DISPATCH_SECRET"];
        if (!secret) {
          return Response.json({ ok: false, reason: "dispatch_secret_missing" }, { status: 503 });
        }
        if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
          return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
        }
        const { fcmSelfCheck } = await import("@/lib/push.server");
        return Response.json(await fcmSelfCheck(), {
          headers: { "cache-control": "no-store" },
        });
      },

      POST: async ({ request }) => {
        const secret = process.env["PUSH_DISPATCH_SECRET"];
        if (!secret) {
          return Response.json({ ok: false, reason: "dispatch_secret_missing" }, { status: 503 });
        }
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${secret}`) {
          return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
        }

        const { dispatchPendingPush } = await import("@/lib/push.server");
        const result = await dispatchPendingPush(100);
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
