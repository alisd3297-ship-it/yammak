import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Truck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/auth";
import { formatIQD } from "@/lib/orders";
import {
  computeTabTotals,
  lineTotal,
  paymentsWithRemaining,
  tabStatusLabel,
  type TabItem,
  type TabPayment,
} from "@/lib/customer-tabs";

/** «قائمتي»: عرض حساب الزبون المتفق عليه مع هذا المحل تحديداً — قراءة فقط للزبون. */
export function CustomerTabPanel({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName: string;
}) {
  const { data: account } = useAccount();
  const userId = account?.userId ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["customer-tab", providerId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: tab } = await supabase
        .from("customer_tabs")
        .select("id, delivery_fee, note")
        .eq("provider_id", providerId)
        .eq("customer_id", userId!)
        .maybeSingle();
      if (!tab) return null;
      const [items, payments] = await Promise.all([
        supabase
          .from("customer_tab_items")
          .select("id, name, quantity, unit_price, note")
          .eq("tab_id", tab.id)
          .order("sort_order")
          .order("created_at"),
        supabase
          .from("customer_tab_payments")
          .select("id, amount, note, created_at")
          .eq("tab_id", tab.id)
          .order("created_at", { ascending: false }),
      ]);
      return {
        tab,
        items: (items.data ?? []) as TabItem[],
        payments: (payments.data ?? []) as TabPayment[],
      };
    },
  });

  if (!userId)
    return (
      <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        سجّل دخولك حتى تشوف «قائمتي» الخاصة بك مع {providerName}.
      </p>
    );

  if (isLoading)
    return <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">جاري التحميل…</p>;

  if (!data)
    return (
      <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        ما عندك «قائمتي» مع {providerName} بعد. اتفق مع المحل حتى يفتح لك قائمة بمواد وأسعار متفق
        عليها.
      </p>
    );

  const totals = computeTabTotals(data.items, Number(data.tab.delivery_fee), data.payments);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <h3 className="mb-3 flex items-center gap-2 font-bold">
          <ClipboardList className="size-4 text-primary" /> مواد قائمتي
        </h3>
        {data.items.length ? (
          <ul className="divide-y divide-border">
            {data.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(i.quantity)} × {formatIQD(Number(i.unit_price))}
                    {i.note ? ` · ${i.note}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-bold text-primary">{formatIQD(lineTotal(i))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">ما توجد مواد بالقائمة حالياً.</p>
        )}
      </div>

      <div className="space-y-2 rounded-2xl bg-card p-4 text-sm shadow-soft">
        <Row label="مجموع المواد" value={formatIQD(totals.itemsTotal)} />
        <Row
          label={
            <span className="flex items-center gap-1">
              <Truck className="size-3.5" /> رسوم التوصيل (منفصلة)
            </span>
          }
          value={formatIQD(totals.deliveryFee)}
        />
        <div className="border-t border-border pt-2">
          <Row label="المجموع المستحق" value={formatIQD(totals.grandTotal)} bold />
        </div>
        <Row label="المبلغ المستحصل" value={formatIQD(totals.paid)} />
        <Row label="المبلغ المتبقي" value={formatIQD(totals.remaining)} bold />
        <p
          className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${
            totals.settled ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground"
          }`}
        >
          {tabStatusLabel(totals)}
        </p>
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <h3 className="mb-3 flex items-center gap-2 font-bold">
          <Wallet className="size-4 text-primary" /> سجل الدفعات
        </h3>
        {data.payments.length ? (
          <ul className="divide-y divide-border">
            {paymentsWithRemaining(data.payments, totals.grandTotal).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString("ar-IQ-u-nu-latn")}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <span className="text-end">
                  <span className="block font-bold text-success">
                    {formatIQD(Number(p.amount))}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    المتبقي بعدها: {formatIQD(p.remainingAfter)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">ما توجد دفعات مسجلة بعد.</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: React.ReactNode; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-bold" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-black text-primary" : "font-semibold"}>{value}</span>
    </div>
  );
}
