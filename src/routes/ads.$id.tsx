import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AD_STATUS_LABEL, AD_STATUS_TONE, adImageUrl, formatAdPrice, type AdRow } from "@/lib/ads";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ads/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الإعلان | يمّك" },
      { name: "description", content: "تفاصيل الإعلان: الصور، السعر، العنوان، والاتصال المباشر بصاحب الإعلان." },
      { property: "og:title", content: "تفاصيل الإعلان | يمّك" },
      { property: "og:description", content: "شاهد تفاصيل الإعلان واتصل مباشرة بصاحبه عبر يمّك." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdDetailPage,
});

function AdDetailPage() {
  const { id } = Route.useParams();
  const [active, setActive] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["ad", id],
    queryFn: async () => {
      const { data: ad } = await supabase
        .from("ads")
        .select(
          "id, category_id, title, body, price, contact_phone, address_text, images, status, sort_order, published_at, expires_at, created_at, ad_categories(name)",
        )
        .eq("id", id)
        .maybeSingle();
      return ad as (AdRow & { ad_categories: { name: string } | null }) | null;
    },
  });

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-6 text-primary-foreground shadow-card">
        <div className="flex items-center gap-3">
          <Link to="/ads" aria-label="رجوع" className="rounded-full bg-white/15 p-2">
            <ArrowRight className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-xl font-black">{data?.title ?? "تفاصيل الإعلان"}</h1>
        </div>
      </header>

      <div className="space-y-4 p-4">
        {isLoading ? (
          <p className="rounded-2xl bg-card p-5 text-center text-sm text-muted-foreground shadow-soft">جاري التحميل…</p>
        ) : !data ? (
          <p className="rounded-2xl bg-card p-5 text-center text-sm text-muted-foreground shadow-soft">
            الإعلان غير متاح أو تمت إزالته.
          </p>
        ) : (
          <>
            {data.images.length > 0 ? (
              <div className="space-y-2">
                <img
                  src={adImageUrl(data.images[active] ?? data.images[0]!)}
                  alt={data.title}
                  className="aspect-[4/3] w-full rounded-2xl object-cover shadow-card"
                />
                {data.images.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto">
                    {data.images.map((path, index) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setActive(index)}
                        aria-label={`صورة ${index + 1}`}
                        className={cn(
                          "size-16 shrink-0 overflow-hidden rounded-xl border-2",
                          index === active ? "border-primary" : "border-transparent",
                        )}
                      >
                        <img src={adImageUrl(path)} alt="" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2 rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center gap-2">
                <StatusDot tone={AD_STATUS_TONE[data.status]} />
                <span className="text-xs font-bold">{AD_STATUS_LABEL[data.status]}</span>
                {data.ad_categories?.name ? (
                  <span className="ms-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">
                    {data.ad_categories.name}
                  </span>
                ) : null}
              </div>
              <h2 className="text-lg font-black">{data.title}</h2>
              <p className="text-xl font-black text-primary">{formatAdPrice(data.price)}</p>
              <p className="whitespace-pre-line text-sm leading-6 text-foreground/90">{data.body}</p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" /> {data.address_text}
              </p>
            </div>

            <Button asChild className="h-12 w-full text-base font-bold">
              <a href={`tel:${data.contact_phone}`}>
                <Phone className="size-5" /> اتصل الآن — {data.contact_phone}
              </a>
            </Button>
          </>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
