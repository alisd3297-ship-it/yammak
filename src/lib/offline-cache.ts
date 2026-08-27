import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * طبقة تخزين مؤقت للبيانات الثابتة (الخدمات، الأقسام، المطاعم، المتاجر).
 * تُحدَّث كل 6 ساعات عند توفر الإنترنت، وتُعرض آخر نسخة مخزنة عند انقطاعه.
 * لا تُستخدم للبيانات الحية (حالة الطلب، موقع المندوب، التوفر).
 */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** يُرفع عند تغيير محتوى البيانات الثابتة حتى لا يبقى المستخدم على نسخة قديمة. */
const CACHE_VERSION = "v2";
const CACHE_PREFIX = "yammak.cache.";

type Envelope<T> = { at: number; data: T };

function storageKey(key: QueryKey) {
  return `${CACHE_PREFIX}${CACHE_VERSION}.${JSON.stringify(key)}`;
}

let purged = false;
function purgeOldVersions() {
  if (purged || typeof window === "undefined") return;
  purged = true;
  try {
    const keep = `${CACHE_PREFIX}${CACHE_VERSION}.`;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(CACHE_PREFIX) && !k.startsWith(keep)) localStorage.removeItem(k);
    }
  } catch {
    /* تخزين غير متاح */
  }
}

export function readCache<T>(key: QueryKey): Envelope<T> | null {
  if (typeof window === "undefined") return null;
  purgeOldVersions();
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? (JSON.parse(raw) as Envelope<T>) : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: QueryKey, data: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* المساحة ممتلئة */
  }
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function useCachedQuery<T>(key: QueryKey, fetcher: () => Promise<T>) {
  // لا نقرأ التخزين المحلي أثناء أول رسم حتى لا يختلف ناتج الخادم عن المتصفح (hydration).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const cached = hydrated ? readCache<T>(key) : null;

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        const data = await fetcher();
        writeCache(key, data);
        return data;
      } catch (error) {
        const fallback = readCache<T>(key);
        if (fallback) return fallback.data;
        throw error;
      }
    },
    ...(cached ? { placeholderData: (() => cached.data) as never } : {}),
    staleTime: 60 * 1000,
    refetchOnMount: "always",
    refetchInterval: CACHE_TTL_MS,
    refetchOnWindowFocus: false,
  });

  const isStaleCache = !!cached && Date.now() - cached.at > CACHE_TTL_MS;
  return { ...query, isStaleCache };
}
