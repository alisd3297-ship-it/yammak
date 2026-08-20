import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Minus, Plus, MapPin, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/lib/cart";
import { formatIQD } from "@/lib/orders";
import { createOrder, quoteDeliveryFee } from "@/lib/orders.functions";
import { useAccount } from "@/lib/auth";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "سلة الطلب | يمّك" },
      { name: "description", content: "راجع سلتك وحدد موقع التوصيل وأكّد طلبك عبر يمّك." },
      { property: "og:title", content: "سلة الطلب | يمّك" },
      { property: "og:description", content: "تأكيد الطلب وتحديد الموقع." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const { data: account } = useAccount();
  const submit = useServerFn(createOrder);
  const quote = useServerFn(quoteDeliveryFee);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // أجرة التوصيل تُحسب من قواعد التسعير في الخادم، لا من الواجهة
  const { data: feeQuote } = useQuery({
    queryKey: ["delivery-quote", cart.providerId, coords?.lat, coords?.lng],
    enabled: !!cart.providerId && !!account?.userId && !!cart.items.length,
    queryFn: () =>
      quote({
        data: { providerId: cart.providerId!, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
      }),
  });
  const deliveryFee = feeQuote?.fee ?? null;

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("جهازك ما يدعم تحديد الموقع");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("تم تحديد موقعك");
      },
      () => toast.error("ما كدرنا نوصل لموقعك، اكتب العنوان يدوياً"),
    );
  }

  async function submitOrder() {
    if (!account?.userId) {
      navigate({ to: "/auth" });
      return;
    }
    if (!cart.providerId || !cart.items.length) {
      toast.error("سلتك فارغة");
      return;
    }
    if (!address.trim() && !coords) {
      toast.error("حدد موقع التوصيل أو اكتب العنوان");
      return;
    }
    setSaving(true);
    try {
      const order = await submit({
        data: {
          providerId: cart.providerId,
          items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          address,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          notes,
        },
      });
      cart.clear();
      toast.success("تم إرسال طلبك للمطعم");
      navigate({ to: "/orders/$id", params: { id: order.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب، حاول مرة ثانية");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm opacity-90">
          <ArrowRight className="size-4" /> الرئيسية
        </Link>
        <h1 className="text-2xl font-black">سلة الطلب</h1>
        {cart.providerName && <p className="mt-1 text-sm opacity-90">من {cart.providerName}</p>}
      </header>

      {!cart.items.length ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">سلتك فارغة.</p>
          <Link to="/restaurants" className="mt-3 inline-block font-semibold text-primary">
            تصفح المطاعم
          </Link>
        </div>
      ) : (
        <div className="space-y-5 px-4 py-5">
          <div className="space-y-3">
            {cart.items.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{item.name}</p>
                  <p className="text-sm text-primary">{formatIQD(item.price * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8 rounded-lg"
                    onClick={() => cart.setQuantity(item.productId, item.quantity - 1)}
                    aria-label="إنقاص"
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-6 text-center font-bold">{item.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-8 rounded-lg"
                    onClick={() => cart.setQuantity(item.productId, item.quantity + 1)}
                    aria-label="زيادة"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <MapPin className="size-4 text-primary" /> موقع التوصيل
            </h2>
            <Button variant="secondary" className="mb-3 h-11 w-full" onClick={useMyLocation}>
              <LocateFixed className="size-4" /> استخدم موقعي الحالي
            </Button>
            {coords && (
              <p className="mb-2 text-xs text-success">
                تم تحديد الإحداثيات: {coords.lat.toFixed(4)}، {coords.lng.toFixed(4)}
              </p>
            )}
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="اكتب العنوان: المنطقة، الشارع، أقرب نقطة دالة"
              className="h-12"
            />
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات للمطعم أو المندوب"
              className="mt-3"
            />
          </section>

          <section className="rounded-2xl bg-card p-4 text-sm shadow-soft">
            <Row label="مجموع الطلب" value={formatIQD(cart.total)} />
            <Row label="أجرة التوصيل" value={formatIQD(DELIVERY_FEE)} />
            <div className="mt-2 border-t border-border pt-2">
              <Row label="الإجمالي" value={formatIQD(cart.total + DELIVERY_FEE)} bold />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">طريقة الدفع: نقداً عند الاستلام</p>
          </section>

          <Button className="h-13 w-full text-base" disabled={saving} onClick={submitOrder}>
            تأكيد الطلب
          </Button>
        </div>
      )}

      <BottomNav />
    </PageShell>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? "font-bold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
