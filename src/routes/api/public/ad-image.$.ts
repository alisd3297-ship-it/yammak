import { createFileRoute } from "@tanstack/react-router";

/**
 * تقديم صور الإعلانات من مخزن خاص.
 * لا يُقدَّم أي ملف إلا إذا كان مسجلاً فعلاً ضمن صور إعلان قائم،
 * وبذلك لا يمكن استخدام المسار للوصول لأي ملف آخر في المخزن.
 */
export const Route = createFileRoute("/api/public/ad-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = decodeURIComponent(params._splat ?? "");
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: owner } = await supabaseAdmin
          .from("ads")
          .select("id")
          .contains("images", [path])
          .limit(1)
          .maybeSingle();
        if (!owner) return new Response("Not found", { status: 404 });

        const { data: file, error } = await supabaseAdmin.storage.from("ad-images").download(path);
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
