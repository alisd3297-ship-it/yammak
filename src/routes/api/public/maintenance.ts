import { createFileRoute } from "@tanstack/react-router";

/**
 * نقطة صيانة دورية يستدعيها المجدول الداخلي (pg_cron + pg_net) كل دقيقة.
 * التفويض: ترويسة x-cron-secret فقط، تُطابَق مع سر الخادم LOVABLE_CRON_SECRET
 * أو السر الداخلي المخزّن في قاعدة البيانات (internal_secrets) بمقارنة ثابتة الزمن.
 * لم يعد المفتاح العام (publishable key) مقبولاً للتفويض إطلاقاً.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-cron-secret");
  if (!provided) return false;

  const envSecret = process.env["LOVABLE_CRON_SECRET"];
  if (envSecret && timingSafeEqual(provided, envSecret)) return true;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("internal_secrets")
      .select("value")
      .eq("name", "maintenance_cron_secret")
      .maybeSingle();
    const dbSecret = data?.value;
    return Boolean(dbSecret && timingSafeEqual(provided, dbSecret));
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/maintenance")({
  server: {
    handlers: {
      // فحص صحة بسيط لا يكشف أي بيانات
      GET: async () =>
        Response.json({ ok: true, service: "maintenance" }, { headers: { "cache-control": "no-store" } }),
      POST: async ({ request }) => {
        if (!(await authorize(request)))
          return new Response("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
        try {
          const { runMaintenance } = await import("@/lib/dispatch.server");
          const result = await runMaintenance("pg_cron_http", 30);
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch {
          return new Response("maintenance_failed", { status: 500 });
        }
      },
    },
  },
});
