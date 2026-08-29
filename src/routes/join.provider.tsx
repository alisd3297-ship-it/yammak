import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LocateFixed, Store as StoreIcon, UtensilsCrossed, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { OPERATING_LOCATION } from "@/lib/location";
import { BackButton, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/auth";
import { applyAsProvider } from "@/lib/provider.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/join/provider")({
  head: () => ({
    meta: [
      { title: "انضم كمطعم أو متجر أو مهني | لبابك" },
      {
        name: "description",
        content: "سجّل مطعمك أو متجرك في لبابك واستقبل الطلبات بعد اعتماد الإدارة.",
      },
      { property: "og:title", content: "انضم كمطعم أو متجر | لبابك" },
      { property: "og:description", content: "تقديم طلب انضمام لمقدمي الخدمة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinProviderPage,
});

function JoinProviderPage() {
  const { data: account, refetch } = useAccount();
  const navigate = useNavigate();
  const apply = useServerFn(applyAsProvider);

  const [kind, setKind] = useState<"restaurant" | "store" | "profession">("store");
  const [professionCategoryId, setProfessionCategoryId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [addressText, setAddressText] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["profession-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profession_categories")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order");
      return data ?? [];
    },
  });

  const { data: cities } = useQuery({
    queryKey: ["cities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cities")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order");
      return data ?? [];
    },
  });

  // الموقع التشغيلي الحالي: كربلاء — قضاء الحسينية (تبقى بقية المدن متاحة للاختيار)
  useEffect(() => {
    if (cityId || !cities?.length) return;
    const preferred = cities.find((c) => c.name === OPERATING_LOCATION.cityName);
    if (preferred) setCityId(preferred.id);
  }, [cities, cityId]);

  async function submit() {
    if (!name.trim()) {
      toast.error("اكتب اسم النشاط");
      return;
    }
    setSaving(true);
    try {
      await apply({
        data: {
          kind,
          name,
          description: description || null,
          phone: phone || null,
          cityId: cityId || null,
          addressText: addressText || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          professionCategoryId: kind === "profession" ? professionCategoryId : null,
        },
      });
      toast.success("استلمنا طلبك، بانتظار اعتماد الإدارة");
      await refetch();
      navigate({ to: "/provider" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setSaving(false);
    }
  }

  if (!account?.userId) {
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            سجّل دخولك أولاً حتى تقدر تقدّم طلب انضمام.
          </p>
          <Link to="/auth" className="mt-3 inline-block font-semibold text-primary">
            تسجيل الدخول
          </Link>
        </div>
      </PageShell>
    );
  }

  if (account.provider) {
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">عندك نشاط مسجّل بحسابك مسبقاً.</p>
          <Link to="/provider" className="mt-3 inline-block font-semibold text-primary">
            فتح لوحة مقدم الخدمة
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" label="الرئيسية" />
        <h1 className="text-2xl font-black">انضم كمقدم خدمة</h1>
        <p className="mt-1 text-sm opacity-90">
          سجّل مطعمك أو متجرك أو مهنتك، والإدارة راح تراجع طلبك
        </p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { key: "store", label: "متجر / صيدلية", icon: StoreIcon },
              { key: "restaurant", label: "مطعم", icon: UtensilsCrossed },
              { key: "profession", label: "مهنة / خدمة", icon: Wrench },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setKind(opt.key)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl p-4 text-sm font-semibold shadow-soft transition",
                kind === opt.key ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
              )}
            >
              <opt.icon className="size-6" />
              {opt.label}
            </button>
          ))}
        </div>

        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          {kind === "profession" && (
            <select
              value={professionCategoryId}
              onChange={(e) => setProfessionCategoryId(e.target.value)}
              className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
              aria-label="تصنيف المهنة"
            >
              <option value="">تصنيف المهنة (اختياري)</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم النشاط"
            className="h-12"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف مختصر للنشاط"
          />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="رقم الهاتف"
            inputMode="tel"
            className="h-12"
          />
          <select
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
            aria-label="المدينة"
          >
            <option value="">اختر المدينة</option>
            {(cities ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
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
                  toast.success("تم تحديد موقع النشاط");
                },
                () => toast.error("تعذر تحديد الموقع"),
              )
            }
          >
            <LocateFixed className="size-4" /> تحديد موقع النشاط على الخريطة
          </Button>
          {coords && (
            <p className="text-xs text-success">
              الإحداثيات: {coords.lat.toFixed(4)}، {coords.lng.toFixed(4)}
            </p>
          )}
        </section>

        <p className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
          الطلب يُسجّل بحالة «قيد المراجعة». الاعتماد ونسبة العمولة تحددهما إدارة لبابك فقط.
        </p>

        <Button className="h-13 w-full text-base" disabled={saving} onClick={submit}>
          إرسال الطلب
        </Button>
      </div>
    </PageShell>
  );
}
