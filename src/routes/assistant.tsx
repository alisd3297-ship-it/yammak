import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Search, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeArabic, fuzzyScore } from "@/lib/search";
import { providerRoute } from "@/lib/nearby";
import { useCustomerAreaGuard } from "@/lib/auth";
import { formatIQD } from "@/lib/orders";

export const Route = createFileRoute("/assistant")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "مساعد لبابك | لبابك" },
      {
        name: "description",
        content: "اسأل مساعد لبابك عن أي منتج أو خدمة ويدلّك على أقرب مكان يوفرها.",
      },
      { property: "og:title", content: "مساعد لبابك | لبابك" },
      { property: "og:description", content: "مساعد ذكي يدلّك على المنتج والخدمة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

const QUICK = ["دواء", "صمون", "كهربائي", "بيتزا", "غاز", "تكسي"];

const INTENTS: {
  keys: string[];
  label: string;
  to: "/taxi" | "/courier" | "/services" | "/pharmacies" | "/doctors" | "/request-anything";
}[] = [
  { keys: ["تكسي", "سيارة", "توصيلة", "مشوار"], label: "احجز تكسي", to: "/taxi" },
  {
    keys: ["مندوب", "ارسال", "استلام", "توصيل غرض", "طرد"],
    label: "اطلب مندوب توصيل",
    to: "/courier",
  },
  {
    keys: ["كهربائي", "سباك", "نجار", "صيانة", "مبرد", "فني"],
    label: "مهن وخدمات",
    to: "/services",
  },
  { keys: ["دواء", "صيدلية", "علاج", "بنادول"], label: "الصيدليات", to: "/pharmacies" },
  { keys: ["طبيب", "دكتور", "استشارة"], label: "الأطباء", to: "/doctors" },
];

function AssistantPage() {
  useCustomerAreaGuard();
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["assistant-index"],
    staleTime: 120_000,
    queryFn: async () => {
      const [providers, products, services] = await Promise.all([
        supabase
          .from("providers")
          .select("id, name, kind, description, keywords, is_open")
          .eq("status", "approved")
          .eq("is_demo", false),
        supabase
          .from("products")
          .select("id, name, description, price, provider_id, keywords, is_available")
          .eq("is_available", true)
          .limit(1000),
        supabase
          .from("provider_services")
          .select("id, name, description, price_amount, price_unit, provider_id, is_active")
          .eq("is_active", true)
          .limit(1000),
      ]);
      return {
        providers: providers.data ?? [],
        products: products.data ?? [],
        services: services.data ?? [],
      };
    },
  });

  const query = normalizeArabic(submitted);

  const answer = useMemo(() => {
    if (!query || !data) return null;
    const providerById = new Map(data.providers.map((p) => [p.id, p]));

    const intent = INTENTS.find((i) => i.keys.some((k) => query.includes(normalizeArabic(k))));

    const products = data.products
      .map((p) => ({
        item: p,
        score: fuzzyScore(query, [p.name, p.description ?? "", ...(p.keywords ?? [])]),
      }))
      .filter((r) => r.score > 0 && providerById.has(r.item.provider_id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const services = data.services
      .map((s) => ({ item: s, score: fuzzyScore(query, [s.name, s.description ?? ""]) }))
      .filter((r) => r.score > 0 && providerById.has(r.item.provider_id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const providers = data.providers
      .map((p) => ({
        item: p,
        score: fuzzyScore(query, [p.name, p.description ?? "", ...(p.keywords ?? [])]),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return { intent, products, services, providers, providerById };
  }, [query, data]);

  const empty =
    answer &&
    !answer.intent &&
    !answer.products.length &&
    !answer.services.length &&
    !answer.providers.length;

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Bot className="size-6" /> مساعد لبابك
        </h1>
        <p className="mt-1 text-sm opacity-90">اسأل عن أي منتج أو خدمة ونوصلك للمكان الصح</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSubmitted(term)}
              placeholder="مثلاً: أريد دواء برد"
              className="h-12 pe-10"
              aria-label="سؤالك"
            />
          </div>
          <Button className="h-12 px-4" onClick={() => setSubmitted(term)}>
            <Send className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold"
              onClick={() => {
                setTerm(q);
                setSubmitted(q);
              }}
            >
              {q}
            </button>
          ))}
        </div>

        {isPending && submitted && <p className="text-sm text-muted-foreground">جاري البحث…</p>}

        {answer?.intent && (
          <Link
            to={answer.intent.to}
            className="block rounded-2xl bg-primary p-4 text-primary-foreground shadow-soft"
          >
            <p className="text-sm opacity-90">الأنسب لطلبك</p>
            <p className="text-lg font-black">{answer.intent.label}</p>
          </Link>
        )}

        {!!answer?.products.length && (
          <section>
            <h2 className="mb-2 text-base font-bold">منتجات متوفرة</h2>
            <div className="space-y-2">
              {answer.products.map(({ item }) => {
                const prov = answer.providerById.get(item.provider_id)!;
                return (
                  <Link
                    key={item.id}
                    to={providerRoute(prov.kind as string)}
                    params={{ id: prov.id }}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-soft"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{prov.name}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-primary">
                      {formatIQD(Number(item.price))}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {!!answer?.services.length && (
          <section>
            <h2 className="mb-2 text-base font-bold">خدمات مهنية</h2>
            <div className="space-y-2">
              {answer.services.map(({ item }) => {
                const prov = answer.providerById.get(item.provider_id)!;
                return (
                  <Link
                    key={item.id}
                    to="/services/$id"
                    params={{ id: prov.id }}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-soft"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{prov.name}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-primary">
                      {formatIQD(Number(item.price_amount))}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {!!answer?.providers.length && (
          <section>
            <h2 className="mb-2 text-base font-bold">أماكن مقترحة</h2>
            <div className="space-y-2">
              {answer.providers.map(({ item }) => (
                <Link
                  key={item.id}
                  to={providerRoute(item.kind as string)}
                  params={{ id: item.id }}
                  className="block rounded-2xl bg-card p-3 shadow-soft"
                >
                  <p className="font-bold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.is_open ? "مفتوح الآن" : "مغلق حالياً"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {empty && (
          <div className="rounded-2xl bg-muted p-4 text-sm">
            <p className="mb-2">ما لكينا نتيجة مطابقة داخل التطبيق.</p>
            <Link to="/request-anything" className="font-bold text-primary">
              أرسلها كطلب «اطلب أي شي» ونتكفل بيها
            </Link>
          </div>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
