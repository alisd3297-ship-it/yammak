import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Minus, Plus, MapPin, LocateFixed, Bike, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart";
import { formatIQD, type Fulfillment } from "@/lib/orders";
import { createOrder, quoteDeliveryFee } from "@/lib/orders.functions";
import { useCustomerAreaGuard, useAccount } from "@/lib/auth";

export const Route = createFileRoute("/checkout")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "سلة الطلب | لبابك" },
      { name: "description", content: "راجع سلتك وحدد موقع التوصيل وأكّد طلبك عبر لبابك." },
      { property: "og:title", content: "سلة الطلب | لبابك" },
      { property: "og:description", content: "تأكيد الطلب وتحديد الموقع." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  useCustomerAreaGuard();
  const cart = useCart();
  const navigate = useNavigate();
  const { data: account } = useAccount();
  const submit = useServerFn(createOrder);
  const quote = useServerFn(quoteDeliveryFee);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [partySize, setPartySize] = useState(2);
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: providerInfo } = useQuery({
    queryKey: ["checkout-provider", cart.providerId],
    enabled: !!cart.providerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, name, kind, address_text, phone")
        .eq("id", cart.providerId!)
        .maybeSingle();
      return data;
    },
  });
  const isRestaurant = providerInfo?.kind === "restaurant";

  // أجرة التوصيل تُحسب من قواعد التسعير في الخادم، لا من الواجهة
  const {
    data: feeQuote,
    isError: feeError,
    refetch: refetchFee,
  } = useQuery({
    queryKey: ["delivery-quote", cart.providerId, coords?.lat, coords?.lng],
    enabled:
      fulfillment === "delivery" && !!cart.providerId && !!account?.userId && !!cart.items.length,
    queryFn: () =>
      quote({
        data: { providerId: cart.providerId!, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
      }),
  });
  const deliveryFee = fulfillment === "delivery" ? (feeQuote?.fee ?? null) : 0;

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
    if (fulfillment === "delivery" && !address.trim() && !coords) {
      toast.error("حدد موقع التوصيل أو اكتب العنوان");
      return;
    }
    if (fulfillment === "dine_in" && !scheduledAt) {
      toast.error("حدد موعد الحجز");
      return;
    }
    setSaving(true);
    try {
      const order = await submit({
        data: {
          providerId: cart.providerId,
          items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          address: fulfillment === "delivery" ? address : "",
          lat: fulfillment === "delivery" ? (coords?.lat ?? null) : null,
          lng: fulfillment === "delivery" ? (coords?.lng ?? null) : null,
          notes,
          fulfillment,
          partySize: fulfillment === "dine_in" ? partySize : null,
          scheduledAt:
            fulfillment === "dine_in" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      });
      // الأسعار النهائية تُحتسب في الخادم: ننبّه الزبون إذا اختلف المجموع عن المعروض.
      const shownTotal = cart.total + (deliveryFee ?? 0);
      if (Math.abs(Number(order.total) - shownTotal) > 1) {
        toast.warning(
          `تم تحديث المجموع النهائي إلى ${formatIQD(Number(order.total))} حسب أسعار المتجر.`,
        );
      }
      cart.clear();
      toast.success(
        fulfillment === "dine_in"
          ? "تم إرسال حجزك للمطعم"
          : fulfillment === "takeaway"
            ? "تم إرسال طلب السفري للمطعم"
            : "تم إرسال طلبك للمطعم",
      );
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
        <BackButton fallback="/" label="الرئيسية" />
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
              <div
                key={item.productId}
                className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft"
              >
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
            <h2 className="mb-3 font-bold">طريقة الاستلام</h2>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: "delivery" as const, label: "توصيل", desc: "مندوب يوصلك", icon: Bike },
                  {
                    key: "takeaway" as const,
                    label: "سفري",
                    desc: "تستلم بنفسك",
                    icon: ShoppingBag,
                  },
                  {
                    key: "dine_in" as const,
                    label: "حجز بالصالة",
                    desc: "تتناول بالمطعم",
                    icon: UtensilsCrossed,
                  },
                ] satisfies { key: Fulfillment; label: string; desc: string; icon: typeof Bike }[]
              )
                .filter((opt) => opt.key !== "dine_in" || isRestaurant)
                .map((opt) => {
                  const active = fulfillment === opt.key;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setFulfillment(opt.key)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-center transition active:scale-95",
                        active ? "border-primary bg-primary/10" : "border-border bg-background",
                      )}
                      aria-pressed={active}
                    >
                      <Icon
                        className={cn("size-5", active ? "text-primary" : "text-muted-foreground")}
                      />
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                    </button>
                  );
                })}
            </div>
          </section>

          {fulfillment === "delivery" ? (
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
            </section>
          ) : (
            <section className="rounded-2xl bg-card p-4 shadow-soft">
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <MapPin className="size-4 text-primary" />
                {fulfillment === "dine_in" ? "مكان الحجز" : "مكان الاستلام"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {providerInfo?.address_text ?? cart.providerName ?? "عنوان المحل"}
              </p>
              {fulfillment === "dine_in" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold" htmlFor="sched">
                      موعد الحجز
                    </label>
                    <Input
                      id="sched"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold" htmlFor="party">
                      عدد الأشخاص
                    </label>
                    <Input
                      id="party"
                      type="number"
                      min={1}
                      max={50}
                      value={partySize}
                      onChange={(e) =>
                        setPartySize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                      }
                      className="h-12"
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات للمطعم أو المندوب"
            />
          </section>

          <section className="rounded-2xl bg-card p-4 text-sm shadow-soft">
            <Row label="مجموع الطلب" value={formatIQD(cart.total)} />
            {fulfillment === "delivery" ? (
              <Row
                label="أجرة التوصيل"
                value={
                  feeError
                    ? "تعذر الحساب"
                    : deliveryFee == null
                      ? "يتم الحساب…"
                      : formatIQD(deliveryFee)
                }
              />
            ) : (
              <Row label="أجرة التوصيل" value="بدون توصيل" />
            )}
            {feeError && fulfillment === "delivery" && (
              <button
                type="button"
                onClick={() => void refetchFee()}
                className="mt-1 text-xs font-bold text-primary"
              >
                إعادة حساب أجرة التوصيل
              </button>
            )}

            <div className="mt-2 border-t border-border pt-2">
              <Row
                label="الإجمالي"
                value={
                  deliveryFee == null ? formatIQD(cart.total) : formatIQD(cart.total + deliveryFee)
                }
                bold
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              طريقة الدفع: نقداً عند الاستلام · الأسعار والمجموع النهائي يُحتسبان في الخادم
            </p>
          </section>

          <Button className="h-13 w-full text-base" disabled={saving} onClick={submitOrder}>
            {fulfillment === "dine_in" ? "تأكيد الحجز" : "تأكيد الطلب"}
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
