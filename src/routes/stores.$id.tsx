import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCustomerAreaGuard } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Star, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCustomerFlow } from "@/lib/route-guards";
import { BackButton, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { CustomerTabPanel } from "@/components/customer-tab-panel";
import { ProductImage } from "@/components/product-image";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart";
import { formatIQD } from "@/lib/orders";

export const Route = createFileRoute("/stores/$id")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "منتجات المتجر | لبابك" },
      {
        name: "description",
        content: "تصفح منتجات المتجر وأسعارها وتوفرها وأضفها إلى سلتك في لبابك.",
      },
      { property: "og:title", content: "منتجات المتجر | لبابك" },
      { property: "og:description", content: "منتجات، أسعار، وتوصيل سريع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  useCustomerAreaGuard();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const [view, setView] = useState<"products" | "tab">("products");

  const { data } = useQuery({
    queryKey: ["store", id],
    queryFn: async () => {
      const [provider, categories, products] = await Promise.all([
        supabase
          .from("providers")
          .select("id, name, description, rating, is_open, address_text, kind")
          .eq("id", id)
          .eq("kind", "store")
          .eq("is_demo", false)
          .maybeSingle(),
        supabase
          .from("menu_categories")
          .select("id, name, sort_order")
          .eq("provider_id", id)
          .order("sort_order"),
        supabase
          .from("products")
          .select("id, name, description, price, category_id, is_available, stock, image_url")
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
  const uncategorized = (data?.products ?? []).filter((p) => !p.category_id);

  function addToCart(p: { id: string; name: string; price: number }) {
    if (!provider) return;
    cart.add(
      { id: provider.id, name: provider.name },
      { productId: p.id, name: p.name, price: Number(p.price) },
    );
    toast.success("أضفناها للسلة");
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/stores" label="المتاجر" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <StoreIcon className="size-6" /> {provider?.name ?? "..."}
        </h1>
        <p className="mt-1 text-sm opacity-90">{provider?.description}</p>
        <div className="mt-2 flex items-center gap-4 text-xs opacity-90">
          <span className="flex items-center gap-1">
            <Star className="size-3.5" /> {Number(provider?.rating ?? 0).toFixed(1)}
          </span>
          <span>{provider?.address_text}</span>
          <span className={provider?.is_open ? "" : "font-bold"}>
            {provider?.is_open ? "مفتوح الآن" : "مغلق — غير متاح للطلب"}
          </span>
        </div>
      </header>

      <div className="mt-4 flex gap-2 px-4">
        {(
          [
            { key: "products", label: "المنتجات" },
            { key: "tab", label: "قائمتي" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-xs font-semibold transition",
              view === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "tab" && provider && (
        <div className="px-4 py-5">
          <CustomerTabPanel providerId={provider.id} providerName={provider.name} />
        </div>
      )}

      <div className={cn("space-y-6 px-4 py-5", view !== "products" && "hidden")}>
        {(data?.categories ?? []).map((cat) => {
          const items = (data?.products ?? []).filter((p) => p.category_id === cat.id);

          if (!items.length) return null;
          return (
            <section key={cat.id}>
              <h2 className="mb-3 text-base font-bold">{cat.name}</h2>
              <div className="space-y-3">
                {items.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    closed={!provider?.is_open}
                    onAdd={() => addToCart(p)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {uncategorized.length > 0 && (
          <section>
            <h2 className="mb-3 text-base font-bold">منتجات أخرى</h2>
            <div className="space-y-3">
              {uncategorized.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  closed={!provider?.is_open}
                  onAdd={() => addToCart(p)}
                />
              ))}
            </div>
          </section>
        )}

        {data && !provider && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            هذا النشاط غير موجود ضمن المتاجر. تفقّده في قسم المطاعم.
          </p>
        )}
        {provider && !data?.products.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            المتجر ما ضاف منتجات بعد.
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

type ProductRowProps = {
  product: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    is_available: boolean;
    stock: number | null;
    image_url?: string | null;
  };
  closed?: boolean;
  onAdd: () => void;
};

function ProductRow({ product, closed, onAdd }: ProductRowProps) {
  const soldOut = !product.is_available || product.stock === 0 || !!closed;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
      <ProductImage src={product.image_url} alt={product.name} />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{product.name}</p>
        <p className="truncate text-xs text-muted-foreground">{product.description}</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-sm font-bold text-primary">{formatIQD(Number(product.price))}</span>
          {soldOut ? (
            <span className="text-xs font-semibold text-destructive">غير متوفر حالياً</span>
          ) : product.stock != null && product.stock <= 5 ? (
            <span className="text-xs font-semibold text-warning">باقي {product.stock} فقط</span>
          ) : (
            <span className="text-xs text-success">متوفر</span>
          )}
        </div>
      </div>
      <Button
        size="icon"
        className="size-11 rounded-xl"
        disabled={soldOut}
        onClick={onAdd}
        aria-label="إضافة للسلة"
      >
        <Plus className="size-5" />
      </Button>
    </div>
  );
}
