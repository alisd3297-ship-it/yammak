import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pill, Search, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAreaGuard } from "@/lib/auth";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useCachedQuery } from "@/lib/offline-cache";
import { BackButton, BottomNav, OfflineBanner, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { fuzzyScore } from "@/lib/search";
import { isPharmacyProvider } from "@/lib/verticals";

export const Route = createFileRoute("/pharmacies/")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "صيدليات | لبابك" },
      {
        name: "description",
        content: "اطلب أدويتك ومستلزماتك الطبية من الصيدليات المسجلة في لبابك مع توصيل سريع.",
      },
      { property: "og:title", content: "صيدليات | لبابك" },
      { property: "og:description", content: "صيدليات قريبة منك مع توصيل سريع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PharmaciesPage,
});

function PharmaciesPage() {
  useCustomerAreaGuard();
  const [term, setTerm] = useState("");

  const query = useCachedQuery(["pharmacies"], async () => {
    const { data } = await supabase
      .from("providers")
      .select("id, name, description, rating, is_open, keywords, address_text")
      .eq("status", "approved")
        .eq("is_demo", false)
      .eq("kind", "store");
    return (data ?? []).filter(isPharmacyProvider);
  });

  const list = useMemo(() => {
    const rows = query.data ?? [];
    if (!term.trim()) return [...rows].sort((a, b) => Number(b.is_open) - Number(a.is_open));
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
        <h1 className="text-2xl font-black">صيدليات</h1>
        <p className="mt-1 text-sm opacity-90">أدوية ومستلزمات طبية من صيدليات معتمدة</p>
      </header>

      <div className="px-4">
        <div className="relative -mt-6">
          <Search className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="دور على صيدلية أو دواء"
            className="h-13 rounded-2xl border-none bg-card pe-12 shadow-card"
            aria-label="بحث عن صيدلية"
          />
        </div>
      </div>

      <OfflineBanner stale={query.isStaleCache} />

      <div className="mt-4 space-y-3 px-4">
        {list.map((p) => (
          <Link
            key={p.id}
            to="/stores/$id"
            params={{ id: p.id }}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft transition active:scale-[0.99]"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Pill className="size-6" />
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
                <span className={p.is_open ? "text-success" : "text-destructive"}>
                  {p.is_open ? "مفتوح" : "مغلق"}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {!list.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ما توجد صيدليات مسجلة حالياً في منطقتك.
          </p>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
