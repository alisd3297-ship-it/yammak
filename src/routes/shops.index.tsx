import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAreaGuard } from "@/lib/auth";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useCachedQuery } from "@/lib/offline-cache";
import { BackButton, BottomNav, OfflineBanner, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { fuzzyScore } from "@/lib/search";
import { specialtiesWithCounts } from "@/lib/shop-specialties";

export const Route = createFileRoute("/shops/")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "محلات | لبابك" },
      {
        name: "description",
        content:
          "تصفّح تخصصات المحلات في لبابك: مخابز وأفران، حلويات، قصابات، خضار وفواكه، مياه وغيرها.",
      },
      { property: "og:title", content: "محلات | لبابك" },
      { property: "og:description", content: "تخصصات المحلات القريبة منك مع توصيل سريع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShopsPage,
});

function ShopsPage() {
  useCustomerAreaGuard();
  const [term, setTerm] = useState("");

  const query = useCachedQuery(["shop-providers"], async () => {
    const { data } = await supabase
      .from("providers")
      .select("id, name, description, keywords")
      .eq("status", "approved")
      .eq("is_demo", false)
      .eq("kind", "store");
    return data ?? [];
  });

  const list = useMemo(() => {
    const rows = specialtiesWithCounts(query.data ?? []);
    if (!term.trim()) return rows;
    return rows.filter(
      (r) => fuzzyScore(term, [r.specialty.label, r.specialty.hint, ...r.specialty.terms]) > 0,
    );
  }, [query.data, term]);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" label="رجوع" />
        <h1 className="text-2xl font-black">محلات</h1>
        <p className="mt-1 text-sm opacity-90">اختر التخصص وشوف المحلات المسجلة ضمنه</p>
      </header>

      <div className="px-4">
        <div className="relative -mt-6">
          <Search className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="دور على تخصص"
            className="h-13 rounded-2xl border-none bg-card pe-12 shadow-card"
            aria-label="بحث عن تخصص محلات"
          />
        </div>
      </div>

      <OfflineBanner stale={query.isStaleCache} />

      <div className="mt-4 grid grid-cols-2 gap-3 px-4">
        {list.map(({ specialty, count }) => {
          const Icon =
            (Icons as unknown as Record<string, Icons.LucideIcon>)[specialty.icon] ?? Icons.Store;
          return (
            <Link
              key={specialty.slug}
              to="/shops/$slug"
              params={{ slug: specialty.slug }}
              className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-soft transition active:scale-[0.98]"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <Icon className="size-6" />
              </span>
              <span className="text-sm font-bold leading-tight">{specialty.label}</span>
              <span className="text-[11px] text-muted-foreground">{specialty.hint}</span>
              <span className="text-[11px] font-semibold text-primary">{count} محل</span>
            </Link>
          );
        })}
      </div>

      {!list.length && (
        <p className="mx-4 mt-4 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          ما توجد تخصصات فيها محلات مسجلة حالياً.
        </p>
      )}

      <BottomNav />
    </PageShell>
  );
}
