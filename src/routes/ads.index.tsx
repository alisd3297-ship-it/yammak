import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Megaphone, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BackButton, BottomNav, PageShell, StatusDot  } from "@/components/app-shell";
import { AdsTickerBoard } from "@/components/ads-ticker";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/auth";
import { AD_STATUS_LABEL, AD_STATUS_TONE, IRAQ_GOVERNORATES, formatAdPrice, type AdCategory, type AdRow } from "@/lib/ads";
import { OPERATING_LOCATION } from "@/lib/location";
import { AdImage } from "@/components/ad-image";
import { AdDetailsDialog } from "@/components/ad-details-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ads/")({
  head: () => ({
    meta: [
      { title: "أعلن معنا | لبابك" },
      {
        name: "description",
        content: "إعلانات مبوبة داخل لبابك: عقارات، سيارات، وظائف، إلكترونيات وأثاث — انشر إعلانك ووصل لزبائنك.",
      },
      { property: "og:title", content: "أعلن معنا | لبابك" },
      { property: "og:description", content: "قسم الإعلانات في لبابك — انشر إعلانك بعد مراجعة الإدارة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdsPage,
});

export function useAdsBoard() {
  return useQuery({
    queryKey: ["ads-board"],
    queryFn: async () => {
      const [categories, ads] = await Promise.all([
        supabase.from("ad_categories").select("id, name, icon, color, sort_order").eq("is_active", true).order("sort_order"),
        supabase
          .from("ads")
          .select("id, category_id, title, body, price, currency, governorate, contact_phone, address_text, images, status, sort_order, published_at, expires_at, created_at")
          .eq("status", "published")
          .eq("is_demo", false)
          .order("sort_order")
          .order("published_at", { ascending: false }),
      ]);
      return {
        categories: (categories.data ?? []) as AdCategory[],
        ads: (ads.data ?? []) as AdRow[],
      };
    },
    staleTime: 60_000,
  });
}

function AdsPage() {
  const { data: account } = useAccount();
  const { data } = useAdsBoard();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [governorate, setGovernorate] = useState<string | null>(OPERATING_LOCATION.governorate);
  const [selectedAd, setSelectedAd] = useState<AdRow | null>(null);

  const mine = useQuery({
    queryKey: ["my-ads", account?.userId],
    enabled: !!account?.userId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("ads")
        .select("id, category_id, title, price, currency, governorate, images, status, rejection_reason, created_at, expires_at")
        .eq("owner_id", account!.userId!)
        .order("created_at", { ascending: false });
      return rows ?? [];
    },
  });

  const categories = data?.categories ?? [];
  const ads = data?.ads ?? [];
  const filtered = useMemo(
    () =>
      ads.filter(
        (ad) =>
          (!categoryId || ad.category_id === categoryId) &&
          (!governorate || ad.governorate === governorate),
      ),
    [ads, categoryId, governorate],
  );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-6 text-primary-foreground shadow-card">
        <BackButton fallback="/" />
        <div className="flex items-center gap-3">
          <Link to="/" aria-label="رجوع" className="rounded-full bg-white/15 p-2">
            <ArrowRight className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black">أعلن معنا</h1>
            <p className="text-sm opacity-90">إعلانات مبوبة معتمدة من الإدارة</p>
          </div>
          <Megaphone className="size-7 opacity-90" />
        </div>
      </header>

      <div className="space-y-4 p-4">
        <Button asChild className="h-12 w-full text-base font-bold">
          <Link to="/ads/new">
            <Plus className="size-5" /> انشر إعلانك الآن
          </Link>
        </Button>

        <AdsTickerBoard categories={categories} ads={ads} />

        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={categoryId === null} onClick={() => setCategoryId(null)}>
            الكل
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </FilterChip>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={governorate === null} onClick={() => setGovernorate(null)}>
            كل المحافظات
          </FilterChip>
          {IRAQ_GOVERNORATES.map((name) => (
            <FilterChip key={name} active={governorate === name} onClick={() => setGovernorate(name)}>
              {name}
            </FilterChip>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="rounded-2xl bg-card p-5 text-center text-sm text-muted-foreground shadow-soft">
              ما توجد إعلانات منشورة في هذا القسم حالياً.
            </p>
          ) : (
            filtered.map((ad) => (
              <button
                key={ad.id}
                type="button"
                onClick={() => setSelectedAd(ad)}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-start shadow-soft transition active:scale-[0.99]"
              >
                <AdImage path={ad.images[0]} alt={ad.title} className="size-16 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{ad.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ad.governorate ? `${ad.governorate} — ` : ""}
                    {ad.address_text}
                  </p>
                  <p className="mt-1 text-sm font-bold text-primary">{formatAdPrice(ad.price, ad.currency)}</p>
                </div>
              </button>
            ))
          )}
        </div>

        {account?.userId ? (
          <section className="space-y-2">
            <h2 className="text-base font-bold">إعلاناتي</h2>
            {(mine.data ?? []).length === 0 ? (
              <p className="rounded-2xl bg-card p-4 text-center text-sm text-muted-foreground shadow-soft">
                ما عندك إعلانات بعد.
              </p>
            ) : (
              (mine.data ?? []).map((ad) => (
                <div key={ad.id} className="rounded-2xl bg-card p-3 shadow-soft">
                  <div className="flex items-center gap-2">
                    <StatusDot tone={AD_STATUS_TONE[ad.status]} />
                    <span className="text-xs font-bold">{AD_STATUS_LABEL[ad.status]}</span>
                    <span className="ms-auto text-xs text-muted-foreground">{formatAdPrice(ad.price, ad.currency)}</span>
                  </div>
                  <p className="mt-1 font-bold">{ad.title}</p>
                  {ad.rejection_reason ? (
                    <p className="mt-1 text-xs text-destructive">سبب الرفض: {ad.rejection_reason}</p>
                  ) : null}
                </div>
              ))
            )}
          </section>
        ) : null}
      </div>

      <AdDetailsDialog
        ad={selectedAd}
        categories={categories}
        open={selectedAd !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAd(null);
        }}
      />

      <BottomNav />
    </PageShell>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition",
        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground shadow-soft",
      )}
    >
      {children}
    </button>
  );
}
