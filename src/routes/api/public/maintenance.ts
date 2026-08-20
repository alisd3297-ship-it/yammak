import { createFileRoute } from "@tanstack/react-router";

/**
 * نقطة صيانة دورية يستدعيها المجدول الداخلي (pg_cron + pg_net) كل دقيقة.
 * القبول: ترويسة apikey مطابقة للمفتاح العام، أو x-cron-secret مطابقة لسر LOVABLE_CRON_SECRET.
 * المهام: إنهاء العروض المنتهية، إعادة توزيع الطلبات العالقة، إكمال الطلبات المسلَّمة.
 * الحماية من التكرار/التزامن تتم عبر claim_maintenance_slot في قاعدة البيانات.
 */
function authorize(request: Request): boolean {
  const apiKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const providedKey = request.headers.get("apikey");
  if (apiKey && providedKey && providedKey === apiKey) return true;

  const secret = process.env["LOVABLE_CRON_SECRET"];
  const provided = request.headers.get("x-cron-secret");
  return Boolean(secret && provided && provided === secret);
}

export const Route = createFileRoute("/api/public/maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorize(request)) return new Response("Unauthorized", { status: 401 });
        const { runMaintenance } = await import("@/lib/dispatch.server");
        const result = await runMaintenance("pg_cron_http", 30);
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
