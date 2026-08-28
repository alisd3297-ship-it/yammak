import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * إدارة حسابات دخول أصحاب المطاعم/المحلات من لوحة الإدارة.
 *
 * كل نشاط يملك حساباً مستقلاً (بريد + كلمة مرور) مرتبطاً بـ providers.owner_id،
 * ويحصل صاحبه على دور «provider» فقط — فلا يرى أي نشاط آخر (RLS: owner_id = auth.uid()).
 * التحقق من صلاحية الإدارة يتم على الخادم وداخل قاعدة البيانات، لا في الواجهة.
 */

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("owner_already_linked"))
    return "هذا الحساب مرتبط بنشاط آخر — استخدم بريداً مختلفاً";
  if (m.includes("provider_not_found")) return "النشاط غير موجود";
  if (m.includes("already been registered") || m.includes("already registered"))
    return "هذا البريد مسجّل مسبقاً — استخدم «ربط حساب موجود» أو بريداً آخر";
  if (m.includes("password") && m.includes("6")) return "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
  if (m.includes("weak") || m.includes("pwned")) return "كلمة المرور ضعيفة، اختر كلمة أقوى";
  if (m.includes("invalid email") || m.includes("validate email"))
    return "صيغة البريد الإلكتروني غير صحيحة";
  if (m.includes("forbidden") || m.includes("unauthorized")) return "غير مصرح بهذا الإجراء";
  return message || "تعذر تنفيذ العملية";
}

type AuthedContext = { userId: string; supabase: SupabaseClient<Database> };

/** يمنع أي استخدام لصلاحيات الخدمة قبل التأكد أن المنفّذ من طاقم الإدارة. */
async function assertStaff(context: AuthedContext) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (data !== true) throw new Error("forbidden");
}

/** البحث عن مستخدم بالبريد داخل نظام المصادقة. */
async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === wanted);
    if (hit) return { id: hit.id };
    if (data.users.length < 200) break;
  }
  return null;
}

/** حالة حساب النشاط: بريد الدخول، هل هو معطّل، ومتى أنشئ. */
export const getProviderAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string }) => ({ providerId: String(data.providerId) }))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select("id, owner_id")
      .eq("id", data.providerId)
      .maybeSingle();
    if (!provider?.owner_id) return { linked: false as const };

    const { data: user } = await supabaseAdmin.auth.admin.getUserById(provider.owner_id);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, is_blocked")
      .eq("id", provider.owner_id)
      .maybeSingle();

    return {
      linked: true as const,
      userId: provider.owner_id,
      email: user.user?.email ?? null,
      fullName: profile?.full_name ?? null,
      blocked:
        Boolean(profile?.is_blocked) ||
        Boolean((user.user as { banned_until?: string | null } | null)?.banned_until),
      lastSignInAt: user.user?.last_sign_in_at ?? null,
      invitePending: !user.user?.email_confirmed_at,
    };
  });

/**
 * إنشاء حساب دخول للنشاط أو ربط حساب موجود به.
 * mode = "password": الإدارة تحدد كلمة المرور ويُفعّل الحساب فوراً.
 * mode = "invite":   تُرسل دعوة للبريد ليضع صاحب النشاط كلمة مروره بنفسه.
 * mode = "link":     ربط حساب مسجّل مسبقاً بهذا النشاط.
 */
export const createProviderAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      providerId: string;
      email: string;
      password?: string | null;
      fullName?: string | null;
      mode: "password" | "invite" | "link";
      redirectTo?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const email = (data.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) throw new Error("صيغة البريد الإلكتروني غير صحيحة");
    if (data.mode === "password" && (data.password ?? "").length < 8)
      throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select("id, name, phone, owner_id")
      .eq("id", data.providerId)
      .maybeSingle();
    if (!provider) throw new Error("النشاط غير موجود");

    const fullName = (data.fullName ?? "").trim() || provider.name;
    let userId: string;
    let created = false;

    const existing = await findAuthUserByEmail(email);
    if (existing) {
      if (data.mode === "password") {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password: data.password!,
          email_confirm: true,
        });
        if (error) throw new Error(friendly(error.message));
      }
      userId = existing.id;
    } else if (data.mode === "invite") {
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, account_type: "provider" },
        ...(data.redirectTo ? { redirectTo: data.redirectTo } : {}),
      });
      if (error || !invited.user) throw new Error(friendly(error?.message ?? ""));
      userId = invited.user.id;
      created = true;
    } else if (data.mode === "link") {
      throw new Error("لا يوجد حساب بهذا البريد — أنشئ حساباً جديداً");
    } else {
      const { data: createdUser, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password!,
        email_confirm: true,
        user_metadata: { full_name: fullName, account_type: "provider" },
      });
      if (error || !createdUser.user) throw new Error(friendly(error?.message ?? ""));
      userId = createdUser.user.id;
      created = true;
    }

    // ملف شخصي + دور «مقدم خدمة» (بلا أي دور إداري)
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, full_name: fullName, phone: provider.phone, is_blocked: false },
        { onConflict: "id" },
      );
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "provider" }, { onConflict: "user_id,role" });

    // الربط يمر بدالة الإدارة الآمنة (تمنع ربط حساب بنشاطين وتسجّل التدقيق)
    const { error: linkError } = await context.supabase.rpc("admin_link_provider_owner", {
      _provider_id: provider.id,
      _owner_id: userId,
    });
    if (linkError) throw new Error(friendly(linkError.message));

    return { ok: true as const, userId, email, created, mode: data.mode };
  });

/** إعادة تعيين كلمة مرور حساب النشاط. */
export const resetProviderAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string; password: string }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    if ((data.password ?? "").length < 8)
      throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select("owner_id")
      .eq("id", data.providerId)
      .maybeSingle();
    if (!provider?.owner_id) throw new Error("لا يوجد حساب مرتبط بهذا النشاط");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(provider.owner_id, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(friendly(error.message));

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "provider_account_password_reset",
      entity: "providers",
      entity_id: data.providerId,
    });
    return { ok: true as const };
  });

/** تعطيل أو تفعيل حساب دخول النشاط (يمنع تسجيل الدخول فعلياً). */
export const setProviderAccountBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string; blocked: boolean }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select("owner_id")
      .eq("id", data.providerId)
      .maybeSingle();
    if (!provider?.owner_id) throw new Error("لا يوجد حساب مرتبط بهذا النشاط");

    // الحظر على مستوى المصادقة يمنع الدخول، وعلَم الملف الشخصي يوضح الحالة داخل التطبيق
    const { error } = await supabaseAdmin.auth.admin.updateUserById(provider.owner_id, {
      ban_duration: data.blocked ? "876000h" : "none",
    });
    if (error) throw new Error(friendly(error.message));
    await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: data.blocked })
      .eq("id", provider.owner_id);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: data.blocked ? "provider_account_disabled" : "provider_account_enabled",
      entity: "providers",
      entity_id: data.providerId,
      after_data: { blocked: data.blocked },
    });
    return { ok: true as const, blocked: data.blocked };
  });

/** فك ارتباط الحساب بالنشاط (يبقى الحساب موجوداً بلا نشاط). */
export const unlinkProviderAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { error } = await context.supabase.rpc("admin_link_provider_owner", {
      _provider_id: data.providerId,
      _owner_id: null as unknown as string,
    });
    if (error) throw new Error(friendly(error.message));
    return { ok: true as const };
  });
