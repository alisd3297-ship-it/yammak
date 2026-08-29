import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { normalizeArabic } from "@/lib/search";
import { AD_CURRENCIES, adCurrency, type AdCurrency } from "@/lib/ads";
import {
  PRICE_UNIT_LABELS,
  formatServicePrice,
  type ServicePriceUnit,
} from "@/lib/services";

const UNITS: ServicePriceUnit[] = ["fixed", "hourly", "daily", "visit", "negotiable"];

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price_amount: number;
  currency: string | null;
  price_unit: string;
  is_active: boolean;
};

/**
 * «خدماتي» لأصحاب المهن: اسم الخدمة، سعر اختياري، والتوفر — بلا كتالوج منتجات
 * وبلا أي حقل تكلفة. الكتابة محكومة بـ RLS على المالك فقط.
 */
export function ProviderServices({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    price: "",
    currency: "IQD" as AdCurrency,
    unit: "fixed" as ServicePriceUnit,
    description: "",
  });

  const { data: services } = useQuery({
    queryKey: ["provider-services", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_services")
        .select("id, name, description, price_amount, currency, price_unit, is_active")
        .eq("provider_id", providerId)
        .order("sort_order");
      return (data ?? []) as ServiceRow[];
    },
  });

  const visible = useMemo(() => {
    const q = normalizeArabic(term);
    if (!q) return services ?? [];
    return (services ?? []).filter((s) =>
      normalizeArabic(`${s.name} ${s.description ?? ""}`).includes(q),
    );
  }, [services, term]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["provider-services", providerId] });
  }

  async function addService() {
    if (!form.name.trim()) {
      toast.error("اكتب اسم الخدمة");
      return;
    }
    // السعر اختياري: بدون قيمة يُحفظ صفراً ويُعرض «حسب الاتفاق»
    const raw = form.price.trim();
    const price = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("سعر الخدمة غير صحيح");
      return;
    }
    const unit: ServicePriceUnit = raw === "" ? "negotiable" : form.unit;
    const { error } = await supabase.from("provider_services").insert({
      provider_id: providerId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_amount: unit === "negotiable" ? 0 : price,
      currency: form.currency,
      price_unit: unit,
      sort_order: (services?.length ?? 0) + 1,
    });
    if (error) {
      toast.error(`تعذر إضافة الخدمة: ${error.message}`);
      return;
    }
    toast.success("تمت إضافة الخدمة");
    setForm({ name: "", price: "", currency: form.currency, unit: "fixed", description: "" });
    refresh();
  }

  type Patch = {
    name?: string;
    description?: string | null;
    price_amount?: number;
    price_unit?: ServicePriceUnit;
    currency?: AdCurrency;
    is_active?: boolean;
  };

  async function patch(id: string, values: Patch) {
    const { error } = await supabase.from("provider_services").update(values).eq("id", id);
    if (error) {
      toast.error(`تعذر حفظ التعديل: ${error.message}`);
      return false;
    }
    refresh();
    return true;
  }

  async function duplicate(s: ServiceRow) {
    const { error } = await supabase.from("provider_services").insert({
      provider_id: providerId,
      name: `${s.name} (نسخة)`,
      description: s.description,
      price_amount: s.price_amount,
      currency: s.currency ?? "IQD",
      price_unit: s.price_unit,
      sort_order: (services?.length ?? 0) + 1,
    });
    if (error) {
      toast.error("تعذر نسخ الخدمة");
      return;
    }
    refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("provider_services").delete().eq("id", id);
    if (error) toast.error("تعذر حذف الخدمة");
    else refresh();
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl bg-card p-4 shadow-soft">
        <h3 className="text-sm font-black">إضافة خدمة</h3>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="اسم الخدمة (مثال: تصليح تسريب ماء)"
          className="h-11"
        />
        <div className="flex gap-2">
          <Input
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="السعر (اختياري)"
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
          <select
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value as AdCurrency })}
            aria-label="العملة"
            className="h-11 rounded-md border border-input bg-background px-2 text-sm"
          >
            {AD_CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
              </option>
            ))}
          </select>
        </div>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="وصف مختصر (اختياري)"
          rows={2}
        />
        <p className="text-[11px] text-muted-foreground">
          إذا تركت السعر فارغاً تُعرض الخدمة «حسب الاتفاق» وتقدر تتفق مع الزبون.
        </p>
        <Button className="h-12 w-full text-base font-black" onClick={addService}>
          <Plus className="size-5" /> إضافة الخدمة
        </Button>
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="ابحث في خدماتك"
          className="h-11 pe-10"
          aria-label="بحث في الخدمات"
        />
      </div>

      <section className="space-y-2">
        {visible.map((s) => {
          const cur = adCurrency(s.currency);
          return (
            <article key={s.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                  <p className="mt-1 text-sm font-bold text-primary">
                    {formatServicePrice(
                      Number(s.price_amount),
                      s.price_unit as ServicePriceUnit,
                      cur,
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Switch
                    checked={s.is_active}
                    onCheckedChange={(v) => void patch(s.id, { is_active: v })}
                    aria-label="توفر الخدمة"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {s.is_active ? "متاحة" : "موقوفة"}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="h-9 flex-1"
                  onClick={() => setEditing(editing === s.id ? null : s.id)}
                >
                  <Pencil className="size-4" /> {editing === s.id ? "إغلاق" : "تعديل"}
                </Button>
                <Button variant="outline" className="h-9" onClick={() => void duplicate(s)}>
                  <Copy className="size-4" /> نسخ
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 text-destructive"
                  onClick={() => void remove(s.id)}
                  aria-label="حذف الخدمة"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {editing === s.id && (
                <EditService
                  service={s}
                  onSave={async (values) => {
                    const ok = await patch(s.id, values);
                    if (ok) {
                      toast.success("تم حفظ التعديلات");
                      setEditing(null);
                    }
                  }}
                />
              )}
            </article>
          );
        })}
        {!visible.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            {services?.length ? "ماكو نتائج للبحث." : "ما أضفت خدمات بعد."}
          </p>
        )}
      </section>
    </div>
  );
}

function EditService({
  service,
  onSave,
}: {
  service: ServiceRow;
  onSave: (values: {
    name: string;
    description: string | null;
    price_amount: number;
    price_unit: ServicePriceUnit;
    currency: AdCurrency;
  }) => void;
}) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [price, setPrice] = useState(
    service.price_unit === "negotiable" ? "" : String(Number(service.price_amount)),
  );
  const [unit, setUnit] = useState<ServicePriceUnit>(service.price_unit as ServicePriceUnit);
  const [currency, setCurrency] = useState<AdCurrency>(adCurrency(service.currency));

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-10"
        aria-label="اسم الخدمة"
      />
      <div className="flex gap-2">
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="السعر (اختياري)"
          inputMode="numeric"
          disabled={unit === "negotiable"}
          className="h-10 flex-1"
          aria-label="سعر الخدمة"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as ServicePriceUnit)}
          aria-label="وحدة التسعير"
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {PRICE_UNIT_LABELS[u]}
            </option>
          ))}
        </select>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as AdCurrency)}
          aria-label="العملة"
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {AD_CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value}
            </option>
          ))}
        </select>
      </div>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="وصف مختصر (اختياري)"
        rows={2}
      />
      <Button
        className="h-10 w-full"
        onClick={() => {
          if (!name.trim()) {
            toast.error("اكتب اسم الخدمة");
            return;
          }
          const raw = price.trim();
          const value = raw === "" ? 0 : Number(raw);
          if (!Number.isFinite(value) || value < 0) {
            toast.error("سعر الخدمة غير صحيح");
            return;
          }
          const nextUnit: ServicePriceUnit = raw === "" ? "negotiable" : unit;
          onSave({
            name: name.trim(),
            description: description.trim() || null,
            price_amount: nextUnit === "negotiable" ? 0 : value,
            price_unit: nextUnit,
            currency,
          });
        }}
      >
        حفظ التعديلات
      </Button>
    </div>
  );
}
