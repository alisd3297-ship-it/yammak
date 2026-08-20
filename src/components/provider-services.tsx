import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PRICE_UNIT_LABELS, formatServicePrice, type ServicePriceUnit } from "@/lib/services";

const UNITS: ServicePriceUnit[] = ["fixed", "hourly", "daily", "visit", "negotiable"];

/** إدارة خدمات وأسعار مقدم الخدمة المهني — الكتابة محكومة بـ RLS على المالك فقط. */
export function ProviderServices({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", price: "", unit: "fixed" as ServicePriceUnit, description: "" });

  const { data: services } = useQuery({
    queryKey: ["provider-services", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_services")
        .select("id, name, description, price_amount, price_unit, is_active")
        .eq("provider_id", providerId)
        .order("sort_order");
      return data ?? [];
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
    const { error } = await supabase.from("provider_services").insert({
      provider_id: providerId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_amount: price,
      price_unit: form.unit,
      sort_order: (services?.length ?? 0) + 1,
    });
    if (error) {
      toast.error("تعذر إضافة الخدمة");
      return;
    }
    setForm({ name: "", price: "", unit: "fixed", description: "" });
    refresh();
  }

  async function patch(id: string, values: { price_amount?: number; is_active?: boolean }) {
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
            placeholder="السعر بالدينار"
            inputMode="numeric"
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
        <Button className="h-11 w-full" onClick={addService}>
          <Plus className="size-4" /> إضافة
        </Button>
      </section>

      <section className="space-y-3">
        {(services ?? []).map((s) => (
          <article key={s.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">{s.name}</p>
              <button onClick={() => remove(s.id)} aria-label="حذف الخدمة" className="text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{s.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatServicePrice(Number(s.price_amount), s.price_unit as ServicePriceUnit)}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Input
                defaultValue={String(Number(s.price_amount))}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0 && v !== Number(s.price_amount))
                    patch(s.id, { price_amount: v });
                }}
                inputMode="numeric"
                aria-label="تعديل السعر"
                className="h-10 w-32"
              />
              <div className="flex items-center gap-2 text-xs">
                <Switch checked={s.is_active} onCheckedChange={(v) => patch(s.id, { is_active: v })} />
                {s.is_active ? "مفعّلة" : "متوقفة"}
              </div>
            </div>
          </article>
        ))}
        {!services?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ما أضفت خدمات بعد.</p>
        )}
      </section>
    </div>
  );
}
