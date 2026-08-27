import { useCallback, useEffect, useState } from "react";

/**
 * تفضيلات الإعلانات: أي فئات إعلانية يريد المستخدم رؤيتها في الشريط.
 * تُحفظ محلياً على الجهاز (سريعة وبدون طلبات شبكة)، والافتراضي «كل الإعلانات».
 */

const STORAGE_KEY = "lubabak.ad-prefs.v1";
const EVENT = "lubabak:ad-prefs";

/** null = كل الإعلانات (الافتراضي). مصفوفة = معرفات الفئات المسموح بعرضها. */
export type AdPrefs = string[] | null;

function read(): AdPrefs {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return null;
  }
}

function write(prefs: AdPrefs) {
  if (typeof window === "undefined") return;
  try {
    if (prefs === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* التخزين قد يكون معطلاً — نتجاهل بهدوء */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useAdPreferences() {
  // نبدأ بالافتراضي على الخادم ثم نقرأ التخزين بعد الترطيب لتفادي اختلاف الترطيب.
  const [prefs, setPrefs] = useState<AdPrefs>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(read());
    setReady(true);
    const sync = () => setPrefs(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((next: AdPrefs) => {
    write(next);
    setPrefs(next);
  }, []);

  const toggle = useCallback(
    (categoryId: string, allIds: string[]) => {
      const current = prefs === null ? allIds : prefs;
      const next = current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];
      // اختيار كل الفئات = العودة للوضع الافتراضي «كل الإعلانات»
      save(allIds.length > 0 && next.length === allIds.length ? null : next);
    },
    [prefs, save],
  );

  const isVisible = useCallback(
    (categoryId: string) => prefs === null || prefs.includes(categoryId),
    [prefs],
  );

  return { prefs, ready, save, toggle, isVisible, showAll: () => save(null) };
}
