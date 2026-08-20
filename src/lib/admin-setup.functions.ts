import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * إعداد أول مدير عام (super_admin).
 * لا يعمل إلا إذا: (1) المستخدم مسجل دخول، (2) رمز الإعداد السري صحيح،
 * (3) لا يوجد أي super_admin في النظام بعد.
 */
export const claimSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data, context }) => {
    const { createHash, timingSafeEqual } = await import("node:crypto");
    const expected = process.env["ADMIN_SETUP_TOKEN"];
    if (!expected) throw new Error("لم يتم ضبط رمز الإعداد على الخادم");

    const a = createHash("sha256").update(data.token, "utf8").digest();
    const b = createHash("sha256").update(expected, "utf8").digest();
    if (!timingSafeEqual(a, b)) return { ok: false as const, reason: "invalid_token" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if (countError) throw countError;
    if ((count ?? 0) > 0) return { ok: false as const, reason: "already_configured" };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "super_admin" });
    if (error) throw error;

    return { ok: true as const };
  });

export const superAdminExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "super_admin");
  return { exists: (count ?? 0) > 0 };
});
