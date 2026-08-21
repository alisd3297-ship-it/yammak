import { createFileRoute } from "@tanstack/react-router";

/**
 * تقديم صور الإعلانات من مخزن خاص.
 * - صور الإعلانات المنشورة: متاحة للعامة.
 * - صور الإعلانات قيد المراجعة/المرفوضة/الموقوفة: تتطلب توكن صاحب الإعلان أو فريق الإدارة.
 * لا يُقدَّم أي ملف غير مسجّل ضمن صور إعلان قائم، فلا يمكن استخدام المسار للوصول لملفات أخرى.
 */
/** حد بسيط للطلبات لكل عنوان IP لمنع الاستنزاف أو التخمين الآلي. */
const HITS = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX_HITS = 120;

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

export const Route = createFileRoute("/api/public/ad-image/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (rateLimited(request))
          return new Response("Too many requests", { status: 429, headers: { "retry-after": "60" } });

        const path = decodeURIComponent(params._splat ?? "");
        // مسار داخل مجلد المالك فقط: uuid/filename بدون أي تنقل بين المجلدات
        if (!path || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/i.test(path))
          return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: ad } = await supabaseAdmin
          .from("ads")
          .select("id, owner_id, status")
          .contains("images", [path])
          .limit(1)
          .maybeSingle();
        if (!ad) return new Response("Not found", { status: 404 });

        const isPublic = ad.status === "published";
        if (!isPublic) {
          const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
          if (!token) return new Response("Not found", { status: 404 });
          const { data: userData } = await supabaseAdmin.auth.getUser(token);
          const uid = userData?.user?.id;
          if (!uid) return new Response("Not found", { status: 404 });
          if (uid !== ad.owner_id) {
            const { data: staff } = await supabaseAdmin.rpc("is_staff", { _user_id: uid });
            if (!staff) return new Response("Not found", { status: 404 });
          }
        }

        const { data: file, error } = await supabaseAdmin.storage.from("ad-images").download(path);
        if (error || !file) return new Response("Not found", { status: 404 });

        return new Response(await file.arrayBuffer(), {
          headers: {
            "content-type": file.type || "image/jpeg",
            "cache-control": isPublic ? "public, max-age=3600" : "private, no-store",
          },
        });
      },
    },
  },
});
