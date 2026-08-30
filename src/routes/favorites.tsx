import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Star, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCachedQuery } from "@/lib/offline-cache";
import { BottomNav, BrandHeader, OfflineBanner, PageShell } from "@/components/app-shell";
import { useFavorites } from "@/lib/favorites";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "المفضلة | لبابك" },
      {
        name: "description",
        content: "مطاعمك ومتاجرك المفضلة في لبابك بمكان واحد للوصول السريع وإعادة الطلب.",
      },
      { property: "og:title", content: "المفضلة | لبابك" },
      { property: "og:description", content: "وصول سريع لأماكنك المفضلة في لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FavoritesPage,
});

type Row = {
  id: string;
  name: string;
  description: string | null;
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  kind: string;
};

function href(kind: string): "/restaurants/$id" | "/stores/$id" | "/services/$id" {
  if (kind === "restaurant") return "/restaurants/$id";
  if (kind === "profession") return "/services/$id";
  return "/stores/$id";
}

function FavoritesPage() {
  const { ids, toggle } = useFavorites();
  const q = useCachedQuery(["favorites-providers"], async () => {
    const { data } = await supabase
      .from("providers")
      .select("id, name, description, rating, avg_prep_minutes, is_open, kind")
      .eq("status", "approved");
    return (data ?? []) as Row[];
  });

  const items = (q.data ?? []).filter((p) => ids.includes(p.id));

  return (
    <PageShell>
      <BrandHeader subtitle="المفضلة" />
      <OfflineBanner stale={q.isStaleCache} />
      <section className="mt-4 space-y-3 px-4">
        <h1 className="text-base font-bold">أماكنك المفضلة</h1>
        {items.length ? (
          items.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft"
            >
              <Link
                to={href(p.kind)}
                params={{ id: p.id }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-black text-accent-foreground">
                  {p.name.slice(0, 2)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="size-3.5 fill-brand-amber text-brand-amber" />
                      {Number(p.rating).toFixed(1)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {p.avg_prep_minutes} دقيقة
                    </span>
                    <span className={p.is_open ? "text-success" : "text-destructive"}>
                      {p.is_open ? "مفتوح" : "مغلق"}
                    </span>
                  </span>
                </span>
              </Link>
              <button
                onClick={() => toggle(p.id)}
                aria-label="إزالة من المفضلة"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"
              >
                <Heart className="size-5 fill-destructive text-destructive" />
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ماكو مفضلة بعد — اضغط على القلب في أي مطعم أو متجر ليظهر هنا.
          </p>
        )}
      </section>
      <BottomNav />
    </PageShell>
  );
}
