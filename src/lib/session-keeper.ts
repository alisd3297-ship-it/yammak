import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_BACKUP_KEY, ROLE_ROUTED_KEY, SIGNED_OUT_KEY } from "@/lib/sign-out";

const BACKUP_KEY = AUTH_BACKUP_KEY;

type Backup = { access_token: string; refresh_token: string };


function readBackup(): Backup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Backup>;
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
  } catch {
    return null;
  }
}

/**
 * يحافظ على جلسة المصادقة بعد إغلاق التطبيق وإعادة فتحه:
 * - نسخة احتياطية من التوكن لاستعادتها إذا فُقد مفتاح Supabase الأساسي.
 * - إعادة تفعيل/تحديث الجلسة عند عودة التطبيق للواجهة (Capacitor / تبويب الويب).
 */
export function useSessionKeeper() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      try {
        if (event === "SIGNED_OUT" || !session) {
          if (event === "SIGNED_OUT") localStorage.removeItem(BACKUP_KEY);
          return;
        }
        localStorage.setItem(
          BACKUP_KEY,
          JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
        );
      } catch {
        /* التخزين غير متاح — نتجاهل بهدوء */
      }
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || data.session) return;
      const backup = readBackup();
      if (!backup) return;
      const { error } = await supabase.auth.setSession(backup);
      if (error) {
        try {
          localStorage.removeItem(BACKUP_KEY);
        } catch {
          /* تجاهل */
        }
      }
    })();

    const onResume = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.auth.getSession();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, []);
}
