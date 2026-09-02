import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { requireStaff } from "@/lib/route-guards";
import { useTheme } from "@/lib/theme";
import {
  BRAND_PRESETS,
  BRAND_SETTINGS_KEY,
  DEFAULT_BRAND,
  isValidHex,
  normalizeHex,
  type BrandTheme,
} from "@/lib/brand-theme";

export const Route = createFileRoute("/admin/theme")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "ألوان التطبيق | لبابك" },
      {
        name: "description",
        content: "تغيير نظام ألوان تطبيق لبابك مباشرة من لوحة الإدارة بدون تعديل الكود.",
      },
      { property: "og:title", content: "ألوان التطبيق | لبابك" },
      { property: "og:description", content: "تحكم كامل بهوية ألوان لبابك من داخل التطبيق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminThemePage,
});

const FIELDS = [
  { key: "primary", label: "اللون الرئيسي" },
  { key: "secondary", label: "اللون الثانوي (الداكن)" },
  { key: "background", label: "لون الخلفية" },
  { key: "primaryForeground", label: "لون النص فوق الرئيسي" },
] as const;

function AdminThemePage() {
  const qc = useQueryClient();
  const { brand, applyBrandPreview } = useTheme();
  const [draft, setDraft] = useState<BrandTheme>(brand);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(brand);
  }, [brand]);

  function preview(next: BrandTheme) {
    setDraft(next);
    applyBrandPreview(next);
  }

  function setField(key: keyof BrandTheme, value: string) {
    if (!isValidHex(value)) {
      setDraft((d) => ({ ...d, [key]: value }));
      return;
    }
    preview({ ...draft, [key]: normalizeHex(value), preset: "custom" });
  }

  async function save() {
    const invalid = FIELDS.find((f) => !isValidHex(draft[f.key]));
    if (invalid) {
      toast.error(`قيمة غير صحيحة في «${invalid.label}»`);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: BRAND_SETTINGS_KEY, value: draft }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("تعذّر حفظ الألوان: " + error.message);
      return;
    }
    applyBrandPreview(draft);
    void qc.invalidateQueries({ queryKey: ["admin-app-settings"] });
    toast.success("تم حفظ نظام الألوان لكل المستخدمين");
  }

  return (
    <PageShell>
      <AdminNav />
      <header className="space-y-1 px-4 pt-4">
        <h1 className="text-xl font-extrabold">ألوان التطبيق</h1>
        <p className="text-sm text-muted-foreground">
          غيّر هوية ألوان لبابك مباشرة بدون تعديل الكود.
        </p>
      </header>

      <section className="space-y-3 px-4 pt-4">
        <h2 className="text-base font-bold">أنماط جاهزة</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => preview({ ...p })}
              className={`rounded-2xl border p-3 text-right transition ${
                draft.preset === p.id ? "border-primary ring-2 ring-ring" : "border-border"
              }`}
            >
              <div className="mb-2 flex gap-1">
                <span
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ background: p.primary }}
                />
                <span
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ background: p.secondary }}
                />
                <span
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ background: p.background }}
                />
              </div>
              <span className="text-sm font-semibold">{p.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 px-4 pt-4">
        <h2 className="text-base font-bold">ألوان مخصصة</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`c-${f.key}`}>{f.label}</Label>
              <div className="flex items-center gap-2">
                <input
                  id={`c-${f.key}`}
                  type="color"
                  value={isValidHex(draft[f.key]) ? normalizeHex(draft[f.key]) : "#000000"}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
                />
                <Input
                  dir="ltr"
                  value={draft[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 px-4 pt-4">
        <h2 className="text-base font-bold">معاينة</h2>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="mb-3 text-sm text-muted-foreground">
            هكذا ستظهر العناصر بعد اعتماد الألوان.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button>زر رئيسي</Button>
            <Button variant="secondary">زر ثانوي</Button>
            <Button variant="outline">زر محدد</Button>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              شارة
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 px-4 pt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? "جارٍ الحفظ…" : "حفظ ونشر للجميع"}
        </Button>
        <Button variant="outline" onClick={() => preview({ ...DEFAULT_BRAND })}>
          استعادة الافتراضي
        </Button>
      </div>
    </PageShell>
  );
}
