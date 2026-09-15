import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Facebook, Instagram, MapPin, Scissors, Search, Star, Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAreaGuard } from "@/lib/auth";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useCachedQuery } from "@/lib/offline-cache";
import { BackButton, BottomNav, OfflineBanner, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { fuzzyScore } from "@/lib/search";
import { isSalonProvider } from "@/lib/salons";

export const Route = createFileRoute("/salons")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "صالونات وكوزمتك | لبابك" },
      { name: "description", content: "صالونات التجميل والكوزمتك وخدماتها وحساباتها الرسمية في لبابك." },
      { property: "og:title", content: "صالونات وكوزمتك | لبابك" },
      { property: "og:description", content: "اعثر على الصالون المناسب وشاهد العنوان والخدمات وروابط التواصل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalonsPage,
});

type SocialLinkProps = {
  href: string | null;
  label: string;
  icon: typeof Instagram;
};

function SocialLink({ href, label, icon: Icon }: SocialLinkProps) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground transition active:scale-90"
      onClick={(event) => event.stopPropagation()}
    >
      <Icon className="size-4" />
    </a>
  );
}

function SalonsPage() {
  useCustomerAreaGuard();
  const [term, setTerm] = useState("");
  const query = useCachedQuery(["salon-providers"], async () => {
    const { data } = await supabase
      .from("providers")
      .select("id, name, description, rating, ratings_count, is_open, keywords, address_text, logo_url, instagram_url, facebook_url, tiktok_url, provider_services(name, is_active)")
      .eq("status", "approved")
      .eq("is_demo", false)
      .order("rating", { ascending: false })
      .limit(300);
    return (data ?? []).filter(isSalonProvider);
  });

  const salons = useMemo(() => {
    const rows = query.data ?? [];
    if (!term.trim()) return rows;
    return rows.filter((salon) =>
      fuzzyScore(term, [
        salon.name,
        salon.description ?? "",
        salon.address_text ?? "",
        ...((salon.provider_services as { name: string }[] | null) ?? []).map((service) => service.name),
      ]) > 0,
    );
  }, [query.data, term]);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" label="الرئيسية" />
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-foreground/15">
            <Scissors className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-black">صالونات وكوزمتك</h1>
            <p className="mt-1 text-sm opacity-90">تجميل، عناية ومنتجات كوزمتك</p>
          </div>
        </div>
      </header>

      <div className="px-4">
        <div className="relative -mt-6">
          <Search className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="دور على صالون أو خدمة" className="h-13 rounded-2xl border-none bg-card pe-12 shadow-card" aria-label="بحث في الصالونات" />
        </div>
      </div>

      <OfflineBanner stale={query.isStaleCache} />
      <div className="mt-4 space-y-3 px-4">
        {salons.map((salon) => {
          const services = ((salon.provider_services as { name: string; is_active: boolean }[] | null) ?? []).filter((service) => service.is_active);
          return (
            <article key={salon.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <Link to="/services/$id" params={{ id: salon.id }} className="flex items-start gap-3">
                {salon.logo_url ? (
                  <img src={salon.logo_url} alt={`شعار ${salon.name}`} className="size-14 shrink-0 rounded-xl object-cover" loading="lazy" />
                ) : (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-purple/18 text-brand-purple"><Scissors className="size-6" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate font-bold">{salon.name}</h2>
                    <span className={salon.is_open ? "text-xs text-success" : "text-xs text-destructive"}>{salon.is_open ? "مفتوح" : "مغلق"}</span>
                  </div>
                  {salon.address_text && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{salon.address_text}</span></p>}
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3.5 fill-warning text-warning" />{Number(salon.rating).toFixed(1)} ({salon.ratings_count})</p>
                </div>
              </Link>
              <div className="mt-3 border-t border-border/60 pt-3">
                <p className="text-xs font-bold">الخدمات</p>
                <p className="mt-1 text-xs text-muted-foreground">{services.length ? services.slice(0, 5).map((service) => service.name).join(" • ") : "لم تُضف الخدمات بعد"}</p>
              </div>
              {(salon.instagram_url || salon.facebook_url || salon.tiktok_url) && (
                <div className="mt-3 flex items-center gap-2" aria-label="مواقع التواصل">
                  <SocialLink href={salon.instagram_url} label={`إنستغرام ${salon.name}`} icon={Instagram} />
                  <SocialLink href={salon.facebook_url} label={`فيسبوك ${salon.name}`} icon={Facebook} />
                  <SocialLink href={salon.tiktok_url} label={`تيك توك ${salon.name}`} icon={Music2} />
                </div>
              )}
            </article>
          );
        })}
        {!salons.length && <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو صالونات أو محلات كوزمتك مسجلة حالياً.</p>}
      </div>
      <BottomNav />
    </PageShell>
  );
}