import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPinned } from "lucide-react";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { requireStaff } from "@/lib/route-guards";
import { mapZone, type DeliveryZone } from "@/lib/delivery-zones";

export const Route = createFileRoute("/admin/zones")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "مناطق التوصيل | إدارة لبابك" },
      {
        name: "description",
        content:
          "إدارة مناطق التوصيل الذكية: الرسوم الأساسية، سعر الكيلومتر، وقت الوصول، ومعامل الذروة.",
      },
      { property: "og:title", content: "مناطق التوصيل | إدارة لبابك" },
      { property: "og:description", content: "تسعير وتقدير وصول لكل منطقة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminZonesPage,
});

function AdminZonesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: zones } = useQuery({
    queryKey: ["admin-zones"],
    queryFn: async (): Promise<DeliveryZone[]> => {
      const { data } = await supabase.from("delivery_zones").select("*").order("sort_order");
      return (data ?? []).map(mapZone);
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-zones"] });
    void qc.invalidateQueries({ queryKey: ["delivery-zones"] });
  };

  async function addZone() {
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    const { error } = await supabase.from("delivery_zones").insert({ name: name.trim() });
    setBusy(false);
    if (error) toast.error("تعذر إضافة المنطقة");
    else {
      toast.success("تمت الإضافة");
      setName("");
      refresh();
    }
  }

  type ZonePatch = Partial<{
    base_fee: number;
    per_km_fee: number;
    min_fee: number;
    max_fee: number;
    eta_min_minutes: number;
    eta_max_minutes: number;
    radius_km: number;
    surge_multiplier: number;
    is_active: boolean;
  }>;

  async function patch(id: string, patchData: ZonePatch) {
    const { error } = await supabase.from("delivery_zones").update(patchData).eq("id", id);
    if (error) toast.error("تعذر التحديث");
    else refresh();
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground">
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <MapPinned className="size-6" /> مناطق التوصيل
        </h1>
        <p className="mt-1 text-sm opacity-90">تسعير ذكي ووقت وصول متوقع لكل منطقة</p>
      </header>
      <AdminNav />

      <div className="space-y-4 px-4 py-5">
        <section className="flex gap-2 rounded-2xl bg-card p-3 shadow-soft">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 flex-1"
            placeholder="اسم منطقة جديدة"
            aria-label="اسم المنطقة"
          />
          <Button className="h-11" disabled={busy} onClick={() => void addZone()}>
            إضافة
          </Button>
        </section>

        {(zones ?? []).map((z) => (
          <section key={z.id} className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">{z.name}</h2>
              <Button
                variant={z.isActive ? "outline" : "default"}
                className="h-9 px-3 text-xs"
                onClick={() => void patch(z.id, { is_active: !z.isActive })}
              >
                {z.isActive ? "إيقاف" : "تفعيل"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <NumberField
                label="رسوم الأساس"
                value={z.baseFee}
                onSave={(v) => void patch(z.id, { base_fee: v })}
              />
              <NumberField
                label="سعر الكيلومتر"
                value={z.perKmFee}
                onSave={(v) => void patch(z.id, { per_km_fee: v })}
              />
              <NumberField
                label="أقل رسوم"
                value={z.minFee}
                onSave={(v) => void patch(z.id, { min_fee: v })}
              />
              <NumberField
                label="أعلى رسوم"
                value={z.maxFee}
                onSave={(v) => void patch(z.id, { max_fee: v })}
              />
              <NumberField
                label="أقل وقت وصول (دقيقة)"
                value={z.etaMinMinutes}
                onSave={(v) => void patch(z.id, { eta_min_minutes: v })}
              />
              <NumberField
                label="أعلى وقت وصول (دقيقة)"
                value={z.etaMaxMinutes}
                onSave={(v) => void patch(z.id, { eta_max_minutes: v })}
              />
              <NumberField
                label="نصف قطر المنطقة (كم)"
                value={z.radiusKm}
                onSave={(v) => void patch(z.id, { radius_km: v })}
              />
              <NumberField
                label="معامل الذروة"
                value={z.surgeMultiplier}
                step={0.05}
                onSave={(v) => void patch(z.id, { surge_multiplier: v })}
              />
            </div>
          </section>
        ))}
        {!zones?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ماكو مناطق مضافة بعد.
          </p>
        )}
      </div>
    </PageShell>
  );
}

function NumberField({
  label,
  value,
  step,
  onSave,
}: {
  label: string;
  value: number;
  step?: number;
  onSave: (value: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  return (
    <label className="block">
      <span className="mb-1 block font-bold text-muted-foreground">{label}</span>
      <Input
        type="number"
        step={step ?? 1}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const next = Number(local);
          if (Number.isFinite(next) && next !== value) onSave(next);
        }}
        className="h-10"
      />
    </label>
  );
}
