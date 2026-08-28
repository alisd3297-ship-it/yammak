import { createFileRoute } from "@tanstack/react-router";

/**
 * تقديم شعارات وصور مقدمي الخدمة من مخزن خاص.
 * لا يُقدَّم أي ملف غير مسجّل فعلياً كشعار/غلاف لمزوّد قائم،
 * فلا يمكن استخدام المسار للوصول إلى ملفات أخرى داخل المخزن.
 */

const HITS = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX_HITS = 240;

function rateLimited(request: Request): boolean {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const now = Date.now();
  const entry = HITS.get(ip);
  if (!entry || entry.reset < now) {
    HITS.set(ip, { count: 1, reset: now + WINDOW_MS });
    if (HITS.size > 5000) HITS.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_HITS;
}

export const Route = createFileRoute("/api/public/provider-image/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (rateLimited(request))
          return new Response("Too many requests", {
            status: 429,
            headers: { "retry-after": "60" },
          });

        const path = decodeURIComponent(params._splat ?? "");
        // providers/<uuid>/<filename> فقط — بلا أي تنقل بين المجلدات
        if (!path || !/^providers\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/i.test(path))
          return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const publicPath = `/api/public/provider-image/${path}`;
        const { data: provider } = await supabaseAdmin
          .from("providers")
          .select("id")
          .or(`logo_url.eq.${publicPath},cover_url.eq.${publicPath}`)
          .limit(1)
          .maybeSingle();
        if (!provider) {
          // صور المنتجات مخزّنة بنفس المجلد وتُقدَّم فقط إذا كانت مسجّلة على منتج قائم
          const { data: product } = await supabaseAdmin
            .from("products")
            .select("id")
            .eq("image_url", publicPath)
            .limit(1)
            .maybeSingle();
          if (!product) return new Response("Not found", { status: 404 });
        }

        const { data: file, error } = await supabaseAdmin.storage
          .from("provider-images")
          .download(path);
        if (error || !file) return new Response("Not found", { status: 404 });

        return new Response(await file.arrayBuffer(), {
          headers: {
            "content-type": file.type || "image/jpeg",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
