import { createFileRoute, Link } from "@tanstack/react-router";
import { useCustomerAreaGuard } from "@/lib/auth";
import { useMemo, useState } from "react";
import { Search, Star, Wrench } from "lucide-react";
import * as Icons from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useCachedQuery } from "@/lib/offline-cache";
import { BackButton, BottomNav, OfflineBanner, PageShell  } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { fuzzyScore } from "@/lib/search";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/services/")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "مهن وخدمات | لبابك" },
      {
        name: "description",
        content: "كهربائي، سبّاك، صيانة تكييف، تنظيف ونجارة — اطلب مقدم خدمة معتمد في بغداد عبر لبابك.",
      },
      { property: "og:title", content: "مهن وخدمات | لبابك" },
      { property: "og:description", content: "مقدمو خدمات مهنية معتمدون قريبون منك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  useCustomerAreaGuard();
  const [term, setTerm] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const query = useCachedQuery(["service-providers"], async () => {
    const [categories, providers] = await Promise.all([
      supabase
        .from("profession_categories")
        .select("id, name, icon, sort_order")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("providers")
        .select(
          "id, name, description, rating, ratings_count, is_open, keywords, address_text, profession_category_id, provider_services(name, is_active)",
        )
        .eq("status", "approved")
        .eq("is_demo", false)
        .eq("kind", "profession"),
    ]);
    return { categories: categories.data ?? [], providers: providers.data ?? [] };
  });

  const list = useMemo(() => {
    let rows = query.data?.providers ?? [];
    if (categoryId) rows = rows.filter((p) => p.profession_category_id === categoryId);
    if (onlyAvailable) rows = rows.filter((p) => p.is_open);
    if (term.trim()) {
      return rows
        .map((p) => ({
          p,
          score: fuzzyScore(term, [
            p.name,
            p.description ?? "",
            ...(p.keywords ?? []),
            ...((p.provider_services as { name: string }[] | null) ?? []).map((s) => s.name),
          ]),
        }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.p);
    }
    return [...rows].sort((a, b) => Number(b.rating) - Number(a.rating));
  }, [query.data, term, categoryId, onlyAvailable]);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" label="رجوع" />
        <h1 className="text-2xl font-black">مهن وخدمات</h1>
        <p className="mt-1 text-sm opacity-90">كهربائي، سبّاك، تبريد، تنظيف ونجارة</p>
      </header>

      <div className="px-4">
        <div className="relative -mt-6">
          <Search className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="دور على مهنة أو خدمة"
            className="h-13 rounded-2xl border-none bg-card pe-12 shadow-card"
            aria-label="بحث عن خدمة"
          />
        </div>
      </div>

      <OfflineBanner stale={query.isStaleCache} />

      <div className="mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          onClick={() => setCategoryId(null)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition",
            categoryId === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          كل المهن
        </button>
        {(query.data?.categories ?? []).map((c) => {
          const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[c.icon] ?? Wrench;
          return (
            <button
              key={c.id}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition",
                categoryId === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {c.name}
            </button>
          );
        })}
      </div>

      <div className="mt-2 px-4">
        <button
          onClick={() => setOnlyAvailable((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
            onlyAvailable ? "border-primary text-primary" : "border-border text-muted-foreground",
          )}
        >
          المتاح الآن فقط
        </button>
      </div>

      <div className="mt-4 space-y-3 px-4">
        {list.map((p) => {
          const services = ((p.provider_services as { name: string; is_active: boolean }[] | null) ?? []).filter(
            (s) => s.is_active,
          );
          return (
            <Link
              key={p.id}
              to="/services/$id"
              params={{ id: p.id }}
              className="flex items-start gap-3 rounded-2xl bg-card p-3 shadow-soft transition active:scale-[0.99]"
            >
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <Wrench className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="size-3.5 fill-warning text-warning" />
                    {Number(p.rating).toFixed(1)} ({p.ratings_count})
                  </span>
                  <span className="truncate">{p.address_text}</span>
                  <span className={p.is_open ? "text-success" : "text-destructive"}>
                    {p.is_open ? "متاح" : "غير متاح"}
                  </span>
                </div>
                {services.length > 0 && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {services.slice(0, 3).map((s) => s.name).join(" • ")}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
        {!list.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ما توجد خدمات مطابقة.</p>
        )}
      </div>

      <div className="mt-6 px-4">
        <Link
          to="/join/provider"
          className="block rounded-2xl bg-accent p-4 text-center text-sm font-semibold text-accent-foreground"
        >
          عندك مهنة؟ انضم كمقدم خدمة في لبابك
        </Link>
      </div>

      <BottomNav />
    </PageShell>
  );
}
