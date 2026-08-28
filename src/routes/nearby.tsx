import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Percent, Star, RefreshCcw } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { useUserLocation, formatKm, directionsUrl } from "@/lib/geo";
import { useNearby, providerRoute } from "@/lib/nearby";
import { useCustomerAreaGuard } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/nearby")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "قريب منك | لبابك" },
      {
        name: "description",
        content: "اكتشف العروض والمتاجر والمطاعم الأقرب لموقعك الحالي في لبابك.",
      },
      { property: "og:title", content: "قريب منك | لبابك" },
      { property: "og:description", content: "عروض ومتاجر قريبة من موقعك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NearbyPage,
});

function NearbyPage() {
  useCustomerAreaGuard();
  const geo = useUserLocation();
  const nearby = useNearby(geo.point);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" />
        <h1 className="text-2xl font-black">قريب منك</h1>
        <p className="mt-1 flex items-center gap-2 text-sm opacity-90">
          <MapPin className="size-4" /> {geo.label}
        </p>
        {!geo.precise && (
          <Button
            variant="secondary"
            className="mt-3 h-9 rounded-full px-4 text-xs"
            onClick={geo.retry}
          >
            <RefreshCcw className="me-1 size-3.5" /> تفعيل موقعي الدقيق
          </Button>
        )}
      </header>

      <div className="space-y-6 px-4 py-5">
        <section>
          <h2 className="mb-3 text-base font-bold">عروض قريبة</h2>
          {nearby.nearPromotions.length ? (
            <div className="space-y-3">
              {nearby.nearPromotions.map((p) => (
                <Link
                  key={p.id}
                  to={providerRoute(p.providerKind)}
                  params={{ id: p.providerId }}
                  className="block rounded-2xl bg-card p-4 shadow-soft transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{p.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.providerName}</p>
                      {p.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success">
                      <Percent className="size-3" />
                      {p.discountPercent}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{formatKm(p.km)} من موقعك</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              ما توجد عروض قريبة حالياً.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-base font-bold">الأقرب إليك</h2>
          {nearby.nearProviders.length ? (
            <div className="space-y-3">
              {nearby.nearProviders.slice(0, 25).map((p) => (
                <div key={p.id} className="rounded-2xl bg-card p-3 shadow-soft">
                  <Link
                    to={providerRoute(p.kind)}
                    params={{ id: p.id }}
                    className="flex items-center gap-3"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-base font-black text-secondary-foreground">
                      {p.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{p.name}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="size-3.5 fill-warning text-warning" />
                          {p.rating.toFixed(1)}
                        </span>
                        <span>{formatKm(p.km)}</span>
                        <span className={p.isOpen ? "text-success" : "text-destructive"}>
                          {p.isOpen ? "مفتوح" : "مغلق"}
                        </span>
                      </div>
                    </div>
                  </Link>
                  {p.lat != null && p.lng != null && (
                    <a
                      className="mt-2 inline-block text-xs font-semibold text-primary"
                      href={directionsUrl(
                        { lat: p.lat, lng: p.lng },
                        geo.precise ? geo.point : null,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      الاتجاهات على الخريطة
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              {nearby.isPending ? "جاري التحميل…" : "ما لكينا متاجر قريبة."}
            </p>
          )}
        </section>
      </div>

      <BottomNav />
    </PageShell>
  );
}
