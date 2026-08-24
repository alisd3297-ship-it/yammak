import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const STAFF_ROLES = ["super_admin", "admin", "supervisor"];

/**
 * حارس مبكر: يمنع فتح الصفحة قبل تسجيل الدخول (يعمل على العميل فقط).
 * نعتمد على الجلسة المخزنة محلياً أولاً حتى لا يُطرد المستخدم عند ضعف الشبكة
 * أو عند إعادة فتح التطبيق قبل اكتمال تحديث التوكن.
 */
export async function requireSignedIn(): Promise<{ userId: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (session?.user) return { userId: session.user.id };

  // لا توجد جلسة محلية: نتحقق من الخادم كمحاولة أخيرة (قد تكون الجلسة قيد الاسترجاع).
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw redirect({ to: "/auth", replace: true });
  return { userId: data.user.id };
}

async function rolesOf(userId: string): Promise<string[] | null> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return null;
  return (data ?? []).map((r) => r.role as string);
}

/** حارس مبكر لصفحات الإدارة: تسجيل دخول + دور إداري. */
export async function requireStaff(): Promise<{ userId: string }> {
  const { userId } = await requireSignedIn();
  const roles = await rolesOf(userId);
  // تعذر التحقق (شبكة): لا نمنح الوصول، ونعيد المستخدم للرئيسية بدل شاشة فارغة.
  if (!roles) throw redirect({ to: "/", replace: true });
  if (!roles.some((r) => STAFF_ROLES.includes(r))) throw redirect({ to: "/", replace: true });
  return { userId };
}

/**
 * حارس لوحة المندوب: يسمح للإدارة وللمستخدم الذي يملك ملف عامل فعلياً.
 * من ليس مندوباً يُوجَّه لصفحة الانضمام بدل رؤية لوحة فارغة.
 */
export async function requireWorker(): Promise<{ userId: string }> {
  const { userId } = await requireSignedIn();
  const roles = await rolesOf(userId);
  if (roles?.some((r) => STAFF_ROLES.includes(r))) return { userId };

  const { data, error } = await supabase
    .from("worker_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw redirect({ to: "/", replace: true });
  if (!data) throw redirect({ to: "/join/driver", replace: true });
  return { userId };
}

/**
 * حارس لوحة مقدم الخدمة: يسمح للإدارة ولمالك نشاط مسجّل.
 * غير المسجّل يُوجَّه لصفحة طلب الانضمام.
 */
export async function requireProvider(): Promise<{ userId: string }> {
  const { userId } = await requireSignedIn();
  const roles = await rolesOf(userId);
  if (roles?.some((r) => STAFF_ROLES.includes(r))) return { userId };

  const { data, error } = await supabase
    .from("providers")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw redirect({ to: "/", replace: true });
  if (!data) throw redirect({ to: "/join/provider", replace: true });
  return { userId };
}

/**
 * حارس واجهة الزبون: يمنع حساب المندوب الصِرف من فتح صفحات الطلب كزبون
 * ويعيده إلى لوحته. الزائر غير المسجّل يبقى قادراً على التصفح كما هو.
 */
export async function requireCustomerFlow(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const roles = await rolesOf(userId);
  if (roles?.some((r) => STAFF_ROLES.includes(r))) return;

  const [{ data: provider }, { data: worker }] = await Promise.all([
    supabase.from("providers").select("id").eq("owner_id", userId).maybeSingle(),
    supabase.from("worker_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (provider) return;
  if (worker) throw redirect({ to: "/driver", replace: true });
}
