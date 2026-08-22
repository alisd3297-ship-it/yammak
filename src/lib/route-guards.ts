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
  if (error || !data.user) throw redirect({ to: "/auth" });
  return { userId: data.user.id };
}

/** حارس مبكر لصفحات الإدارة: تسجيل دخول + دور إداري. */
export async function requireStaff(): Promise<{ userId: string }> {
  const { userId } = await requireSignedIn();
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) {
    // تعذر التحقق (شبكة): لا نمنح الوصول، ونعيد المستخدم للرئيسية بدل شاشة فارغة.
    throw redirect({ to: "/" });
  }
  const isStaff = (data ?? []).some((r) => STAFF_ROLES.includes(r.role as string));
  if (!isStaff) throw redirect({ to: "/" });
  return { userId };
}
