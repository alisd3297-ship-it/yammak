import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MapPin, RefreshCcw } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { useUserLocation, osmEmbedUrl, formatKm, directionsUrl } from "@/lib/geo";
import { useNearby, providerRoute } from "@/lib/nearby";
import { useCustomerAreaGuard } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/map")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "خريطة الخدمات | لبابك" },
      {
        name: "description",
        content: "شاهد المطاعم والمتاجر ومقدمي الخدمة على الخريطة واحصل على الاتجاهات فوراً.",
      },
      { property: "og:title", content: "خريطة الخدمات | لبابك" },
      { property: "og:description", content: "خريطة مقدمي الخدمة القريبين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicesMapPage,
});

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "restaurant", label: "مطاعم" },
  { key: "store", label: "متاجر" },
  { key: "profession", label: "مهن" },
] as const;

function ServicesMapPage() {
  useCustomerAreaGuard();
  const geo = useUserLocation();
  const nearby = useNearby(geo.point, 25);
  const [kind, setKind] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [focusId, setFocusId] = useState<string | null>(null);

  const points = useMemo(
    () =>
      nearby.providers.filter(
        (p) => p.lat != null && p.lng != null && (kind === "all" || p.kind === kind),
      ),
    [nearby.providers, kind],
  );

  const focus = points.find((p) => p.id === focusId) ?? null;
  const center =
    focus?.lat != null && focus.lng != null ? { lat: focus.lat, lng: focus.lng } : geo.point;

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" />
        <h1 className="text-2xl font-black">خريطة الخدمات</h1>
        <p className="mt-1 flex items-center gap-2 text-sm opacity-90">
          <MapPin className="size-4" /> {geo.label}
        </p>
        {!geo.precise && (
          <Button
            variant="secondary"
            className="mt-3 h-9 rounded-full px-4 text-xs"
            onClick={geo.retry}
          >
            <RefreshCcw className="me-1 size-3.5" /> تفعيل موقعي
          </Button>
        )}
      </header>

      <div className="space-y-4 px-4 py-5">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setKind(f.key)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-xs font-bold",
                kind === f.key ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border">
          <iframe
            title="خريطة الخدمات"
            src={osmEmbedUrl(center, focus ? 0.008 : 0.03)}
            className="h-64 w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {focus ? `المعروض: ${focus.name}` : "اختر مقدم خدمة من القائمة لعرض موقعه على الخريطة."}
        </p>

        <div className="space-y-3">
          {points.slice(0, 40).map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-2xl bg-card p-3 shadow-soft",
                focusId === p.id && "ring-2 ring-primary",
              )}
            >
              <button type="button" className="w-full text-start" onClick={() => setFocusId(p.id)}>
                <p className="font-bold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatKm(p.km)} · {p.isOpen ? "مفتوح" : "مغلق"}
                </p>
              </button>
              <div className="mt-2 flex gap-4 text-xs font-semibold">
                <Link to={providerRoute(p.kind)} params={{ id: p.id }} className="text-primary">
                  فتح الصفحة
                </Link>
                {p.lat != null && p.lng != null && (
                  <a
                    href={directionsUrl({ lat: p.lat, lng: p.lng }, geo.precise ? geo.point : null)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary"
                  >
                    الاتجاهات
                  </a>
                )}
              </div>
            </div>
          ))}
          {!points.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              {nearby.isPending ? "جاري التحميل…" : "ما توجد مواقع مسجلة ضمن هذا التصنيف."}
            </p>
          )}
        </div>
      </div>

      <BottomNav />
    </PageShell>
  );
}
