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

/** هل أدوات الإعداد/حسابات الاختبار مفعّلة على هذا الخادم؟ (مغلقة على الإنتاج) */
export const setupToolsStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { setupToolsEnabled } = await import("@/lib/admin-setup.server");
  return { enabled: setupToolsEnabled() };
});


/**
 * تجهيز حساب مدير تجريبي (اختبار بين عدة أجهزة).
 * محمي برمز الإعداد السري ADMIN_SETUP_TOKEN، ومحصور على نطاق البريد @yammak.test،
 * ولا يخزّن أي بيانات اعتماد داخل الكود: كلمة المرور تُدخل من المستخدم وقت التنفيذ.
 */
export const provisionTestAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; email: string; password: string }) => ({
    token: String(data?.token ?? "").trim(),
    email: String(data?.email ?? "").trim().toLowerCase(),
    password: String(data?.password ?? ""),
  }))
  .handler(async ({ data }) => {
    const { createHash, timingSafeEqual } = await import("node:crypto");
    const expected = process.env["ADMIN_SETUP_TOKEN"];
    // لا نرمي استثناءً حتى لا يُبتلع السبب ويظهر كرسالة «تعذر» عامة
    if (!expected) return { ok: false as const, reason: "server_token_missing" };

    const a = createHash("sha256").update(data.token, "utf8").digest();
    const b = createHash("sha256").update(expected.trim(), "utf8").digest();
    if (!timingSafeEqual(a, b)) return { ok: false as const, reason: "invalid_token" };

    if (!/^[a-z0-9._-]+@yammak\.test$/.test(data.email))
      return { ok: false as const, reason: "invalid_email" };
    if (data.password.length < 10) return { ok: false as const, reason: "weak_password" };

    try {
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
      if (!userId) return { ok: false as const, reason: "provision_failed", detail: "no_user_id" };

      for (const role of ["customer", "admin"] as const) {
        const { error } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
        if (error) throw error;
      }

      return { ok: true as const, created, email: data.email };
    } catch (err) {
      // رسالة الخطأ التقنية فقط (لا أسرار ولا كلمات مرور)
      const detail = err instanceof Error ? err.message : "unknown_error";
      console.error("[setup-test-admin] provisioning failed:", detail);
      return { ok: false as const, reason: "provision_failed", detail };
    }
  });


/**
 * تجهيز حسابات اختبار (زبون / مندوب / تاجر) بالأدوار الفعلية الموجودة في المشروع.
 * محمي برمز الإعداد السري، محصور على نطاق @yammak.test، وكلمة المرور تُدخل وقت التنفيذ.
 */
export const provisionTestAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; kind: string; email: string; password: string }) => ({
    token: String(data?.token ?? "").trim(),
    kind: String(data?.kind ?? "").trim(),
    email: String(data?.email ?? "").trim().toLowerCase(),
    password: String(data?.password ?? ""),
  }))
  .handler(async ({ data }) => {
    if (!process.env["ADMIN_SETUP_TOKEN"]) return { ok: false as const, reason: "server_token_missing" };
    const helpers = await import("@/lib/admin-setup.server");
    if (!helpers.setupTokenMatches(data.token)) return { ok: false as const, reason: "invalid_token" };
    if (!helpers.TEST_EMAIL_RE.test(data.email)) return { ok: false as const, reason: "invalid_email" };
    if (data.password.length < 10) return { ok: false as const, reason: "weak_password" };
    if (!["customer", "driver", "vendor", "service_provider"].includes(data.kind))
      return { ok: false as const, reason: "invalid_kind" };

    const fullName =
      data.kind === "customer"
        ? "زبون اختبار"
        : data.kind === "driver"
          ? "مندوب اختبار"
          : data.kind === "service_provider"
            ? "مقدم خدمة اختبار"
            : "تاجر اختبار";
    const { userId, created } = await helpers.upsertTestAuthUser(data.email, data.password, fullName);
    const cityId = await helpers.defaultCityId();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, full_name: fullName, city_id: cityId }, { onConflict: "id" });
    if (profileError) throw profileError;

    if (data.kind === "customer") {
      await helpers.grantRoles(userId, ["customer"]);
    } else if (data.kind === "driver") {
      await helpers.grantRoles(userId, ["customer", "worker"]);
      const { error } = await supabaseAdmin.from("worker_profiles").upsert(
        {
          user_id: userId,
          worker_kind: "delivery",
          requested_kind: "delivery",
          vehicle_type: "bike",
          application_status: "approved",
          is_approved: true,
          is_available: true,
          city_id: cityId,
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    } else if (data.kind === "service_provider") {
      await helpers.grantRoles(userId, ["customer", "provider"]);
      const { data: category } = await supabaseAdmin
        .from("profession_categories")
        .select("id")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      const { data: existing } = await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("owner_id", userId)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        const { error } = await supabaseAdmin.from("providers").insert({
          owner_id: userId,
          name: "مقدم خدمة اختبار لبابك",
          kind: "profession",
          status: "approved",
          is_open: true,
          city_id: cityId,
          profession_category_id: category?.id ?? null,
        });
        if (error) throw error;
      }
    } else {
      await helpers.grantRoles(userId, ["customer", "provider"]);
      const { data: existing } = await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("owner_id", userId)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        const { error } = await supabaseAdmin.from("providers").insert({
          owner_id: userId,
          name: "متجر اختبار لبابك",
          kind: "store",
          status: "approved",
          is_open: true,
          city_id: cityId,
        });
        if (error) throw error;
      }
    }

    return { ok: true as const, created, email: data.email, kind: data.kind };
  });
