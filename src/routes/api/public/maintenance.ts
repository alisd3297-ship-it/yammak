import { createFileRoute } from "@tanstack/react-router";

/**
 * نقطة صيانة دورية (تستدعى من مجدول خارجي / cron).
 * تحتاج ترويسة x-cron-secret مطابقة لسر LOVABLE_CRON_SECRET.
 * المهام: إنهاء العروض المنتهية، إعادة توزيع الطلبات العالقة، إكمال الطلبات المسلَّمة.
 */
export const Route = createFileRoute("/api/public/maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const provided = request.headers.get("x-cron-secret");
        if (!secret || !provided || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runMaintenance } = await import("@/lib/dispatch.server");
        const result = await runMaintenance();
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
