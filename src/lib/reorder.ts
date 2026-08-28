import { supabase } from "@/integrations/supabase/client";

export type ReorderResult =
  | { ok: true; providerId: string; providerName: string; items: ReorderItem[]; skipped: number }
  | { ok: false; reason: string };

export type ReorderItem = { productId: string; name: string; price: number; quantity: number };

/**
 * «إعادة الطلب»: يجلب عناصر طلب سابق ويتحقق من توفرها وأسعارها الحالية
 * قبل إعادة بناء السلة (الأسعار تُقرأ من قاعدة البيانات وليس من الطلب القديم).
 */
export async function buildReorder(orderId: string): Promise<ReorderResult> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, provider_id, providers(name, status, is_open)")
    .eq("id", orderId)
    .maybeSingle();

  if (!order?.provider_id) return { ok: false, reason: "هذا الطلب ما يقبل الإعادة" };
  const provider = order.providers as {
    name: string;
    status: string;
    is_open: boolean;
  } | null;
  if (!provider || provider.status !== "approved")
    return { ok: false, reason: "المتجر غير متاح حالياً" };

  const { data: items } = await supabase
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId);

  const productIds = (items ?? []).map((i) => i.product_id).filter(Boolean) as string[];
  if (!productIds.length) return { ok: false, reason: "ما توجد منتجات قابلة للإعادة" };

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, is_available, stock")
    .in("id", productIds)
    .eq("provider_id", order.provider_id);

  const available = new Map((products ?? []).filter((p) => p.is_available).map((p) => [p.id, p]));
  const result: ReorderItem[] = [];
  let skipped = 0;

  for (const it of items ?? []) {
    const p = it.product_id ? available.get(it.product_id) : undefined;
    if (!p) {
      skipped += 1;
      continue;
    }
    const max = p.stock == null ? 50 : Math.min(50, p.stock);
    const quantity = Math.max(1, Math.min(Number(it.quantity) || 1, max));
    if (quantity < 1) {
      skipped += 1;
      continue;
    }
    result.push({ productId: p.id, name: p.name, price: Number(p.price), quantity });
  }

  if (!result.length) return { ok: false, reason: "كل منتجات الطلب السابق غير متوفرة حالياً" };
  return { ok: true, providerId: order.provider_id, providerName: provider.name, items: result, skipped };
}
