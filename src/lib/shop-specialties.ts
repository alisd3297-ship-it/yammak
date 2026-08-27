import { normalizeArabic } from "@/lib/search";
import { isPharmacyProvider, type ClassifiableProvider } from "@/lib/verticals";

/**
 * تخصصات المحلات — هيكل عام قابل للتوسع.
 * لإضافة تخصص جديد مستقبلاً يكفي إضافة عنصر هنا بدون تعديل الداشبورد.
 */
export type ShopSpecialty = {
  slug: string;
  label: string;
  hint: string;
  /** اسم أيقونة من lucide-react */
  icon: string;
  terms: string[];
};

export const SHOP_SPECIALTIES: ShopSpecialty[] = [
  {
    slug: "bakeries",
    label: "مخابز وأفران",
    hint: "خبز وصمون طازج",
    icon: "CookingPot",
    terms: ["مخبز", "مخابز", "فرن", "افران", "أفران", "صمون", "خبز", "bakery"],
  },
  {
    slug: "sweets",
    label: "حلويات",
    hint: "كيك وحلويات",
    icon: "CakeSlice",
    terms: ["حلويات", "حلوى", "كيك", "بقلاوة", "كنافة", "sweet", "dessert"],
  },
  {
    slug: "butchers",
    label: "قصابات",
    hint: "لحوم ودجاج",
    icon: "Beef",
    terms: ["قصاب", "قصابة", "قصابات", "لحوم", "لحم", "دجاج", "butcher", "meat"],
  },
  {
    slug: "produce",
    label: "خضار وفواكه",
    hint: "طازج يومياً",
    icon: "Apple",
    terms: ["خضار", "خضروات", "فواكه", "فاكهة", "عطارية", "produce", "vegetable", "fruit"],
  },
  {
    slug: "water",
    label: "مياه",
    hint: "ماء وعبوات",
    icon: "Droplets",
    terms: ["ماء", "مياه", "ماي", "عبوات", "water"],
  },
  {
    slug: "beauty",
    label: "عطور وتجميل",
    hint: "عطور ومستحضرات",
    icon: "Sparkles",
    terms: ["عطور", "عطر", "تجميل", "مكياج", "perfume", "cosmetic", "makeup"],
  },
  {
    slug: "clothes",
    label: "ملابس",
    hint: "أزياء وأحذية",
    icon: "Shirt",
    terms: ["ملابس", "البسة", "أزياء", "ازياء", "احذية", "أحذية", "boutique", "clothes", "fashion"],
  },
  {
    slug: "electronics",
    label: "موبايلات وإلكترونيات",
    hint: "أجهزة وملحقات",
    icon: "Smartphone",
    terms: [
      "موبايل",
      "موبايلات",
      "هاتف",
      "هواتف",
      "الكترونيات",
      "إلكترونيات",
      "mobile",
      "electronic",
    ],
  },
  {
    slug: "home",
    label: "مستلزمات منزلية",
    hint: "أدوات وأثاث",
    icon: "Lamp",
    terms: [
      "منزلية",
      "منزل",
      "ادوات منزلية",
      "أدوات منزلية",
      "مفروشات",
      "اثاث",
      "أثاث",
      "home",
      "household",
    ],
  },
];

export function findSpecialty(slug: string): ShopSpecialty | undefined {
  return SHOP_SPECIALTIES.find((s) => s.slug === slug);
}

/** هل هذا المحل ضمن التخصص المحدد؟ (الصيدليات مستثناة، لها قسمها الخاص) */
export function matchesSpecialty(specialty: ShopSpecialty, p: ClassifiableProvider): boolean {
  if (isPharmacyProvider(p)) return false;
  const text = normalizeArabic([p.name, p.description ?? "", ...(p.keywords ?? [])].join(" "));
  return specialty.terms.some((t) => text.includes(normalizeArabic(t)));
}

/** التخصصات التي لها محلات فعلاً + عدد المحلات لكل تخصص. */
export function specialtiesWithCounts<T extends ClassifiableProvider>(providers: T[]) {
  return SHOP_SPECIALTIES.map((s) => ({
    specialty: s,
    count: providers.filter((p) => matchesSpecialty(s, p)).length,
  })).filter((r) => r.count > 0);
}
