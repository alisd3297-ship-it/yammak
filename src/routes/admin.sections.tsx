import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminNav, PageShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireStaff } from "@/lib/route-guards";
import { SHOP_SPECIALTIES, matchesSpecialty } from "@/lib/shop-specialties";

export const Route = createFileRoute("/admin/sections")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "الأقسام والتخصصات | لبابك" },
      {
        name: "description",
        content: "إدارة أقسام لبابك الرئيسية وتخصصات المحلات مثل المخابز والحلويات والقصابات والخضار.",
      },
      { property: "og:title", content: "الأقسام والتخصصات | لبابك" },
      { property: "og:description", content: "أقسام المنصة وتخصصات المحلات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSectionsPage,
});

/** الأقسام الرئيسية الظاهرة للزبون. */
const MAIN_SECTIONS = [
  { label: "مطاعم", path: "/restaurants" },
  { label: "محلات", path: "/shops" },
  { label: "سوبر ماركت", path: "/stores" },
  { label: "مهن وخدمات", path: "/services" },
  { label: "توصيل", path: "/courier" },
  { label: "تكسي", path: "/taxi" },
  { label: "طبيب", path: "/doctors" },
  { label: "صيدلية", path: "/pharmacies" },
] as const;

function AdminSectionsPage() {
  const { data: providers } = useQuery({
    queryKey: ["admin-shop-specialty-counts"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, name, keywords, kind, status")
        .eq("kind", "store")
        .limit(500);
      return data ?? [];
    },
  });

  const counts = new Map<string, number>();
  for (const sp of SHOP_SPECIALTIES) {
    counts.set(sp.slug, (providers ?? []).filter((p) => matchesSpecialty(sp, p as never)).length);
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">الأقسام والتخصصات</h1>
        <p className="mt-1 text-sm opacity-90">الأقسام الرئيسية للزبون وتخصصات المحلات القابلة للتوسع.</p>
      </header>

      <AdminNav />

      <section className="px-4 pt-5">
        <h2 className="mb-3 text-base font-black">الأقسام الرئيسية</h2>
        <div className="grid grid-cols-2 gap-2">
          {MAIN_SECTIONS.map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-4 shadow-soft">
              <p className="font-bold">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.path}</p>
            </div>
          ))}
        </div>
        <Link
          to="/admin/services"
          className="mt-3 block rounded-2xl bg-card p-4 text-sm font-semibold text-primary shadow-soft"
        >
          إدارة كتالوج الخدمات والمهن (إضافة/تعديل الأقسام والتخصصات)
        </Link>
      </section>

      <section className="px-4 py-5">
        <h2 className="mb-3 text-base font-black">تخصصات «محلات»</h2>
        <div className="space-y-2">
          {SHOP_SPECIALTIES.map((sp) => (
            <div key={sp.slug} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-soft">
              <div>
                <p className="font-bold">{sp.label}</p>
                <p className="text-xs text-muted-foreground">{sp.hint}</p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                {counts.get(sp.slug) ?? 0} محل
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-2xl bg-muted p-4 text-xs text-muted-foreground">
          يتم ربط المحل بتخصصه تلقائياً من اسمه وكلماته المفتاحية، وتقدر تضيف تخصصات جديدة بسهولة لاحقاً.
        </p>
      </section>
    </PageShell>
  );
}
