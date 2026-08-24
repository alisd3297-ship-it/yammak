import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LocateFixed, MapPin, PackageCheck } from "lucide-react";
import { BackButton, BottomNav, PageShell  } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/auth";
import { formatIQD } from "@/lib/orders";
import { createCourierOrder, quoteCourierFee } from "@/lib/courier.functions";

export const Route = createFileRoute("/courier")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "توصيل سريع | يمّك" },
      {
        name: "description",
        content: "توصيل سريع لإرسال أو استلام أغراضك من أي نقطة إلى أخرى داخل مدينتك مع تسعير واضح.",
      },
      { property: "og:title", content: "توصيل سريع | يمّك" },
      { property: "og:description", content: "إرسال واستلام من نقطة لنقطة عبر مندوبي يمّك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CourierPage,
});

type Coords = { lat: number; lng: number } | null;

function CourierPage() {
  const navigate = useNavigate();
  const { data: account } = useAccount();
  const submit = useServerFn(createCourierOrder);
  const quote = useServerFn(quoteCourierFee);

  const [pickupText, setPickupText] = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [pickup, setPickup] = useState<Coords>(null);
  const [dropoff, setDropoff] = useState<Coords>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: feeQuote } = useQuery({
    queryKey: ["courier-quote", pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng],
    enabled: !!account?.userId,
    queryFn: () =>
      quote({
        data: {
          pickupLat: pickup?.lat ?? null,
          pickupLng: pickup?.lng ?? null,
          dropoffLat: dropoff?.lat ?? null,
          dropoffLng: dropoff?.lng ?? null,
        },
      }),
  });

  function locate(target: "pickup" | "dropoff") {
    if (!navigator.geolocation) {
      toast.error("جهازك ما يدعم تحديد الموقع");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (target === "pickup") setPickup(c);
        else setDropoff(c);
        toast.success("تم تحديد الموقع");
      },
      () => toast.error("تعذر تحديد موقعك، اكتب العنوان يدوياً"),
    );
  }

  async function send() {
    if (!account?.userId) {
      navigate({ to: "/auth" });
      return;
    }
    setSaving(true);
    try {
      const order = await submit({
        data: {
          pickupText,
          dropoffText,
          pickupLat: pickup?.lat ?? null,
          pickupLng: pickup?.lng ?? null,
          dropoffLat: dropoff?.lat ?? null,
          dropoffLng: dropoff?.lng ?? null,
          notes,
        },
      });
      toast.success("تم إرسال الطلب وجاري البحث عن مندوب");
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
        <h1 className="text-2xl font-black">توصيل سريع</h1>
        <p className="mt-1 text-sm opacity-90">إرسال واستلام من نقطة إلى نقطة داخل مدينتك.</p>
      </header>

      <div className="space-y-5 px-4 py-5">
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
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <PackageCheck className="size-4 text-primary" /> نقطة التسليم
          </h2>
          <Button variant="secondary" className="mb-3 h-11 w-full" onClick={() => locate("dropoff")}>
            <LocateFixed className="size-4" /> استخدم موقعي الحالي
          </Button>
          {dropoff && (
            <p className="mb-2 text-xs text-success">
              الإحداثيات: {dropoff.lat.toFixed(4)}، {dropoff.lng.toFixed(4)}
            </p>
          )}
          <Input
            value={dropoffText}
            onChange={(e) => setDropoffText(e.target.value)}
            placeholder="لوين نوصل؟ المنطقة، الشارع، أقرب نقطة دالة"
            className="h-12"
          />
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="شنو الغرض؟ وصف مختصر وملاحظات للمندوب"
            className="mt-3"
          />
        </section>

        <section className="rounded-2xl bg-card p-4 text-sm shadow-soft">
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">المسافة التقريبية</span>
            <span>{feeQuote ? `${feeQuote.km.toFixed(1)} كم` : "—"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-bold">
            <span>أجرة التوصيل</span>
            <span>{feeQuote ? formatIQD(feeQuote.fee) : "يتم الحساب…"}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            الدفع نقداً · الأجرة تُحتسب في الخادم حسب قواعد التسعير والمسافة.
          </p>
        </section>

        <Button className="h-13 w-full text-base" disabled={saving} onClick={send}>
          {account?.userId ? "أرسل الطلب للمندوبين" : "سجّل الدخول لإرسال الطلب"}
        </Button>
      </div>

      <BottomNav />
    </PageShell>
  );
}
