import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AD_CURRENCIES, adCurrency, type AdCurrency } from "@/lib/ads";
import {
  PRICE_UNIT_LABELS,
  formatServiceMoney,
  formatServicePrice,
  type ServicePriceUnit,
} from "@/lib/services";

const UNITS: ServicePriceUnit[] = ["fixed", "hourly", "daily", "visit", "negotiable"];

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price_amount: number;
  cost_amount: number | null;
  currency: string | null;
  price_unit: string;
  is_active: boolean;
};

/** إدارة خدمات وأسعار وتكاليف مقدم الخدمة المهني — الكتابة محكومة بـ RLS على المالك فقط. */
export function ProviderServices({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    price: "",
    cost: "",
    currency: "IQD" as AdCurrency,
    unit: "fixed" as ServicePriceUnit,
    description: "",
  });

  const { data: services } = useQuery({
    queryKey: ["provider-services", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_services")
        .select("id, name, description, price_amount, cost_amount, currency, price_unit, is_active")
        .eq("provider_id", providerId)
        .order("sort_order");
      return (data ?? []) as ServiceRow[];
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["provider-services", providerId] });
  }

  async function addService() {
    const price = form.unit === "negotiable" ? 0 : Number(form.price);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) {
      toast.error("اكتب اسم الخدمة وسعراً صحيحاً");
      return;
    }
    const costRaw = form.cost.trim();
    let cost: number | null = null;
    if (costRaw) {
      const parsed = Number(costRaw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("تكلفة الخدمة غير صحيحة");
        return;
      }
      cost = parsed;
    }
    const { error } = await supabase.from("provider_services").insert({
      provider_id: providerId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_amount: price,
      cost_amount: cost,
      currency: form.currency,
      price_unit: form.unit,
      sort_order: (services?.length ?? 0) + 1,
    });
    if (error) {
      toast.error("تعذر إضافة الخدمة");
      return;
    }
    setForm({ name: "", price: "", cost: "", currency: "IQD", unit: "fixed", description: "" });
    refresh();
  }

  async function patch(
    id: string,
    values: {
      price_amount?: number;
      cost_amount?: number | null;
      currency?: AdCurrency;
      is_active?: boolean;
    },
  ) {
    const { error } = await supabase.from("provider_services").update(values).eq("id", id);
    if (error) toast.error("تعذر حفظ التعديل");
    else refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("provider_services").delete().eq("id", id);
    if (error) toast.error("تعذر حذف الخدمة");
    else refresh();
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
        <h3 className="text-sm font-bold">إضافة خدمة</h3>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="اسم الخدمة (مثال: تصليح تسريب ماء)"
          className="h-11"
        />
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="وصف مختصر"
          className="h-11"
        />
        <div className="flex gap-2">
          <Input
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="سعر الخدمة"
            inputMode="numeric"
            aria-label="سعر الخدمة"
            disabled={form.unit === "negotiable"}
            className="h-11 flex-1"
          />
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value as ServicePriceUnit })}
            aria-label="وحدة التسعير"
            className="h-11 rounded-md border border-input bg-background px-2 text-sm"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {PRICE_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="service-cost" className="text-xs text-muted-foreground">
              تكلفة الخدمة (اختياري)
            </Label>
            <Input
              id="service-cost"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              placeholder="تكلفتك الفعلية"
              inputMode="numeric"
              className="h-11"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="service-currency" className="text-xs text-muted-foreground">
              العملة
            </Label>
            <select
              id="service-currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value as AdCurrency })}
              className="h-11 rounded-md border border-input bg-background px-2 text-sm"
            >
              {AD_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          التكلفة تُحفظ منفصلة عن سعر البيع وبنفس عملة السعر، وتُستخدم في حساب الربح فقط.
        </p>
        <Button className="h-11 w-full" onClick={addService}>
          <Plus className="size-4" /> إضافة
        </Button>
      </section>

      <section className="space-y-3">
        {(services ?? []).map((s) => {
          const cur = adCurrency(s.currency);
          const profit =
            s.cost_amount != null ? Number(s.price_amount) - Number(s.cost_amount) : null;
          return (
            <article key={s.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{s.name}</p>
                <button
                  onClick={() => remove(s.id)}
                  aria-label="حذف الخدمة"
                  className="text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatServicePrice(Number(s.price_amount), s.price_unit as ServicePriceUnit, cur)}
                {s.cost_amount != null
                  ? ` · التكلفة ${formatServiceMoney(Number(s.cost_amount), cur)}`
                  : " · بدون تكلفة مسجّلة"}
                {profit != null ? ` · الربح ${formatServiceMoney(profit, cur)}` : ""}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`price-${s.id}`} className="text-[11px] text-muted-foreground">
                    سعر الخدمة
                  </Label>
                  <Input
                    id={`price-${s.id}`}
                    defaultValue={String(Number(s.price_amount))}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0 && v !== Number(s.price_amount))
                        patch(s.id, { price_amount: v });
                    }}
                    inputMode="numeric"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`cost-${s.id}`} className="text-[11px] text-muted-foreground">
                    تكلفة الخدمة
                  </Label>
                  <Input
                    id={`cost-${s.id}`}
                    defaultValue={s.cost_amount == null ? "" : String(Number(s.cost_amount))}
                    placeholder="اختياري"
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === "") {
                        if (s.cost_amount != null) patch(s.id, { cost_amount: null });
                        return;
                      }
                      const v = Number(raw);
                      if (!Number.isFinite(v) || v < 0) {
                        toast.error("تكلفة الخدمة غير صحيحة");
                        return;
                      }
                      if (s.cost_amount == null || v !== Number(s.cost_amount))
                        patch(s.id, { cost_amount: v });
                    }}
                    inputMode="numeric"
                    className="h-10"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`cur-${s.id}`} className="text-[11px] text-muted-foreground">
                    العملة (للسعر والتكلفة)
                  </Label>
                  <select
                    id={`cur-${s.id}`}
                    value={cur}
                    onChange={(e) => patch(s.id, { currency: e.target.value as AdCurrency })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {AD_CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={s.is_active}
                    onCheckedChange={(v) => patch(s.id, { is_active: v })}
                  />
                  {s.is_active ? "مفعّلة" : "متوقفة"}
                </div>
              </div>
            </article>
          );
        })}
        {!services?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ما أضفت خدمات بعد.
          </p>
        )}
      </section>
    </div>
  );
}
