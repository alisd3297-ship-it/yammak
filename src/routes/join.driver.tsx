import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bike, Car } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OPERATING_LOCATION } from "@/lib/location";
import { BackButton, PageShell  } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/lib/auth";
import { applyAsDriver } from "@/lib/taxi.functions";
import { TAXI_CLASSES, type TaxiClass } from "@/lib/taxi";
import { VEHICLE_LABELS, VEHICLE_ORDER, type VehicleType } from "@/lib/vehicles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/join/driver")({
  head: () => ({
    meta: [
      { title: "انضم كسائق أو مندوب | لبابك" },
      {
        name: "description",
        content: "سجّل مركبتك واشتغل مع لبابك كسائق تكسي أو مندوب توصيل بعد اعتماد الإدارة.",
      },
      { property: "og:title", content: "انضم كسائق أو مندوب | لبابك" },
      { property: "og:description", content: "تقديم طلب انضمام للسائقين والمندوبين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinDriverPage,
});

function JoinDriverPage() {
  const { data: account, refetch } = useAccount();
  const navigate = useNavigate();
  const apply = useServerFn(applyAsDriver);

  const [workerKind, setWorkerKind] = useState<"taxi" | "delivery">("taxi");
  const [taxiClass, setTaxiClass] = useState<TaxiClass>("economy");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [seats, setSeats] = useState(4);
  const [cityId, setCityId] = useState("");
  const [phone, setPhone] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [plate, setPlate] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: cities } = useQuery({
    queryKey: ["cities"],
    queryFn: async () => {
      const { data } = await supabase.from("cities").select("id, name").eq("is_active", true).order("sort_order");
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
    if (workerKind === "taxi" && (!make.trim() || !plate.trim())) {
      toast.error("اكتب نوع المركبة ورقم اللوحة");
      return;
    }
    setSaving(true);
    try {
      await apply({
        data: {
          workerKind,
          cityId: cityId || null,
          phone: phone || null,
          vehicleMake: make || null,
          vehicleModel: model || null,
          vehicleColor: color || null,
          plateNumber: plate || null,
          taxiClass: workerKind === "taxi" ? taxiClass : null,
          taxiSeats: seats,
          vehicleType: workerKind === "delivery" ? vehicleType : null,
        },
      });
      toast.success("استلمنا طلبك، بانتظار اعتماد الإدارة");
      await refetch();
      navigate({ to: "/driver" });
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
          <p className="text-sm text-muted-foreground">سجّل دخولك أولاً حتى تقدر تقدّم طلب انضمام.</p>
          <Link to="/auth" className="mt-3 inline-block font-semibold text-primary">
            تسجيل الدخول
          </Link>
        </div>
      </PageShell>
    );
  }

  if (account.worker?.is_approved) {
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">حسابك كسائق معتمد أصلاً.</p>
          <Link to="/driver" className="mt-3 inline-block font-semibold text-primary">
            فتح لوحة السائق
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" label="الرئيسية" />
        <h1 className="text-2xl font-black">انضم كسائق</h1>
        <p className="mt-1 text-sm opacity-90">سجّل مركبتك، والإدارة راح تراجع طلبك قبل التفعيل</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { key: "taxi", label: "سائق تكسي", icon: Car },
              { key: "delivery", label: "مندوب توصيل", icon: Bike },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setWorkerKind(opt.key)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl p-4 text-sm font-semibold shadow-soft transition",
                workerKind === opt.key ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
              )}
            >
              <opt.icon className="size-6" />
              {opt.label}
            </button>
          ))}
        </div>

        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          {workerKind === "taxi" ? (
            <div className="grid grid-cols-3 gap-2">
              {TAXI_CLASSES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => {
                    setTaxiClass(c.key);
                    setSeats(c.seats);
                  }}
                  className={cn(
                    "rounded-xl p-3 text-xs font-semibold transition",
                    taxiClass === c.key ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {VEHICLE_ORDER.map((v) => (
                <button
                  key={v}
                  onClick={() => setVehicleType(v)}
                  className={cn(
                    "rounded-xl p-3 text-xs font-semibold transition",
                    vehicleType === v ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {VEHICLE_LABELS[v]}
                </button>
              ))}
            </div>
          )}

          <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="نوع المركبة (تويوتا، كيا…)" className="h-12" />
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="الموديل والسنة" className="h-12" />
          <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="اللون" className="h-12" />
          <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="رقم اللوحة" className="h-12" />
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

          {workerKind === "taxi" && (
            <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <span className="font-semibold">عدد المقاعد المتاحة للركاب</span>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="size-9" onClick={() => setSeats((s) => Math.max(1, s - 1))}>
                  −
                </Button>
                <span className="w-6 text-center font-bold">{seats}</span>
                <Button variant="outline" size="sm" className="size-9" onClick={() => setSeats((s) => Math.min(6, s + 1))}>
                  +
                </Button>
              </div>
            </div>
          )}
        </section>

        <p className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
          الطلب يُسجّل بحالة «قيد المراجعة». التفعيل واستلام الرحلات يبدأ بعد اعتماد إدارة لبابك فقط.
        </p>

        <Button className="h-13 w-full text-base" disabled={saving} onClick={submit}>
          إرسال الطلب
        </Button>
      </div>
    </PageShell>
  );
}
