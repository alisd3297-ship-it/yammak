import { useCallback, useEffect, useState } from "react";

/**
 * مفضلة الزبون: تخزين محلي بسيط لمعرفات مقدمي الخدمة.
 * لا تمس أي بيانات على الخادم، ولا تعطل أي ميزة قائمة.
 */
const KEY = "lubabak.favorites.v1";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* تجاهل امتلاء التخزين */
  }
  window.dispatchEvent(new Event("lubabak-favorites"));
}

export function useFavorites() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(read());
    sync();
    window.addEventListener("lubabak-favorites", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("lubabak-favorites", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const current = read();
    write(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }, []);

  const isFavorite = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, toggle, isFavorite };
}
