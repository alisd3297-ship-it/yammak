import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Star, Clock, MapPin, Bell, Wallet, Heart, Bike } from "lucide-react";
import * as Icons from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCachedQuery } from "@/lib/offline-cache";
import { AdminEntry, BottomNav, OfflineBanner, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { normalizeArabic, fuzzyScore } from "@/lib/search";
import { AdsTickerBoard } from "@/components/ads-ticker";
import { useAdsBoard } from "@/routes/ads.index";
import { useRoleHomeRedirect, useCustomerAreaGuard } from "@/lib/auth";
import { useOnboardingRedirect } from "@/lib/service-preferences";
import { useFavorites } from "@/lib/favorites";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/lubabak-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لبابك | كل خدماتك بمكان واحد" },
      {
        name: "description",
        content: "مطاعم، متاجر، صيدليات، تاكسي، مهن وعمال وحرفيين — اطلب من لبابك بسهولة وسرعة.",
      },
      { property: "og:title", content: "لبابك | كل خدماتك بمكان واحد" },
      { property: "og:description", content: "خدماتك وطلباتك لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

type Tone = "primary" | "amber" | "orange" | "green" | "purple" | "blue";

const TONE_TILE: Record<Tone, string> = {
  primary: "bg-accent text-accent-foreground",
  blue: "bg-brand-blue/15 text-brand-blue",
  amber: "bg-brand-amber/25 text-brand-amber-foreground",
  orange: "bg-brand-orange/20 text-brand-orange",
  green: "bg-brand-green/18 text-brand-green",
  purple: "bg-brand-purple/18 text-brand-purple",
};

type MainTo =
  | "/restaurants"
  | "/stores"
  | "/shops"
  | "/services"
  | "/courier"
  | "/taxi"
  | "/doctors"
  | "/pharmacies"
  | "/special-delivery"
  | "/service-requests";

type MainService = { label: string; hint: string; icon: Icons.LucideIcon; to: MainTo; tone: Tone };

/** الخدمات الرئيسية الستة في واجهة الزبون. */
const MAIN_SERVICES: MainService[] = [
  {
    label: "مطاعم",
    hint: "أكل وحلويات",
    icon: Icons.UtensilsCrossed,
    to: "/restaurants",
    tone: "orange",
  },
  { label: "متاجر", hint: "تسوّق يومي", icon: Icons.ShoppingCart, to: "/stores", tone: "blue" },
  { label: "صيدليات", hint: "أدوية ومستلزمات", icon: Icons.Pill, to: "/pharmacies", tone: "green" },
  { label: "تاكسي", hint: "نقل ركاب", icon: Icons.Car, to: "/taxi", tone: "amber" },
  { label: "خدمات ومهن", hint: "فنيين ومهنيين", icon: Icons.Wrench, to: "/services", tone: "purple" },
  {
    label: "عمال وحرفيين",
    hint: "اطلب عامل أو حرفي",
    icon: Icons.HardHat,
    to: "/service-requests",
    tone: "primary",
  },
];

/** خدمات إضافية — محفوظة كاملة بلا حذف أي مسار. */
const EXTRA_SERVICES: MainService[] = [
  { label: "محلات", hint: "تخصصات ومحلات", icon: Icons.Store, to: "/shops", tone: "blue" },
  { label: "طبيب", hint: "استشارات طبية", icon: Icons.Stethoscope, to: "/doctors", tone: "green" },
  { label: "توصيل", hint: "إرسال واستلام", icon: Icons.Bike, to: "/courier", tone: "orange" },
  {
    label: "توصيل خاص",
    hint: "نقاط متعددة",
    icon: Icons.PackageCheck,
    to: "/special-delivery",
    tone: "purple",
  },
];

type QuickLink = { label: string; icon: Icons.LucideIcon; to: QuickTo; highlight?: boolean };

const QUICK_LINKS: QuickLink[] = [
  { label: "اطلب أي شي", icon: Icons.Sparkles, to: "/request-anything", highlight: true },
  { label: "مساعد لبابك", icon: Icons.Bot, to: "/assistant" },
  { label: "قريب منك", icon: Icons.MapPin, to: "/nearby" },
  { label: "خريطة الخدمات", icon: Icons.Map, to: "/map" },
  { label: "سوق لبابك", icon: Icons.ShoppingBag, to: "/marketplace" },
  { label: "عروض الأسعار", icon: Icons.MessagesSquare, to: "/quotes" },
];

function MainTile({ item }: { item: MainService }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="flex h-full flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card p-3 text-center shadow-soft transition hover:shadow-card active:scale-95"
    >
      <span
        className={cn("flex size-12 items-center justify-center rounded-2xl", TONE_TILE[item.tone])}
      >
        <Icon className="size-6" />
      </span>
      <span className="text-xs font-bold leading-tight">{item.label}</span>
      <span className="text-[10px] leading-tight text-muted-foreground">{item.hint}</span>
    </Link>
  );
}

type QuickTo = "/request-anything" | "/assistant" | "/nearby" | "/map" | "/marketplace" | "/quotes";

/**
 * مدخل سريع مدمج: البطاقة تفتح الوجهة الأساسية،
 * ويبقى رابط ثانوي داخلها للوظيفة المدموجة (بدون حذف أي ميزة).
 */
function QuickAction({
  to,
  title,
  hint,
  icon: Icon,
  highlight,
  secondary,
}: {
  to: QuickTo;
  title: string;
  hint: string;
  icon: Icons.LucideIcon;
  highlight?: boolean;
  secondary?: { to: QuickTo; label: string; icon: Icons.LucideIcon };
}) {
  const SecIcon = secondary?.icon;
  return (
    <div
      className={
        highlight
          ? "flex flex-col gap-2 rounded-3xl bg-primary p-3 text-primary-foreground shadow-card"
          : "flex flex-col gap-2 rounded-3xl border border-border/60 bg-card p-3 shadow-soft"
      }
    >
      <Link to={to} className="flex items-center gap-3 transition active:scale-[0.98]">
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
      {secondary && SecIcon ? (
        <Link
          to={secondary.to}
          className={
            highlight
              ? "flex items-center justify-center gap-1.5 rounded-xl bg-primary-foreground/20 px-2 py-1.5 text-[11px] font-bold"
              : "flex items-center justify-center gap-1.5 rounded-xl bg-muted px-2 py-1.5 text-[11px] font-bold text-muted-foreground"
          }
        >
          <SecIcon className="size-3.5" />
          {secondary.label}
        </Link>
      ) : null}
    </div>
  );
}

/** هيدر + هيرو الواجهة الرئيسية بهوية لبابك الزرقاء. */
function HomeHero({ term, setTerm }: { term: string; setTerm: (v: string) => void }) {
  return (
    <header className="hero-gradient rounded-b-[2rem] px-4 pb-10 pt-5 text-primary-foreground shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-primary-foreground/15 px-3 py-2 backdrop-blur">
          <MapPin className="size-4 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[10px] leading-none opacity-80">التوصيل إلى</span>
            <span className="block truncate text-sm font-bold">الحسينية - كربلاء</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/wallet"
            aria-label="المحفظة"
            className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25"
          >
            <Wallet className="size-5" />
          </Link>
          <Link
            to="/notifications"
            aria-label="الإشعارات"
            className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25"
          >
            <Bell className="size-5" />
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <img
          src={logoUrl}
          alt="شعار لبابك"
          width={88}
          height={88}
          className="size-20 shrink-0 rounded-2xl bg-primary-foreground p-2 shadow-card sm:size-[88px]"
        />
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            لبابك
          </h1>
          <p className="mt-1 text-sm/6 opacity-90">كل خدماتك توصل لباب بيتك</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-[11px] font-bold backdrop-blur">
            <Bike className="size-3.5" />
            توصيل سريع داخل الحسينية
          </p>
        </div>
      </div>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="دور على مطعم، خدمة، متجر أو أي شي..."
          className="h-14 rounded-2xl border-none bg-card pe-12 text-base text-foreground shadow-card"
          aria-label="بحث"
        />
      </div>
    </header>
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
      <HomeHero term={term} setTerm={setTerm} />

      <OfflineBanner stale={catalog.isStaleCache} />

      <AdminEntry />

      {results ? (
        <section className="mt-5 space-y-6 px-4">
          <div>
            <h2 className="mb-3 text-base font-bold">الخدمات</h2>
            {results.services.length ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
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
          <section className="mt-4 px-4">
            <div className="ads-glow rounded-3xl p-[2px]">
              <div className="rounded-[22px] bg-card/95 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-black">عروض وخصومات</h2>
                  <Link to="/ads" className="shrink-0 text-xs font-semibold text-primary">
                    أعلن معنا
                  </Link>
                </div>
                <AdsTickerBoard
                  categories={adsBoard.data?.categories ?? []}
                  ads={adsBoard.data?.ads ?? []}
                />
              </div>
            </div>
          </section>

          <section className="mt-5 px-4">
            <h2 className="mb-3 text-base font-bold">الخدمات الرئيسية</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {MAIN_SERVICES.map((s) => (
                <MainTile key={s.to + s.label} item={s} />
              ))}
            </div>
          </section>

          <section className="mt-6 px-4">
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/plus"
                className="rounded-3xl bg-brand-amber p-3 text-brand-amber-foreground shadow-soft transition active:scale-[0.98]"
              >
                <Icons.Crown className="size-5" />
                <p className="mt-2 text-sm font-black">لبابك بلس</p>
                <p className="text-[11px] opacity-90">توصيل مجاني وخصومات</p>
              </Link>
              <Link
                to="/referrals"
                className="rounded-3xl bg-brand-purple p-3 text-brand-purple-foreground shadow-soft transition active:scale-[0.98]"
              >
                <Icons.Gift className="size-5" />
                <p className="mt-2 text-sm font-black">ادعُ صديق</p>
                <p className="text-[11px] opacity-90">رصيد هدية لكما</p>
              </Link>
            </div>
          </section>


          <section className="mt-6 px-4">
            <h2 className="mb-3 text-base font-bold">خدمات إضافية</h2>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-4 sm:gap-3">
              {EXTRA_SERVICES.map((s) => (
                <MainTile key={s.to + s.label} item={s} />
              ))}
            </div>
          </section>

          <section className="mt-6 px-4">
            <h2 className="mb-3 text-base font-bold">مختصرات سريعة</h2>
            <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
              <QuickAction
                to="/request-anything"
                title="اطلب أي شي"
                hint="اكتبه بلغتك ونرتبه إلك"
                icon={Icons.Sparkles}
                highlight
                secondary={{ to: "/assistant", label: "مساعد لبابك", icon: Icons.Bot }}
              />
              <QuickAction
                to="/nearby"
                title="قريب منك"
                hint="عروض ومتاجر قريبة"
                icon={Icons.MapPin}
                secondary={{ to: "/map", label: "خريطة الخدمات", icon: Icons.Map }}
              />
              <QuickAction
                to="/marketplace"
                title="سوق لبابك"
                hint="بيع واشترِ بمنطقتك"
                icon={Icons.ShoppingBag}
              />
              <QuickAction
                to="/quotes"
                title="عروض الأسعار"
                hint="تفاوض على سعر الخدمة"
                icon={Icons.MessagesSquare}
              />
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
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {services.map((s) => (
                    <ServiceTile key={s.id} service={s} />
                  ))}
                </div>
              </section>
            );
          })}

          <section className="mt-6 px-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold">مطاعم مقترحة</h2>
              <Link to="/restaurants" className="shrink-0 text-sm font-semibold text-primary">
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
    <div className="flex h-full flex-col items-center gap-2 rounded-3xl border border-border/60 bg-card p-3 text-center shadow-soft transition active:scale-95">
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
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(provider.id);
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-3 shadow-soft">
      <Link
        to={providerHref(provider.kind)}
        params={{ id: provider.id }}
        className="flex min-w-0 flex-1 items-center gap-3 transition active:scale-[0.99]"
      >
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-lg font-black text-accent-foreground">
          {provider.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{provider.name}</p>
          <p className="truncate text-xs text-muted-foreground">{provider.description}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-brand-amber text-brand-amber" />
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
      <button
        type="button"
        onClick={() => toggle(provider.id)}
        aria-label={fav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
        aria-pressed={fav}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted transition active:scale-95"
      >
        <Heart className={cn("size-5", fav && "fill-destructive text-destructive")} />
      </button>
    </div>
  );
}
