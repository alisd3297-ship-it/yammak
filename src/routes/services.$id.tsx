import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { OPERATING_ADDRESS_PREFIX } from "@/lib/location";
import { LocateFixed, Star, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCustomerFlow } from "@/lib/route-guards";
import { BackButton, PageShell  } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCustomerAreaGuard, useAccount  } from "@/lib/auth";
import { createServiceRequest } from "@/lib/services.functions";
import { formatServicePrice, PRICE_UNIT_LABELS, type ServicePriceUnit } from "@/lib/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/services/$id")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "مقدم خدمة | لبابك" },
      { name: "description", content: "شوف خدمات مقدم الخدمة وأسعاره وقيّمه بعد إنجاز الشغل عبر لبابك." },
      { property: "og:title", content: "مقدم خدمة | لبابك" },
      { property: "og:description", content: "اطلب خدمة مهنية معتمدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServiceProviderPage,
});

function ServiceProviderPage() {
  useCustomerAreaGuard();
  const { id } = Route.useParams();
  const { data: account } = useAccount();
  const navigate = useNavigate();
  const submitRequest = useServerFn(createServiceRequest);

  const [selected, setSelected] = useState<string | null>(null);
  const [address, setAddress] = useState(OPERATING_ADDRESS_PREFIX);
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["service-provider", id],
    queryFn: async () => {
      const [provider, services] = await Promise.all([
        supabase
          .from("providers")
          .select("id, name, description, rating, ratings_count, is_open, address_text, phone, status")
          .eq("id", id)
          .eq("is_demo", false)
          .maybeSingle(),
        supabase
          .from("provider_services")
          .select("id, name, description, price_amount, price_unit, estimated_minutes, currency")
          .eq("provider_id", id)
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      return { provider: provider.data, services: services.data ?? [] };
    },
  });

  const provider = data?.provider;

  async function submit() {
    if (!account?.userId) {
      navigate({ to: "/auth" });
      return;
    }
    if (!selected) {
      toast.error("اختر الخدمة المطلوبة");
      return;
    }
    if (!address.trim() && !coords) {
      toast.error("اكتب العنوان أو حدد موقعك");
      return;
    }
    setSaving(true);
    try {
      const res = await submitRequest({
        data: {
          serviceId: selected,
          address,
          description: description || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      });
      toast.success(`تم إرسال طلبك #${res.code}`);
      navigate({ to: "/service-requests" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setSaving(false);
    }
  }

  if (!provider) {
    return (
      <PageShell>
        <div className="px-5 py-16 text-center text-sm text-muted-foreground">جاري التحميل…</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/services" label="كل الخدمات" />
        <div className="flex items-start gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15">
            <Wrench className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black">{provider.name}</h1>
            <p className="truncate text-sm opacity-90">{provider.description}</p>
            <div className="mt-1 flex items-center gap-3 text-xs opacity-90">
              <span className="flex items-center gap-1">
                <Star className="size-3.5 fill-white text-white" />
                {Number(provider.rating).toFixed(1)} ({provider.ratings_count})
              </span>
              <span>{provider.is_open ? "متاح الآن" : "غير متاح حالياً"}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="px-4 py-5">
        <h2 className="mb-3 text-base font-bold">الخدمات والأسعار</h2>
        <div className="space-y-3">
          {data?.services.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={cn(
                "w-full rounded-2xl border-2 bg-card p-4 text-start shadow-soft transition",
                selected === s.id ? "border-primary" : "border-transparent",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">{s.name}</p>
                <span className="shrink-0 text-sm font-bold text-primary">
                  {formatServicePrice(Number(s.price_amount), s.price_unit as ServicePriceUnit, s.currency)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
              <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                <span>{PRICE_UNIT_LABELS[s.price_unit as ServicePriceUnit]}</span>
                {s.estimated_minutes ? <span>مدة تقريبية: {s.estimated_minutes} دقيقة</span> : null}
              </div>
            </button>
          ))}
          {!data?.services.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              ما أضاف مقدم الخدمة خدماته بعد.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3 px-4 pb-8">
        <h2 className="text-base font-bold">تفاصيل الطلب</h2>
        <div className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="العنوان: المنطقة، الشارع، أقرب نقطة دالة"
            className="h-12"
          />
          <Button
            variant="secondary"
            className="h-11 w-full"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition(
                (pos) => {
                  setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                  toast.success("تم تحديد موقعك");
                },
                () => toast.error("تعذر تحديد الموقع"),
              )
            }
          >
            <LocateFixed className="size-4" /> تحديد موقعي
          </Button>
          {coords && (
            <p className="text-xs text-success">
              الإحداثيات: {coords.lat.toFixed(4)}، {coords.lng.toFixed(4)}
            </p>
          )}
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="اشرح المشكلة أو الشغل المطلوب"
          />
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor="scheduled-at">
            موعد مفضل (اختياري)
          </label>
          <Input
            id="scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="h-12"
          />
          <p className="text-xs text-muted-foreground">
            السعر النهائي يُحتسب من أسعار مقدم الخدمة المسجّلة في لبابك، ولا يمكن تعديله من التطبيق.
          </p>
        </div>

        <Button className="h-13 w-full text-base" disabled={saving || !provider.is_open} onClick={submit}>
          {provider.is_open ? "إرسال طلب الخدمة" : "مقدم الخدمة غير متاح حالياً"}
        </Button>
      </section>
    </PageShell>
  );
}
