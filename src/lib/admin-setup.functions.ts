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

/**
 * تجهيز حساب مدير تجريبي (اختبار بين عدة أجهزة).
 * محمي برمز الإعداد السري ADMIN_SETUP_TOKEN، ومحصور على نطاق البريد @yammak.test،
 * ولا يخزّن أي بيانات اعتماد داخل الكود: كلمة المرور تُدخل من المستخدم وقت التنفيذ.
 */
export const provisionTestAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; email: string; password: string }) => ({
    token: String(data?.token ?? ""),
    email: String(data?.email ?? "").trim().toLowerCase(),
    password: String(data?.password ?? ""),
  }))
  .handler(async ({ data }) => {
    const { createHash, timingSafeEqual } = await import("node:crypto");
    const expected = process.env["ADMIN_SETUP_TOKEN"];
    if (!expected) throw new Error("لم يتم ضبط رمز الإعداد على الخادم");

    const a = createHash("sha256").update(data.token, "utf8").digest();
    const b = createHash("sha256").update(expected, "utf8").digest();
    if (!timingSafeEqual(a, b)) return { ok: false as const, reason: "invalid_token" };

    if (!/^[a-z0-9._-]+@yammak\.test$/.test(data.email))
      return { ok: false as const, reason: "invalid_email" };
    if (data.password.length < 10) return { ok: false as const, reason: "weak_password" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // البحث عن الحساب إن وُجد سابقاً
    let userId: string | null = null;
    for (let page = 1; page <= 10 && !userId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      userId = list.users.find((u) => u.email?.toLowerCase() === data.email)?.id ?? null;
      if (list.users.length < 200) break;
    }

    let created = false;
    if (userId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        email_confirm: true,
      });
      if (error) throw error;
    } else {
      const { data: createdUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: "مدير اختبار", is_test_account: true },
      });
      if (error) throw error;
      userId = createdUser.user?.id ?? null;
      created = true;
    }
    if (!userId) throw new Error("تعذر تجهيز الحساب");

    for (const role of ["customer", "admin"] as const) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
      if (error) throw error;
    }

    return { ok: true as const, created, email: data.email };
  });
