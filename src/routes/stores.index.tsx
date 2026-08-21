import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Star, Store as StoreIcon, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCachedQuery } from "@/lib/offline-cache";
import { BottomNav, OfflineBanner, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { fuzzyScore } from "@/lib/search";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stores/")({
  head: () => ({
    meta: [
      { title: "المنتجات والمتاجر | يمّك" },
      {
        name: "description",
        content: "تسوّق من سوبرماركت وصيدليات ومتاجر مدينتك واستلم طلبك عبر مندوب يمّك.",
      },
      { property: "og:title", content: "المنتجات والمتاجر | يمّك" },
      { property: "og:description", content: "متاجر قريبة منك مع توصيل سريع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoresPage,
});

type SortKey = "rating" | "popular" | "open" | "nearest";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "rating", label: "الأعلى تقييماً" },
  { key: "popular", label: "الأكثر طلباً" },
  { key: "open", label: "المتاح الآن" },
  { key: "nearest", label: "الأقرب إليك" },
];

function StoresPage() {
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<SortKey>("rating");
  const [tag, setTag] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const query = useCachedQuery(["stores"], async () => {
    const { data } = await supabase
      .from("providers")
      .select("id, name, description, rating, orders_count, is_open, keywords, lat, lng, address_text")
      .eq("status", "approved")
      .eq("kind", "store");
    return data ?? [];
  });

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const p of query.data ?? []) for (const k of p.keywords ?? []) set.add(k);
    return [...set].slice(0, 12);
  }, [query.data]);

  const list = useMemo(() => {
    let rows = query.data ?? [];
    if (tag) rows = rows.filter((p) => (p.keywords ?? []).includes(tag));
    if (term.trim()) {
      return rows
        .map((p) => ({ p, score: fuzzyScore(term, [p.name, p.description ?? "", ...(p.keywords ?? [])]) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.p);
    }
    const sorted = [...rows];
    if (sort === "rating") sorted.sort((a, b) => Number(b.rating) - Number(a.rating));
    if (sort === "popular") sorted.sort((a, b) => b.orders_count - a.orders_count);
    if (sort === "open") sorted.sort((a, b) => Number(b.is_open) - Number(a.is_open));
    if (sort === "nearest" && coords)
      sorted.sort((a, b) => {
        const da = a.lat != null ? Math.hypot(a.lat - coords.lat, (a.lng ?? 0) - coords.lng) : 99;
        const db = b.lat != null ? Math.hypot(b.lat - coords.lat, (b.lng ?? 0) - coords.lng) : 99;
        return da - db;
      });
    return sorted;
  }, [query.data, term, sort, tag, coords]);

  function pickNearest() {
    setSort("nearest");
    if (!navigator.geolocation) {
      toast.error("خدمة الموقع غير متاحة على هذا الجهاز");
      setSort("rating");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        toast.error("تعذر تحديد موقعك، فعّل صلاحية الموقع وحاول مجدداً");
        setSort("rating");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm opacity-90">
          <ArrowRight className="size-4" /> رجوع
        </Link>
        <h1 className="text-2xl font-black">المنتجات والمتاجر</h1>
        <p className="mt-1 text-sm opacity-90">سوبرماركت، صيدليات، ومتاجر قريبة منك</p>
      </header>

      <div className="px-4">
        <div className="relative -mt-6">
          <Search className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="دور على متجر أو منتج"
            className="h-13 rounded-2xl border-none bg-card pe-12 shadow-card"
            aria-label="بحث عن متجر"
          />
        </div>
      </div>

      <OfflineBanner stale={query.isStaleCache} />

      <div className="mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => (s.key === "nearest" ? pickNearest() : setSort(s.key))}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition",
              sort === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          <button
            onClick={() => setTag(null)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              tag === null ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            الكل
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                tag === t ? "border-primary text-primary" : "border-border text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3 px-4">
        {list.map((p) => (
          <Link
            key={p.id}
            to="/stores/$id"
            params={{ id: p.id }}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft transition active:scale-[0.99]"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <StoreIcon className="size-6" />
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
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ما توجد متاجر مطابقة.</p>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
