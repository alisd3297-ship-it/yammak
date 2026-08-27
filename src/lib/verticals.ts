import { normalizeArabic } from "@/lib/search";

/**
 * تصنيف مقدمي الخدمة إلى عموديات واضحة للزبون (سوبر ماركت / صيدلية / طبيب).
 * التصنيف مشترك بين كل الصفحات حتى لا يظهر مقدم خدمة في القسم الخطأ.
 */

const PHARMACY_TERMS = ["صيدلية", "صيدليه", "صيدليات", "دواء", "ادوية", "أدوية", "pharmacy"];
const DOCTOR_TERMS = [
  "طبيب",
  "طبيبة",
  "اطباء",
  "أطباء",
  "عيادة",
  "عيادات",
  "طب",
  "doctor",
  "clinic",
];

function haystack(parts: (string | null | undefined)[]): string {
  return normalizeArabic(parts.filter(Boolean).join(" "));
}

function matches(terms: string[], text: string): boolean {
  return terms.some((t) => text.includes(normalizeArabic(t)));
}

export type ClassifiableProvider = {
  name: string;
  description?: string | null;
  keywords?: string[] | null;
};

/** هل هذا المتجر صيدلية؟ */
export function isPharmacyProvider(p: ClassifiableProvider): boolean {
  return matches(PHARMACY_TERMS, haystack([p.name, p.description, ...(p.keywords ?? [])]));
}

/** هل هذا القسم المهني قسم طبي؟ */
export function isDoctorCategoryName(name: string): boolean {
  return matches(DOCTOR_TERMS, normalizeArabic(name));
}

/** هل مقدم الخدمة المهني طبيب/عيادة؟ */
export function isDoctorProvider(
  p: ClassifiableProvider & { categoryName?: string | null },
): boolean {
  return matches(
    DOCTOR_TERMS,
    haystack([p.name, p.description, p.categoryName, ...(p.keywords ?? [])]),
  );
}
