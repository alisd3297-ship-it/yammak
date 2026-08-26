import { createHash, timingSafeEqual } from "node:crypto";

/** مقارنة رمز الإعداد بشكل آمن زمنياً. */
export function setupTokenMatches(input: string): boolean {
  // تُقرأ القيمة وقت التنفيذ (داخل معالج الدالة) وليس وقت البناء
  const expected = process.env["ADMIN_SETUP_TOKEN"];
  if (!expected) throw new Error("لم يتم ضبط رمز الإعداد على الخادم");
  const a = createHash("sha256").update(input.trim(), "utf8").digest();
  const b = createHash("sha256").update(expected.trim(), "utf8").digest();
  return timingSafeEqual(a, b);
}

export const TEST_EMAIL_RE = /^[a-z0-9._-]+@(yammak|lubabak)\.test$/;

/** إنشاء حساب اختبار أو تحديث كلمة مروره، وإرجاع معرّفه. */
export async function upsertTestAuthUser(
  email: string,
  password: string,
  fullName: string,
): Promise<{ userId: string; created: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (list.users.length < 200) break;
  }

  if (userId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return { userId, created: false };
  }

  const { data: createdUser, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, is_test_account: true },
  });
  if (error) throw error;
  const newId = createdUser.user?.id;
  if (!newId) throw new Error("تعذر تجهيز الحساب");
  return { userId: newId, created: true };
}

export async function grantRoles(userId: string, roles: readonly string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (const role of roles) {
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: role as never }, { onConflict: "user_id,role" });
    if (error) throw error;
  }
}

/** مدينة التشغيل الافتراضية (كربلاء) إن وُجدت. */
export async function defaultCityId(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("cities")
    .select("id")
    .ilike("name", "%كربلاء%")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
