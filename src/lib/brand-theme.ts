/**
 * نظام ألوان لبابك القابل للتغيير من داخل التطبيق (بدون تعديل كود).
 * يُحفظ الاختيار في جدول app_settings تحت المفتاح brand_theme (عام لكل المستخدمين)
 * ويُطبَّق فوراً عبر متغيّرات CSS على :root و .dark.
 */

export type BrandTheme = {
  /** معرّف النمط الجاهز أو "custom" */
  preset: string;
  /** اللون الرئيسي (hex) */
  primary: string;
  /** لون النص فوق الرئيسي (hex) */
  primaryForeground: string;
  /** اللون الثانوي/الداكن (hex) */
  secondary: string;
  /** لون الخلفية في الوضع النهاري (hex) */
  background: string;
};

export const BRAND_SETTINGS_KEY = "brand_theme";
export const BRAND_STORAGE_KEY = "lubabak.brand.v1";

export type BrandPreset = BrandTheme & { id: string; label: string };

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: "red-black",
    label: "أحمر وأسود",
    preset: "red-black",
    primary: "#d92c2c",
    primaryForeground: "#ffffff",
    secondary: "#1c1c1c",
    background: "#f6f4f3",
  },
  {
    id: "navy-gold",
    label: "كحلي وذهبي",
    preset: "navy-gold",
    primary: "#1b3a86",
    primaryForeground: "#ffffff",
    secondary: "#c8a24a",
    background: "#f4f6fb",
  },
  {
    id: "green-sand",
    label: "أخضر ورملي",
    preset: "green-sand",
    primary: "#1f8a5b",
    primaryForeground: "#ffffff",
    secondary: "#20302a",
    background: "#f4f7f2",
  },
  {
    id: "orange-dark",
    label: "برتقالي وفحمي",
    preset: "orange-dark",
    primary: "#ea6a12",
    primaryForeground: "#ffffff",
    secondary: "#211d1a",
    background: "#faf5f0",
  },
  {
    id: "purple-night",
    label: "بنفسجي ليلي",
    preset: "purple-night",
    primary: "#7b3fd4",
    primaryForeground: "#ffffff",
    secondary: "#221c33",
    background: "#f6f3fb",
  },
  {
    id: "teal-clean",
    label: "تركوازي هادئ",
    preset: "teal-clean",
    primary: "#0f8f96",
    primaryForeground: "#ffffff",
    secondary: "#16292b",
    background: "#f2f7f8",
  },
];

export const DEFAULT_BRAND: BrandTheme = BRAND_PRESETS[0]!;

const STYLE_ELEMENT_ID = "lubabak-brand-theme";

function clamp(n: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = Number.parseInt(full.slice(0, 6) || "000000", 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0")).join("")}`;
}

/** مزج لونين بنسبة amount (0..1) نحو اللون الثاني. */
export function mix(hex: string, toward: string, amount: number) {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(toward);
  return rgbToHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
}

export function isValidHex(value: string) {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function normalizeHex(value: string) {
  const v = value.trim();
  return v.startsWith("#") ? v.toLowerCase() : `#${v.toLowerCase()}`;
}

export function parseBrand(raw: unknown): BrandTheme {
  if (!raw || typeof raw !== "object") return DEFAULT_BRAND;
  const v = raw as Partial<BrandTheme>;
  const pick = (val: unknown, fallback: string) =>
    typeof val === "string" && isValidHex(val) ? normalizeHex(val) : fallback;
  return {
    preset: typeof v.preset === "string" ? v.preset : "custom",
    primary: pick(v.primary, DEFAULT_BRAND.primary),
    primaryForeground: pick(v.primaryForeground, DEFAULT_BRAND.primaryForeground),
    secondary: pick(v.secondary, DEFAULT_BRAND.secondary),
    background: pick(v.background, DEFAULT_BRAND.background),
  };
}

/** يولّد كتلة CSS كاملة (نهاري + ليلي) من الألوان المختارة. */
export function brandCss(theme: BrandTheme): string {
  const white = "#ffffff";
  const black = "#000000";
  const p = theme.primary;
  const bg = theme.background;

  const light = {
    "--background": bg,
    "--foreground": mix(theme.secondary, black, 0.25),
    "--card": mix(bg, white, 0.75),
    "--card-foreground": mix(theme.secondary, black, 0.25),
    "--popover": mix(bg, white, 0.8),
    "--popover-foreground": mix(theme.secondary, black, 0.25),
    "--primary": p,
    "--primary-foreground": theme.primaryForeground,
    "--secondary": theme.secondary,
    "--secondary-foreground": white,
    "--muted": mix(bg, theme.secondary, 0.07),
    "--muted-foreground": mix(theme.secondary, bg, 0.45),
    "--accent": mix(bg, p, 0.14),
    "--accent-foreground": mix(p, black, 0.25),
    "--border": mix(bg, theme.secondary, 0.14),
    "--input": mix(bg, theme.secondary, 0.14),
    "--ring": p,
    "--icon-strong": mix(p, black, 0.1),
    "--icon-soft": mix(theme.secondary, bg, 0.25),
    "--sidebar": mix(theme.secondary, black, 0.15),
    "--sidebar-foreground": mix(white, theme.secondary, 0.05),
    "--sidebar-primary": p,
    "--sidebar-primary-foreground": theme.primaryForeground,
    "--sidebar-accent": mix(theme.secondary, white, 0.1),
    "--sidebar-accent-foreground": white,
    "--sidebar-border": mix(theme.secondary, white, 0.18),
    "--sidebar-ring": p,
  } satisfies Record<string, string>;

  const darkBase = mix(theme.secondary, black, 0.45);
  const dark = {
    "--background": darkBase,
    "--foreground": mix(white, theme.secondary, 0.06),
    "--card": mix(theme.secondary, black, 0.2),
    "--card-foreground": mix(white, theme.secondary, 0.06),
    "--popover": mix(theme.secondary, black, 0.12),
    "--popover-foreground": mix(white, theme.secondary, 0.06),
    "--primary": mix(p, white, 0.08),
    "--primary-foreground": theme.primaryForeground,
    "--secondary": mix(theme.secondary, white, 0.12),
    "--secondary-foreground": mix(white, theme.secondary, 0.06),
    "--muted": mix(theme.secondary, black, 0.05),
    "--muted-foreground": mix(white, theme.secondary, 0.4),
    "--accent": mix(theme.secondary, p, 0.25),
    "--accent-foreground": mix(white, p, 0.15),
    "--border": mix(theme.secondary, white, 0.16),
    "--input": mix(theme.secondary, white, 0.16),
    "--ring": mix(p, white, 0.1),
    "--icon-strong": mix(p, white, 0.2),
    "--icon-soft": mix(white, theme.secondary, 0.4),
    "--sidebar": mix(theme.secondary, black, 0.3),
    "--sidebar-foreground": mix(white, theme.secondary, 0.06),
    "--sidebar-primary": mix(p, white, 0.08),
    "--sidebar-primary-foreground": theme.primaryForeground,
    "--sidebar-accent": mix(theme.secondary, white, 0.1),
    "--sidebar-accent-foreground": white,
    "--sidebar-border": mix(theme.secondary, white, 0.2),
    "--sidebar-ring": mix(p, white, 0.1),
  } satisfies Record<string, string>;

  const toBlock = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join("");

  return `:root{${toBlock(light)}}\n.dark{${toBlock(dark)}}`;
}

/** يطبّق الألوان فوراً على الصفحة. */
export function applyBrand(theme: BrandTheme) {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  el.textContent = brandCss(theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.primary);
}

export function readCachedBrand(): BrandTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BRAND_STORAGE_KEY);
    return raw ? parseBrand(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function cacheBrand(theme: BrandTheme) {
  try {
    localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* التخزين غير متاح */
  }
}
