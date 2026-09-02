import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  applyBrand,
  BRAND_SETTINGS_KEY,
  cacheBrand,
  DEFAULT_BRAND,
  parseBrand,
  readCachedBrand,
  type BrandTheme,
} from "@/lib/brand-theme";

export type ThemeMode = "light" | "dark" | "auto";

const STORAGE_KEY = "lubabak.theme.v1";

type ThemeApi = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  /** ألوان الهوية الحالية (قابلة للتغيير من إعدادات التطبيق) */
  brand: BrandTheme;
  /** تطبيق ألوان جديدة محلياً فوراً (الحفظ العام يتم من صفحة الإعدادات) */
  applyBrandPreview: (theme: BrandTheme) => void;
};

const ThemeContext = createContext<ThemeApi | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** الوضع الليلي الذكي: فاتح / داكن / تلقائي حسب إعداد الجهاز. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [systemDark, setSystemDark] = useState(false);
  const [brand, setBrand] = useState<BrandTheme>(DEFAULT_BRAND);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === "light" || saved === "dark" || saved === "auto") setModeState(saved);
    } catch {
      /* التخزين غير متاح */
    }
    setSystemDark(systemPrefersDark());
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ألوان الهوية: من الكاش فوراً ثم من إعدادات التطبيق العامة
  useEffect(() => {
    const cached = readCachedBrand();
    if (cached) {
      setBrand(cached);
      applyBrand(cached);
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", BRAND_SETTINGS_KEY)
        .maybeSingle();
      if (cancelled || !data?.value) return;
      const next = parseBrand(data.value);
      setBrand(next);
      applyBrand(next);
      cacheBrand(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolved: "light" | "dark" = mode === "auto" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const api = useMemo<ThemeApi>(
    () => ({
      mode,
      resolved,
      setMode: (next) => {
        setModeState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* التخزين غير متاح */
        }
      },
      brand,
      applyBrandPreview: (next) => {
        setBrand(next);
        applyBrand(next);
        cacheBrand(next);
      },
    }),
    [mode, resolved, brand],
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx)
    return {
      mode: "auto",
      resolved: "light",
      setMode: () => undefined,
      brand: DEFAULT_BRAND,
      applyBrandPreview: () => undefined,
    };
  return ctx;
}

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: "فاتح",
  dark: "ليلي",
  auto: "تلقائي",
};
