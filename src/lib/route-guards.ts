import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const STAFF_ROLES = ["super_admin", "admin", "supervisor"];

/** حارس مبكر: يمنع فتح الصفحة قبل تسجيل الدخول (يعمل على العميل فقط). */
export async function requireSignedIn(): Promise<{ userId: string }> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw redirect({ to: "/auth" });
  return { userId: data.user.id };
}

/** حارس مبكر لصفحات الإدارة: تسجيل دخول + دور إداري. */
export async function requireStaff(): Promise<{ userId: string }> {
  const { userId } = await requireSignedIn();
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isStaff = (data ?? []).some((r) => STAFF_ROLES.includes(r.role as string));
  if (!isStaff) throw redirect({ to: "/" });
  return { userId };
}
