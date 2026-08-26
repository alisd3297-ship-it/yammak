import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIQD } from "@/lib/orders";
import { computeTabTotals, lineTotal, tabStatusLabel, type TabItem, type TabPayment } from "@/lib/customer-tabs";
import { listProviderTabs, openCustomerTab } from "@/lib/customer-tabs.functions";

/** «قوائم الزبائن» في لوحة التاجر — إدارة المواد والتوصيل والدفعات لكل زبون. */
export function ProviderCustomerTabs({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const fetchTabs = useServerFn(listProviderTabs);
  const addCustomer = useServerFn(openCustomerTab);
  const [phone, setPhone] = useState("");
  const [openTab, setOpenTab] = useState<string | null>(null);

  const { data: tabs } = useQuery({
    queryKey: ["provider-tabs", providerId],
    queryFn: () => fetchTabs({ data: { providerId } }),
  });

  const create = useMutation({
    mutationFn: (value: string) => addCustomer({ data: { providerId, phone: value } }),
    onSuccess: (res) => {
      toast.success(`فتحنا قائمة للزبون ${res.customerName}`);
      setPhone("");
      setOpenTab(res.tabId);
      qc.invalidateQueries({ queryKey: ["provider-tabs", providerId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر فتح القائمة"),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <h3 className="mb-3 flex items-center gap-2 font-bold">
          <UserPlus className="size-4 text-primary" /> فتح «قائمتي» لزبون
        </h3>
        <div className="flex gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="رقم هاتف الزبون"
            inputMode="tel"
            className="h-11"
          />
          <Button
            className="h-11"
            disabled={create.isPending || phone.trim().length < 7}
            onClick={() => create.mutate(phone)}
          >
            فتح
          </Button>
        </div>
      </div>

      {(tabs ?? []).map((t) => {
        const totals = computeTabTotals(
          [{ quantity: 1, unit_price: t.itemsTotal }],
          t.deliveryFee,
          [{ amount: t.paid }],
        );
        return (
          <div key={t.tabId} className="rounded-2xl bg-card shadow-soft">
            <button
              className="flex w-full items-center justify-between p-4 text-start"
              onClick={() => setOpenTab((cur) => (cur === t.tabId ? null : t.tabId))}
            >
              <div className="min-w-0">
                <p className="truncate font-bold">{t.customerName}</p>
                <p className="text-xs text-muted-foreground">{t.phone ?? "بدون رقم"}</p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-bold text-primary">{formatIQD(totals.remaining)}</p>
                <p className="text-[11px] text-muted-foreground">{tabStatusLabel(totals)}</p>
              </div>
              <ChevronDown className={`ms-2 size-4 transition ${openTab === t.tabId ? "rotate-180" : ""}`} />
            </button>
            {openTab === t.tabId && (
              <div className="border-t border-border p-4">
                <TabEditor tabId={t.tabId} providerId={providerId} />
              </div>
            )}
          </div>
        );
      })}

      {!tabs?.length && (
        <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          ما فتحت قوائم لزبائنك بعد. أضف زبوناً برقم هاتفه للبدء.
        </p>
      )}
    </div>
  );
}

function TabEditor({ tabId, providerId }: { tabId: string; providerId: string }) {
  const qc = useQueryClient();
  const [item, setItem] = useState({ name: "", quantity: "1", price: "" });
  const [fee, setFee] = useState<string | null>(null);
  const [payment, setPayment] = useState({ amount: "", note: "" });

  const { data } = useQuery({
    queryKey: ["provider-tab-detail", tabId],
    queryFn: async () => {
      const [tab, items, payments] = await Promise.all([
        supabase.from("customer_tabs").select("id, delivery_fee, note").eq("id", tabId).maybeSingle(),
        supabase
          .from("customer_tab_items")
          .select("id, name, quantity, unit_price, note")
          .eq("tab_id", tabId)
          .order("created_at"),
        supabase
          .from("customer_tab_payments")
          .select("id, amount, note, created_at")
          .eq("tab_id", tabId)
          .order("created_at", { ascending: false }),
      ]);
      return {
        deliveryFee: Number(tab.data?.delivery_fee ?? 0),
        items: (items.data ?? []) as TabItem[],
        payments: (payments.data ?? []) as TabPayment[],
      };
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["provider-tab-detail", tabId] });
    qc.invalidateQueries({ queryKey: ["provider-tabs", providerId] });
  }

  const totals = computeTabTotals(data?.items ?? [], data?.deliveryFee ?? 0, data?.payments ?? []);

  async function addItem() {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.price);
    if (!item.name.trim() || !(quantity > 0) || !(unitPrice >= 0)) {
      toast.error("اكتب اسم المادة وكمية وسعر صحيح");
      return;
    }
    const { error } = await supabase
      .from("customer_tab_items")
      .insert({ tab_id: tabId, name: item.name.trim(), quantity, unit_price: unitPrice });
    if (error) { toast.error("تعذر إضافة المادة"); return; }
    setItem({ name: "", quantity: "1", price: "" });
    refresh();
  }

  async function updateItem(id: string, patch: { quantity?: number; unit_price?: number }) {
    const { error } = await supabase.from("customer_tab_items").update(patch).eq("id", id);
    if (error) { toast.error("تعذر تعديل المادة"); return; }
    refresh();
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("customer_tab_items").delete().eq("id", id);
    if (error) { toast.error("تعذر حذف المادة"); return; }
    refresh();
  }

  async function saveFee() {
    const value = Number(fee);
    if (!(value >= 0)) { toast.error("رسوم توصيل غير صحيحة"); return; }
    const { error } = await supabase.from("customer_tabs").update({ delivery_fee: value }).eq("id", tabId);
    if (error) { toast.error("تعذر تحديث رسوم التوصيل"); return; }
    setFee(null);
    refresh();
  }

  async function addPayment() {
    const amount = Number(payment.amount);
    if (!(amount > 0)) { toast.error("اكتب مبلغاً صحيحاً"); return; }
    if (amount > totals.remaining + 0.0001) { toast.error("المبلغ أكبر من المتبقي"); return; }
    const { error } = await supabase.from("customer_tab_payments").insert({
      tab_id: tabId,
      amount,
      note: payment.note.trim() || null,
    });
    if (error) { toast.error("تعذر تسجيل الدفعة"); return; }
    setPayment({ amount: "", note: "" });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {(data?.items ?? []).map((i) => (
          <div key={i.id} className="flex items-center gap-2 rounded-xl bg-muted/40 p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{i.name}</p>
              <p className="text-[11px] text-muted-foreground">{formatIQD(lineTotal(i))}</p>
            </div>
            <Input
              defaultValue={String(Number(i.quantity))}
              onBlur={(e) => {
                const q = Number(e.target.value);
                if (q > 0 && q !== Number(i.quantity)) updateItem(i.id, { quantity: q });
              }}
              className="h-9 w-16 text-center"
              inputMode="decimal"
              aria-label="الكمية"
            />
            <Input
              defaultValue={String(Number(i.unit_price))}
              onBlur={(e) => {
                const p = Number(e.target.value);
                if (p >= 0 && p !== Number(i.unit_price)) updateItem(i.id, { unit_price: p });
              }}
              className="h-9 w-24 text-center"
              inputMode="decimal"
              aria-label="سعر الوحدة"
            />
            <Button size="icon" variant="ghost" className="size-9" onClick={() => removeItem(i.id)} aria-label="حذف">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={item.name}
          onChange={(e) => setItem({ ...item, name: e.target.value })}
          placeholder="اسم المادة"
          className="h-10 flex-1"
        />
        <Input
          value={item.quantity}
          onChange={(e) => setItem({ ...item, quantity: e.target.value })}
          placeholder="كمية"
          inputMode="decimal"
          className="h-10 w-16 text-center"
        />
        <Input
          value={item.price}
          onChange={(e) => setItem({ ...item, price: e.target.value })}
          placeholder="السعر"
          inputMode="decimal"
          className="h-10 w-24 text-center"
        />
        <Button size="icon" className="size-10" onClick={addItem} aria-label="إضافة مادة">
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">مجموع المواد</span>
          <span className="font-bold">{formatIQD(totals.itemsTotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">رسوم التوصيل (منفصلة)</span>
          <div className="flex items-center gap-2">
            <Input
              value={fee ?? String(data?.deliveryFee ?? 0)}
              onChange={(e) => setFee(e.target.value)}
              inputMode="decimal"
              className="h-9 w-24 text-center"
              aria-label="رسوم التوصيل"
            />
            {fee !== null && (
              <Button size="sm" className="h-9" onClick={saveFee}>
                حفظ
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-bold">المجموع المستحق</span>
          <span className="font-black text-primary">{formatIQD(totals.grandTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">المبلغ المستحصل</span>
          <span className="font-semibold text-success">{formatIQD(totals.paid)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold">المبلغ المتبقي</span>
          <span className="font-black text-primary">{formatIQD(totals.remaining)}</span>
        </div>
        <p
          className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
            totals.settled ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground"
          }`}
        >
          {tabStatusLabel(totals)}
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={payment.amount}
          onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
          placeholder="المبلغ المستحصل"
          inputMode="decimal"
          className="h-10 w-32"
        />
        <Input
          value={payment.note}
          onChange={(e) => setPayment({ ...payment, note: e.target.value })}
          placeholder="ملاحظة (اختياري)"
          className="h-10 flex-1"
        />
        <Button className="h-10" onClick={addPayment} disabled={totals.remaining <= 0}>
          تسجيل دفعة
        </Button>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold text-muted-foreground">سجل الدفعات</p>
        {(data?.payments ?? []).length ? (
          <ul className="divide-y divide-border">
            {(data?.payments ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString("ar-IQ-u-nu-latn")}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <span className="font-bold text-success">{formatIQD(Number(p.amount))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">ما توجد دفعات.</p>
        )}
      </div>
    </div>
  );
}
