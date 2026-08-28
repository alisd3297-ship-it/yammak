import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Store, Phone, Plus } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatIQD } from "@/lib/orders";
import { listPublishedListings } from "@/lib/marketplace.functions";

export const Route = createFileRoute("/marketplace/")({
  head: () => ({
    meta: [
      { title: "سوق لبابك | بيع واشترِ محلياً" },
      {
        name: "description",
        content: "سوق لبابك: إعلانات بيع وشراء من أهل المنطقة، أسعار واضحة وتواصل مباشر مع البائع.",
      },
      { property: "og:title", content: "سوق لبابك | بيع واشترِ محلياً" },
      { property: "og:description", content: "إعلانات محلية موثوقة بمكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => listPublishedListings(),
  errorComponent: () => (
    <PageShell>
      <p className="p-6 text-sm text-muted-foreground">تعذر تحميل السوق، جرّب مرة ثانية.</p>
    </PageShell>
  ),
  notFoundComponent: () => (
    <PageShell>
      <p className="p-6 text-sm text-muted-foreground">الصفحة غير موجودة.</p>
    </PageShell>
  ),
  component: MarketplacePage,
});

function MarketplacePage() {
  const initial = Route.useLoaderData();
  const listFn = useServerFn(listPublishedListings);
  const { data: listings } = useQuery({
    queryKey: ["marketplace-listings"],
    queryFn: () => listFn(),
    initialData: initial,
    staleTime: 60_000,
  });

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Store className="size-6" /> سوق لبابك
        </h1>
        <p className="mt-1 text-sm opacity-90">إعلانات بيع وشراء من أهل منطقتك</p>
      </header>

      <div className="space-y-4 px-4 py-5">
        <Link to="/marketplace/new">
          <Button className="h-12 w-full">
            <Plus className="me-1 size-4" /> أضف إعلان بيع
          </Button>
        </Link>

        <div className="grid gap-3">
          {(listings ?? []).map((l) => (
            <article key={l.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold">{l.title}</h2>
                {l.price != null && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    {l.currency === "USD" ? `$${l.price}` : formatIQD(l.price)}
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {l.description}
              </p>
              <a
                href={`tel:${l.contactPhone}`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary"
              >
                <Phone className="size-4" /> {l.contactPhone}
              </a>
            </article>
          ))}
          {!listings?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              ماكو إعلانات منشورة حالياً.
            </p>
          )}
        </div>
      </div>

      <BottomNav />
    </PageShell>
  );
}
