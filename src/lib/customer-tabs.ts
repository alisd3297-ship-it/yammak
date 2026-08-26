/** أدوات حساب «قائمتي» — حساب الزبون المتكرر لدى محل معيّن. */

export type TabItem = {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  note: string | null;
};

export type TabPayment = {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export type TabTotals = {
  /** مجموع المواد فقط بدون التوصيل. */
  itemsTotal: number;
  /** رسوم التوصيل كبند مستقل. */
  deliveryFee: number;
  /** المستحق الكلي = المواد + التوصيل. */
  grandTotal: number;
  /** المبلغ المستحصل. */
  paid: number;
  /** المتبقي، لا ينزل تحت الصفر. */
  remaining: number;
  settled: boolean;
};

export function lineTotal(item: { quantity: number; unit_price: number }): number {
  return Number(item.quantity) * Number(item.unit_price);
}

export function computeTabTotals(
  items: { quantity: number; unit_price: number }[],
  deliveryFee: number,
  payments: { amount: number }[],
): TabTotals {
  const itemsTotal = items.reduce((sum, i) => sum + lineTotal(i), 0);
  const fee = Math.max(0, Number(deliveryFee) || 0);
  const grandTotal = itemsTotal + fee;
  const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Math.max(0, grandTotal - paid);
  return {
    itemsTotal,
    deliveryFee: fee,
    grandTotal,
    paid,
    remaining,
    settled: grandTotal > 0 && remaining <= 0.0001,
  };
}

export function tabStatusLabel(totals: TabTotals): string {
  if (totals.grandTotal <= 0) return "لا توجد مواد";
  return totals.settled ? "مسدد بالكامل" : "متبقي";
}

/** سجل الدفعات مع المتبقي بعد كل دفعة، مرتّب من الأحدث إلى الأقدم. */
export function paymentsWithRemaining<T extends { amount: number; created_at: string }>(
  payments: T[],
  grandTotal: number,
): (T & { remainingAfter: number })[] {
  const asc = [...payments].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  let balance = Math.max(0, Number(grandTotal) || 0);
  const withBalance = asc.map((p) => {
    balance = Math.max(0, balance - Number(p.amount));
    return { ...p, remainingAfter: balance };
  });
  return withBalance.reverse();
}
