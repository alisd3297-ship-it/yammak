import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Star, Clock } from "lucide-react";
import * as Icons from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCachedQuery } from "@/lib/offline-cache";
import { AdminEntry, BottomNav, BrandHeader, OfflineBanner, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { normalizeArabic, fuzzyScore } from "@/lib/search";
import { AdsTickerBoard } from "@/components/ads-ticker";
import { useAdsBoard } from "@/routes/ads.index";
import { useRoleHomeRedirect } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "يمّك | كل خدماتك بمكان واحد" },
      {
        name: "description",
        content: "مطاعم، متاجر، مندوب، توصيل خاص، تكسي ومهن وخدمات — اطلب من يمّك بسهولة وسرعة.",
      },
      { property: "og:title", content: "يمّك | كل خدماتك بمكان واحد" },
      { property: "og:description", content: "ويّانه كلشي صار يمّك." },
    ],
  }),
  component: CustomerHome,
});

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  route_path: string | null;
  sort_order: number;
  section_id: string | null;
  placement: string[];
};
type SectionRow = { id: string; name: string; sort_order: number };
type ProviderRow = {
  id: string;
  name: string;
  description: string | null;
  rating: number;
  orders_count: number;
  avg_prep_minutes: number;
  is_open: boolean;
  keywords: string[];
};

function CustomerHome() {
  useRoleHomeRedirect();
  const [term, setTerm] = useState("");
  const adsBoard = useAdsBoard();

  const catalog = useCachedQuery(["home-catalog"], async () => {
    const [sections, services, providers] = await Promise.all([
      supabase
        .from("service_sections")
        .select("id, name, sort_order")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("services")
        .select("id, name, description, icon, route_path, sort_order, section_id, placement")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order"),

      supabase
        .from("providers")
        .select("id, name, description, rating, orders_count, avg_prep_minutes, is_open, keywords")
        .eq("status", "approved")
        .eq("kind", "restaurant"),
    ]);
    return {
      sections: (sections.data ?? []) as SectionRow[],
      services: (services.data ?? []) as ServiceRow[],
      providers: (providers.data ?? []) as ProviderRow[],
    };
  });

  const data = catalog.data;
  const query = normalizeArabic(term);

  const results = useMemo(() => {
    if (!query || !data) return null;
    const services = data.services
      .map((s) => ({ item: s, score: fuzzyScore(query, [s.name, s.description ?? ""]) }))
      .filter((r) => r.score > 0);
    const providers = data.providers
      .map((p) => ({
        item: p,
        score: fuzzyScore(query, [p.name, p.description ?? "", ...(p.keywords ?? [])]),
      }))
      .filter((r) => r.score > 0);
    return {
      services: services.sort((a, b) => b.score - a.score).map((r) => r.item),
      providers: providers.sort((a, b) => b.score - a.score).map((r) => r.item),
    };
  }, [query, data]);

  return (
    <PageShell>
      <BrandHeader />
      <div className="px-4">
        <div className="relative -mt-6">
          <Search className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="شتحتاج اليوم؟"
            className="h-14 rounded-2xl border-none bg-card pe-12 text-base shadow-card"
            aria-label="بحث"
          />
        </div>
      </div>

      <OfflineBanner stale={catalog.isStaleCache} />

      <AdminEntry />

      <section className="mt-4 px-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">إعلانات</h2>
          <Link to="/ads" className="text-sm font-semibold text-primary">
            أعلن معنا
          </Link>
        </div>
        <AdsTickerBoard categories={adsBoard.data?.categories ?? []} ads={adsBoard.data?.ads ?? []} />
      </section>

      {results ? (
        <section className="mt-6 space-y-6 px-4">
          <div>
            <h2 className="mb-3 text-base font-bold">الخدمات</h2>
            {results.services.length ? (
              <div className="grid grid-cols-3 gap-3">
                {results.services.map((s) => (
                  <ServiceTile key={s.id} service={s} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ما لكينا خدمة بهذا الاسم.</p>
            )}
          </div>
          <div>
            <h2 className="mb-3 text-base font-bold">المطاعم</h2>
            {results.providers.length ? (
              <div className="space-y-3">
                {results.providers.map((p) => (
                  <ProviderCard key={p.id} provider={p} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ما لكينا مطعم بهذا الاسم.</p>
            )}
          </div>
        </section>
      ) : (
        <>
          {(data?.sections ?? []).map((section) => {
            const services = (data?.services ?? []).filter(
              (s) => s.section_id === section.id && s.placement.includes("home"),
            );
            if (!services.length) return null;
            return (
              <section key={section.id} className="mt-6 px-4">
                <h2 className="mb-3 text-base font-bold">{section.name}</h2>
                <div className="grid grid-cols-3 gap-3">
                  {services.map((s) => (
                    <ServiceTile key={s.id} service={s} />
                  ))}
                </div>
              </section>
            );
          })}

          <section className="mt-8 px-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">مطاعم مقترحة</h2>
              <Link to="/restaurants" className="text-sm font-semibold text-primary">
                عرض الكل
              </Link>
            </div>
            <div className="space-y-3">
              {(data?.providers ?? []).slice(0, 4).map((p) => (
                <ProviderCard key={p.id} provider={p} />
              ))}
              {!data?.providers.length && (
                <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                  ما توجد مطاعم مفعّلة بعد. تقدر الإدارة تفعّل المطاعم من لوحة التحكم.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      <BottomNav />
    </PageShell>
  );
}

function ServiceTile({ service }: { service: ServiceRow }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[service.icon] ?? Icons.Sparkles;
  const to = service.route_path ?? "/";
  const content = (
    <div className="flex h-full flex-col items-center gap-2 rounded-2xl bg-card p-3 text-center shadow-soft transition active:scale-95">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-6" />
      </span>
      <span className="text-xs font-semibold leading-tight">{service.name}</span>
    </div>
  );
  const KNOWN = ["/restaurants", "/stores", "/services", "/courier", "/special-delivery", "/taxi", "/ads"] as const;
  if ((KNOWN as readonly string[]).includes(to)) {
    return <Link to={to as (typeof KNOWN)[number]}>{content}</Link>;
  }

  return (
    <div title="هذه الخدمة قيد الإطلاق ضمن المراحل القادمة" className="opacity-70">
      {content}
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderRow }) {
  return (
    <Link
      to="/restaurants/$id"
      params={{ id: provider.id }}
      className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft transition active:scale-[0.99]"
    >
      <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg font-black text-secondary-foreground">
        {provider.name.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{provider.name}</p>
        <p className="truncate text-xs text-muted-foreground">{provider.description}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Star className="size-3.5 fill-warning text-warning" />
            {Number(provider.rating).toFixed(1)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {provider.avg_prep_minutes} دقيقة
          </span>
          <span className={provider.is_open ? "text-success" : "text-destructive"}>
            {provider.is_open ? "مفتوح" : "مغلق"}
          </span>
        </div>
      </div>
    </Link>
  );
}
