import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LocateFixed, MapPin, Plus, Trash2, Truck } from "lucide-react";
import { BackButton, BottomNav, PageShell  } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCustomerAreaGuard, useAccount  } from "@/lib/auth";
import { formatIQD } from "@/lib/orders";
import { VEHICLE_HINTS, VEHICLE_LABELS, VEHICLE_ORDER, type VehicleType } from "@/lib/vehicles";
import {
  createSpecialDeliveryOrder,
  quoteSpecialDelivery,
  type SpecialStopInput,
} from "@/lib/special-delivery.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/special-delivery")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "التوصيل الخاص | يمّك" },
      {
        name: "description",
        content:
          "توصيل خاص حسب طبيعة المهمة: اختر نوع المركبة، حدد نقطة الاستلام وعدة نقاط تسليم، الآن أو بموعد مجدول.",
      },
      { property: "og:title", content: "التوصيل الخاص | يمّك" },
      {
        property: "og:description",
        content: "دراجة، سيارة، بيك أب أو شاحنة صغيرة — تسعير واضح ومحسوب حسب المسافة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpecialDeliveryPage,
});

type Coords = { lat: number; lng: number } | null;
type StopDraft = SpecialStopInput & { lat: number | null; lng: number | null };

const emptyStop = (): StopDraft => ({
  address_text: "",
  lat: null,
  lng: null,
  recipient_name: "",
  recipient_phone: "",
  notes: "",
});

function SpecialDeliveryPage() {
  useCustomerAreaGuard();
  const navigate = useNavigate();
  const { data: account } = useAccount();
  const submit = useServerFn(createSpecialDeliveryOrder);
  const quote = useServerFn(quoteSpecialDelivery);

  const [vehicle, setVehicle] = useState<VehicleType>("car");
  const [pickupText, setPickupText] = useState("");
  const [pickup, setPickup] = useState<Coords>(null);
  const [stops, setStops] = useState<StopDraft[]>([emptyStop()]);
  const [cargo, setCargo] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [whenLater, setWhenLater] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const quotePayload = useMemo(
    () => ({
      vehicleType: vehicle,
      pickupLat: pickup?.lat ?? null,
      pickupLng: pickup?.lng ?? null,
      stops: stops.map((s) => ({ ...s })),
    }),
    [vehicle, pickup, stops],
  );

  const { data: feeQuote } = useQuery({
    queryKey: ["special-quote", JSON.stringify(quotePayload)],
    enabled: !!account?.userId,
    queryFn: () => quote({ data: quotePayload }),
  });

  function locate(target: "pickup" | number) {
    if (!navigator.geolocation) {
      toast.error("جهازك ما يدعم تحديد الموقع");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (target === "pickup") setPickup(c);
        else
          setStops((prev) =>
            prev.map((s, i) => (i === target ? { ...s, lat: c.lat, lng: c.lng } : s)),
          );
        toast.success("تم تحديد الموقع");
      },
      () => toast.error("تعذر تحديد موقعك، اكتب العنوان يدوياً"),
    );
  }

  function updateStop(index: number, patch: Partial<StopDraft>) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function send() {
    if (!account?.userId) {
      navigate({ to: "/auth" });
      return;
    }
    if (!stops.some((s) => s.address_text.trim() || (s.lat != null && s.lng != null))) {
      toast.error("أضف نقطة تسليم واحدة على الأقل");
      return;
    }
    setSaving(true);
    try {
      const order = await submit({
        data: {
          vehicleType: vehicle,
          pickupText,
          pickupLat: pickup?.lat ?? null,
          pickupLng: pickup?.lng ?? null,
          stops,
          cargoDescription: cargo,
          cargoWeightKg: weight ? Number(weight) : null,
          scheduledAt: whenLater && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          notes,
        },
      });
      toast.success(
        order.status === "new" ? "تم جدولة الطلب، راح نوزعه قرب الموعد" : "تم إرسال الطلب وجاري البحث عن مندوب",
      );
      navigate({ to: "/orders/$id", params: { id: order.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" label="الرئيسية" />
        <h1 className="text-2xl font-black">التوصيل الخاص</h1>
        <p className="mt-1 text-sm opacity-90">
          اختر المركبة المناسبة، نقطة استلام وعدة نقاط تسليم، الآن أو بموعد.
        </p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <Truck className="size-4 text-primary" /> نوع المركبة
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {VEHICLE_ORDER.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVehicle(v)}
                className={cn(
                  "rounded-xl border p-3 text-start transition active:scale-95",
                  vehicle === v
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background",
                )}
              >
                <span className="block text-sm font-bold">{VEHICLE_LABELS[v]}</span>
                <span className="block text-[11px] text-muted-foreground">{VEHICLE_HINTS[v]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <MapPin className="size-4 text-primary" /> نقطة الاستلام
          </h2>
          <Button variant="secondary" className="mb-3 h-11 w-full" onClick={() => locate("pickup")}>
            <LocateFixed className="size-4" /> استخدم موقعي الحالي
          </Button>
          {pickup && (
            <p className="mb-2 text-xs text-success">
              الإحداثيات: {pickup.lat.toFixed(4)}، {pickup.lng.toFixed(4)}
            </p>
          )}
          <Input
            value={pickupText}
            onChange={(e) => setPickupText(e.target.value)}
            placeholder="من وين نستلم؟ المنطقة، الشارع، أقرب نقطة دالة"
            className="h-12"
          />
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">نقاط التسليم</h2>
            <span className="text-xs text-muted-foreground">{stops.length} من 5</span>
          </div>
          <div className="space-y-4">
            {stops.map((s, i) => (
              <div key={i} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold">النقطة {i + 1}</span>
                  {stops.length > 1 && (
                    <button
                      type="button"
                      aria-label="حذف النقطة"
                      onClick={() => setStops((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <Button variant="secondary" className="mb-2 h-10 w-full" onClick={() => locate(i)}>
                  <LocateFixed className="size-4" /> موقعي الحالي لهذه النقطة
                </Button>
                {s.lat != null && s.lng != null && (
                  <p className="mb-2 text-xs text-success">
                    الإحداثيات: {s.lat.toFixed(4)}، {s.lng.toFixed(4)}
                  </p>
                )}
                <Input
                  value={s.address_text}
                  onChange={(e) => updateStop(i, { address_text: e.target.value })}
                  placeholder="عنوان التسليم"
                  className="h-11"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    value={s.recipient_name ?? ""}
                    onChange={(e) => updateStop(i, { recipient_name: e.target.value })}
                    placeholder="اسم المستلم"
                    className="h-11"
                  />
                  <Input
                    value={s.recipient_phone ?? ""}
                    onChange={(e) => updateStop(i, { recipient_phone: e.target.value })}
                    placeholder="هاتف المستلم"
                    inputMode="tel"
                    className="h-11"
                  />
                </div>
                <Input
                  value={s.notes ?? ""}
                  onChange={(e) => updateStop(i, { notes: e.target.value })}
                  placeholder="ملاحظة لهذه النقطة"
                  className="mt-2 h-11"
                />
              </div>
            ))}
          </div>
          {stops.length < 5 && (
            <Button
              variant="outline"
              className="mt-3 h-11 w-full"
              onClick={() => setStops((prev) => [...prev, emptyStop()])}
            >
              <Plus className="size-4" /> أضف نقطة تسليم
            </Button>
          )}
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 font-bold">الحمولة والموعد</h2>
          <Textarea
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="شنو الحمولة؟ وصف مختصر"
          />
          <Input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="الوزن التقريبي بالكيلو (اختياري)"
            inputMode="decimal"
            className="mt-3 h-12"
          />
          <div className="mt-3 flex gap-2">
            {([false, true] as const).map((later) => (
              <button
                key={String(later)}
                type="button"
                onClick={() => setWhenLater(later)}
                className={cn(
                  "flex-1 rounded-xl px-3 py-2 text-sm font-semibold",
                  whenLater === later
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {later ? "بموعد لاحق" : "الآن"}
              </button>
            ))}
          </div>
          {whenLater && (
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-3 h-12"
              aria-label="موعد التنفيذ"
            />
          )}
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات عامة للمندوب"
            className="mt-3"
          />
        </section>

        <section className="rounded-2xl bg-card p-4 text-sm shadow-soft">
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">المسافة الكلية</span>
            <span>{feeQuote ? `${feeQuote.km.toFixed(1)} كم` : "—"}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">نقاط التسليم</span>
            <span>{feeQuote?.stops ?? stops.length}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-bold">
            <span>الأجرة التقديرية</span>
            <span>{feeQuote ? formatIQD(feeQuote.fee) : "يتم الحساب…"}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            الدفع نقداً · الأجرة تُحتسب في الخادم حسب نوع المركبة والمسافة وعدد النقاط.
          </p>
        </section>

        <Button className="h-13 w-full text-base" disabled={saving} onClick={send}>
          {account?.userId ? "أرسل طلب التوصيل الخاص" : "سجّل الدخول لإرسال الطلب"}
        </Button>
      </div>

      <BottomNav />
    </PageShell>
  );
}
