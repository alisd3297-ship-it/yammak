import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Star, Clock } from "lucide-react";
import * as Icons from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCachedQuery } from "@/lib/offline-cache";
import {
  AdminEntry,
  BottomNav,
  BrandHeader,
  OfflineBanner,
  PageShell,
} from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { normalizeArabic, fuzzyScore } from "@/lib/search";
import { AdsTickerBoard } from "@/components/ads-ticker";
import { useAdsBoard } from "@/routes/ads.index";
import { useRoleHomeRedirect, useCustomerAreaGuard } from "@/lib/auth";
import { useOnboardingRedirect } from "@/lib/service-preferences";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لبابك | كل خدماتك بمكان واحد" },
      {
        name: "description",
        content: "مطاعم، متاجر، مندوب، توصيل خاص، تكسي ومهن وخدمات — اطلب من لبابك بسهولة وسرعة.",
      },
      { property: "og:title", content: "لبابك | كل خدماتك بمكان واحد" },
      { property: "og:description", content: "خدماتك وطلباتك لبابك." },
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
  kind: string;
};

type MainService = {
  label: string;
  hint: string;
  icon: Icons.LucideIcon;
  to:
    | "/restaurants"
    | "/stores"
    | "/shops"
    | "/services"
    | "/courier"
    | "/taxi"
    | "/doctors"
    | "/pharmacies";
};

/** لوحة الخدمات الأساسية للزبون — كل بلاطة تفتح صفحتها المخصصة. */
const MAIN_SERVICES: MainService[] = [
  { label: "مطاعم", hint: "أكل وحلويات", icon: Icons.UtensilsCrossed, to: "/restaurants" },
  { label: "سوبر ماركت", hint: "تسوّق يومي", icon: Icons.ShoppingCart, to: "/stores" },
  { label: "محلات", hint: "تخصصات ومحلات", icon: Icons.Store, to: "/shops" },
  { label: "مهن وخدمات", hint: "فنيين ومهنيين", icon: Icons.Wrench, to: "/services" },
  { label: "توصيل", hint: "إرسال واستلام", icon: Icons.Bike, to: "/courier" },
  { label: "تكسي", hint: "نقل ركاب", icon: Icons.Car, to: "/taxi" },
  { label: "طبيب", hint: "استشارات طبية", icon: Icons.Stethoscope, to: "/doctors" },
  { label: "صيدلية", hint: "أدوية ومستلزمات", icon: Icons.Pill, to: "/pharmacies" },
];

function MainTile({ item }: { item: MainService }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="flex h-full flex-col items-center gap-1.5 rounded-2xl bg-card p-3 text-center shadow-soft transition active:scale-95"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-6" />
      </span>
      <span className="text-xs font-bold leading-tight">{item.label}</span>
      <span className="text-[10px] leading-tight text-muted-foreground">{item.hint}</span>
    </Link>
  );
}

/** مدخل سريع للميزات الجديدة (طلب حر، مساعد، قريب منك، الخريطة). */
function QuickAction({
  to,
  title,
  hint,
  icon: Icon,
  highlight,
}: {
  to: "/request-anything" | "/assistant" | "/nearby" | "/map";
  title: string;
  hint: string;
  icon: Icons.LucideIcon;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className={
        highlight
          ? "flex items-center gap-3 rounded-2xl bg-primary p-3 text-primary-foreground shadow-card transition active:scale-[0.98]"
          : "flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft transition active:scale-[0.98]"
      }
    >
      <span
        className={
          highlight
            ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/20"
            : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground"
        }
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span
          className={
            highlight
              ? "block truncate text-[11px] opacity-90"
              : "block truncate text-[11px] text-muted-foreground"
          }
        >
          {hint}
        </span>
      </span>
    </Link>
  );
}



function CustomerHome() {
  useCustomerAreaGuard();
  useRoleHomeRedirect();
  // زبون جديد لم يختر خدماته بعد: نعرض له شاشة الترحيب أولاً
  useOnboardingRedirect();
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
        .select(
          "id, name, description, rating, orders_count, avg_prep_minutes, is_open, keywords, kind",
        )
        .eq("status", "approved")
        .eq("is_demo", false),
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
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            to="/request-anything"
            title="اطلب أي شي"
            hint="اكتبه بلغتك ونرتبه إلك"
            icon={Icons.Sparkles}
            highlight
          />
          <QuickAction
            to="/assistant"
            title="مساعد لبابك"
            hint="دلّني على المنتج"
            icon={Icons.Bot}
          />
          <QuickAction to="/nearby" title="قريب منك" hint="عروض ومتاجر" icon={Icons.MapPin} />
          <QuickAction to="/map" title="خريطة الخدمات" hint="شوف الأقرب" icon={Icons.Map} />
        </div>
      </section>

      <section className="mt-4 px-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">إعلانات</h2>
          <Link to="/ads" className="text-sm font-semibold text-primary">
            أعلن معنا
          </Link>
        </div>
        <AdsTickerBoard
          categories={adsBoard.data?.categories ?? []}
          ads={adsBoard.data?.ads ?? []}
        />
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
            <h2 className="mb-3 text-base font-bold">المطاعم والمتاجر ومقدمو الخدمة</h2>
            {results.providers.length ? (
              <div className="space-y-3">
                {results.providers.map((p) => (
                  <ProviderCard key={p.id} provider={p} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ما لكينا نتيجة بهذا الاسم.</p>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="mt-6 px-4">
            <h2 className="mb-3 text-base font-bold">خدماتك وطلباتك لبابك</h2>
            <div className="grid grid-cols-3 gap-3">
              {MAIN_SERVICES.map((s) => (
                <MainTile key={s.to + s.label} item={s} />
              ))}
            </div>
          </section>

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
  const Icon =
    (Icons as unknown as Record<string, Icons.LucideIcon>)[service.icon] ?? Icons.Sparkles;
  const to = service.route_path ?? "/";
  const content = (
    <div className="flex h-full flex-col items-center gap-2 rounded-2xl bg-card p-3 text-center shadow-soft transition active:scale-95">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-6" />
      </span>
      <span className="text-xs font-semibold leading-tight">{service.name}</span>
    </div>
  );
  const KNOWN = [
    "/restaurants",
    "/stores",
    "/services",
    "/courier",
    "/special-delivery",
    "/taxi",
    "/ads",
  ] as const;
  if ((KNOWN as readonly string[]).includes(to)) {
    return <Link to={to as (typeof KNOWN)[number]}>{content}</Link>;
  }

  return (
    <div title="هذه الخدمة قيد الإطلاق ضمن المراحل القادمة" className="opacity-70">
      {content}
    </div>
  );
}

/** وجهة البطاقة حسب نوع مقدم الخدمة حتى لا يفتح البحث الصفحة الخطأ. */
function providerHref(kind: string): "/restaurants/$id" | "/stores/$id" | "/services/$id" {
  if (kind === "restaurant") return "/restaurants/$id";
  if (kind === "profession") return "/services/$id";
  return "/stores/$id";
}

function ProviderCard({ provider }: { provider: ProviderRow }) {
  return (
    <Link
      to={providerHref(provider.kind)}
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
