import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CART_STORAGE_KEY } from "@/lib/cart";

export const AUTH_BACKUP_KEY = "yammak:auth-backup";
export const ROLE_ROUTED_KEY = "yammak:role-routed";
/** علامة مؤقتة تمنع استعادة الجلسة من النسخة الاحتياطية بعد خروج متعمد. */
export const SIGNED_OUT_KEY = "yammak:signed-out";

/** يمسح كل آثار الجلسة المحلية (نسخة التوكن الاحتياطية وعلامة توجيه الدور). */
export function clearLocalAuthState() {
  try {
    localStorage.removeItem(AUTH_BACKUP_KEY);
    localStorage.setItem(SIGNED_OUT_KEY, "1");
    // السلة مرتبطة بالمستخدم: نمسحها حتى لا يرثها حساب آخر على نفس الجهاز.
    localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    /* التخزين غير متاح */
  }
  try {
    sessionStorage.removeItem(ROLE_ROUTED_KEY);
  } catch {
    /* تجاهل */
  }
}

/** تسجيل خروج كامل: إيقاف الاستعلامات، مسح الكاش والجلسة، ثم الانتقال إلى /auth. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async function signOut() {
    await queryClient.cancelQueries();
    clearLocalAuthState();
    try {
      await supabase.auth.signOut();
    } catch {
      /* حتى لو فشل الاتصال، نكمل التنظيف محلياً */
    }
    queryClient.clear();
    navigate({ to: "/auth", replace: true });
  };
}
