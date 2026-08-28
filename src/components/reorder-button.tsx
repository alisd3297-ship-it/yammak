import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { buildReorder } from "@/lib/reorder";

/**
 * «إعادة الطلب» بضغطة: يعيد بناء السلة من طلب سابق بالأسعار والتوفر الحالي
 * ثم ينقل الزبون لصفحة الدفع مباشرة.
 */
export function ReorderButton({ orderId }: { orderId: string }) {
  const cart = useCart();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await buildReorder(orderId);
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      cart.clear();
      for (const item of res.items) {
        cart.add(
          { id: res.providerId, name: res.providerName },
          { productId: item.productId, name: item.name, price: item.price },
        );
        if (item.quantity > 1) cart.setQuantity(item.productId, item.quantity);
      }
      if (res.skipped) toast.warning(`${res.skipped} عنصر غير متوفر تم تجاهله`);
      toast.success("جهزنا سلتك من الطلب السابق");
      void navigate({ to: "/checkout" });
    } catch {
      toast.error("تعذر إعادة الطلب، حاول مرة ثانية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" className="h-12 w-full" onClick={() => void run()} disabled={busy}>
      <RotateCcw className="me-2 size-4" />
      {busy ? "جاري التجهيز…" : "إعادة نفس الطلب"}
    </Button>
  );
}
