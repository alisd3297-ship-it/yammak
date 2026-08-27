import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCustomerAreaGuard } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCustomerFlow } from "@/lib/route-guards";
import { BackButton, PageShell  } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { formatIQD } from "@/lib/orders";

export const Route = createFileRoute("/restaurants/$id")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "قائمة المطعم | لبابك" },
      { name: "description", content: "تصفح قائمة المطعم وأضف وجباتك إلى السلة واطلبها من لبابك." },
      { property: "og:title", content: "قائمة المطعم | لبابك" },
      { property: "og:description", content: "وجبات، أسعار، وطلب سريع." },
    ],
  }),
  component: RestaurantPage,
});

function RestaurantPage() {
  useCustomerAreaGuard();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const cart = useCart();

  const { data } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: async () => {
      const [provider, categories, products] = await Promise.all([
        supabase
          .from("providers")
          .select("id, name, description, rating, avg_prep_minutes, is_open, address_text")
          .eq("id", id)
          .eq("kind", "restaurant")
          .eq("is_demo", false)
          .maybeSingle(),
        supabase.from("menu_categories").select("id, name, sort_order").eq("provider_id", id).order("sort_order"),
        supabase
          .from("products")
          .select("id, name, description, price, category_id, is_available")
          .eq("provider_id", id)
          .order("sort_order"),
      ]);
      return {
        provider: provider.data,
        categories: categories.data ?? [],
        products: products.data ?? [],
      };
    },
  });

  const provider = data?.provider;

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/restaurants" label="المطاعم" />
        <h1 className="text-2xl font-black">{provider?.name ?? "..."}</h1>
        <p className="mt-1 text-sm opacity-90">{provider?.description}</p>
        <div className="mt-2 flex items-center gap-4 text-xs opacity-90">
          <span className="flex items-center gap-1">
            <Star className="size-3.5" /> {Number(provider?.rating ?? 0).toFixed(1)}
          </span>
          <span>{provider?.avg_prep_minutes} دقيقة تجهيز</span>
          <span>{provider?.is_open ? "مفتوح الآن" : "مغلق"}</span>
        </div>
      </header>

      <div className="space-y-6 px-4 py-5">
        {(data?.categories ?? []).map((cat) => {
          const items = (data?.products ?? []).filter((p) => p.category_id === cat.id);
          if (!items.length) return null;
          return (
            <section key={cat.id}>
              <h2 className="mb-3 text-base font-bold">{cat.name}</h2>
              <div className="space-y-3">
                {items.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                      <p className="mt-1 text-sm font-bold text-primary">{formatIQD(Number(p.price))}</p>
                    </div>
                    <Button
                      size="icon"
                      className="size-10 rounded-xl"
                      disabled={!p.is_available || !provider?.is_open}
                      onClick={() => {
                        if (!provider) return;
                        cart.add(
                          { id: provider.id, name: provider.name },
                          { productId: p.id, name: p.name, price: Number(p.price) },
                        );
                        toast.success("أضفناها للسلة");
                      }}
                      aria-label="إضافة للسلة"
                    >
                      <Plus className="size-5" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {data && !provider && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            هذا النشاط غير موجود ضمن المطاعم. تفقّده في قسم السوبر ماركت والمتاجر.
          </p>
        )}
        {provider && !data?.products.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            المطعم ما ضاف وجبات بعد.
          </p>
        )}
      </div>

      {cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[34rem] border-t border-border bg-card p-4">
          <Button className="h-12 w-full text-base" onClick={() => navigate({ to: "/checkout" })}>
            إكمال الطلب ({cart.count}) — {formatIQD(cart.total)}
          </Button>
        </div>
      )}
    </PageShell>
  );
}
