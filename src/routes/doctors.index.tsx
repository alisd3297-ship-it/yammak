import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Star, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAreaGuard } from "@/lib/auth";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useCachedQuery } from "@/lib/offline-cache";
import { BackButton, BottomNav, OfflineBanner, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { fuzzyScore } from "@/lib/search";
import { isDoctorCategoryName, isDoctorProvider } from "@/lib/verticals";

export const Route = createFileRoute("/doctors/")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "أطباء وعيادات | لبابك" },
      {
        name: "description",
        content: "احجز استشارة أو زيارة منزلية مع أطباء وعيادات معتمدة عبر لبابك.",
      },
      { property: "og:title", content: "أطباء وعيادات | لبابك" },
      { property: "og:description", content: "أطباء وعيادات معتمدون قريبون منك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DoctorsPage,
});

function DoctorsPage() {
  useCustomerAreaGuard();
  const [term, setTerm] = useState("");

  const query = useCachedQuery(["doctor-providers"], async () => {
    const [categories, providers] = await Promise.all([
      supabase
        .from("profession_categories")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null),
      supabase
        .from("providers")
        .select("id, name, description, rating, is_open, keywords, address_text, profession_category_id")
        .eq("status", "approved")
        .eq("kind", "profession"),
    ]);
    const catNames = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
    return (providers.data ?? []).filter((p) =>
      isDoctorProvider({
        name: p.name,
        description: p.description,
        keywords: p.keywords,
        categoryName: p.profession_category_id ? (catNames.get(p.profession_category_id) ?? null) : null,
      }),
    );
  });

  // قائمة الأقسام الطبية تُستخدم فقط لرسالة التوجيه عند عدم وجود أطباء.
  const medicalHint = useMemo(() => isDoctorCategoryName("عيادات"), []);

  const list = useMemo(() => {
    const rows = query.data ?? [];
    if (!term.trim()) return rows;
    return rows
      .map((p) => ({ p, score: fuzzyScore(term, [p.name, p.description ?? "", ...(p.keywords ?? [])]) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.p);
  }, [query.data, term]);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" label="رجوع" />
        <h1 className="text-2xl font-black">أطباء وعيادات</h1>
        <p className="mt-1 text-sm opacity-90">استشارات وزيارات طبية</p>
      </header>

      <div className="px-4">
        <div className="relative -mt-6">
          <Search className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="دور على طبيب أو عيادة"
            className="h-13 rounded-2xl border-none bg-card pe-12 shadow-card"
            aria-label="بحث عن طبيب"
          />
        </div>
      </div>

      <OfflineBanner stale={query.isStaleCache} />

      <div className="mt-4 space-y-3 px-4">
        {list.map((p) => (
          <Link
            key={p.id}
            to="/services/$id"
            params={{ id: p.id }}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft transition active:scale-[0.99]"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Stethoscope className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.description}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="size-3.5 fill-warning text-warning" />
                  {Number(p.rating).toFixed(1)}
                </span>
                <span className="truncate">{p.address_text}</span>
              </div>
            </div>
          </Link>
        ))}
        {!list.length && medicalHint && (
          <div className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            <p>ما توجد عيادات أو أطباء مسجلين حالياً.</p>
            <Link to="/services" className="mt-2 inline-block font-semibold text-primary">
              تصفّح باقي المهن والخدمات
            </Link>
          </div>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
