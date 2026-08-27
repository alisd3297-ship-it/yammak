import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { requireStaff } from "@/lib/route-guards";

export const Route = createFileRoute("/admin/settings")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "إعدادات النظام | لبابك" },
      {
        name: "description",
        content:
          "إعدادات منصة لبابك العامة ومفاتيح الميزات وسجل التدقيق وإدارة الإعلانات في مكان واحد.",
      },
      { property: "og:title", content: "إعدادات النظام | لبابك" },
      { property: "og:description", content: "الإعدادات العامة لمنصة لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSettingsPage,
});

const LINKS = [
  { to: "/admin/features", label: "مفاتيح الميزات", hint: "تفعيل أو إيقاف ميزات المنصة" },
  { to: "/admin/audit", label: "سجل التدقيق", hint: "كل إجراءات الإدارة" },
  { to: "/admin/ads", label: "الإعلانات", hint: "مراجعة ونشر الإعلانات" },
  { to: "/admin/courier", label: "التوصيل والمندوب المستقل", hint: "متابعة طلبات التوصيل الخاص" },
] as const;

function AdminSettingsPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-app-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value, updated_at")
        .order("key");
      return data ?? [];
    },
  });

  async function save(key: string, raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error("القيمة يجب أن تكون بصيغة JSON صحيحة");
      return;
    }
    const { error } = await supabase
      .from("app_settings")
      .update({ value: parsed as never, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) {
      toast.error("تعذر حفظ الإعداد، تأكد من صلاحيتك");
      return;
    }
    toast.success("تم حفظ الإعداد");
    qc.invalidateQueries({ queryKey: ["admin-app-settings"] });
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">الإعدادات</h1>
        <p className="mt-1 text-sm opacity-90">الإعدادات العامة للنظام وروابط الأدوات الإدارية.</p>
      </header>

      <AdminNav />

      <section className="space-y-2 px-4 pt-5">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="block rounded-2xl bg-card p-4 shadow-soft">
            <p className="font-bold text-primary">{l.label}</p>
            <p className="text-xs text-muted-foreground">{l.hint}</p>
          </Link>
        ))}
      </section>

      <section className="px-4 py-5">
        <h2 className="mb-3 text-base font-black">إعدادات النظام</h2>
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        <div className="space-y-3">
          {(settings ?? []).map((s) => {
            const current = drafts[s.key] ?? JSON.stringify(s.value, null, 2);
            return (
              <article key={s.key} className="rounded-2xl bg-card p-4 shadow-soft">
                <p className="font-bold">{s.key}</p>
                <Textarea
                  className="mt-2 font-mono text-xs"
                  dir="ltr"
                  rows={3}
                  value={current}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" onClick={() => void save(s.key, current)}>
                    حفظ
                  </Button>
                </div>
              </article>
            );
          })}
          {!isLoading && !settings?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              ماكو إعدادات مسجلة.
            </p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
