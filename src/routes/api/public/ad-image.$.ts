import { createFileRoute } from "@tanstack/react-router";

/**
 * تقديم صور الإعلانات من مخزن خاص.
 * - صور الإعلانات المنشورة: متاحة للعامة.
 * - صور الإعلانات قيد المراجعة/المرفوضة/الموقوفة: تتطلب توكن صاحب الإعلان أو فريق الإدارة.
 * لا يُقدَّم أي ملف غير مسجّل ضمن صور إعلان قائم، فلا يمكن استخدام المسار للوصول لملفات أخرى.
 */
export const Route = createFileRoute("/api/public/ad-image/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = decodeURIComponent(params._splat ?? "");
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

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
