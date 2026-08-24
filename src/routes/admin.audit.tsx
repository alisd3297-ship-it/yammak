import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/lib/route-guards";

export const Route = createFileRoute("/admin/audit")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "سجل التدقيق الإداري | لبابك" },
      { name: "description", content: "سجل كامل لعمليات الإدارة: الأدوار والموافقات والأقسام والخدمات والإعلانات." },
      { property: "og:title", content: "سجل التدقيق الإداري | لبابك" },
      { property: "og:description", content: "متابعة كل عمليات المدير في تطبيق لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAuditPage,
});

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
};

const GROUPS: Array<{ key: string; label: string; entities: string[] }> = [
  { key: "all", label: "الكل", entities: [] },
  { key: "roles", label: "الأدوار والمستخدمون", entities: ["user_roles", "profiles"] },
  { key: "approvals", label: "الموافقات", entities: ["worker_profiles", "providers", "orders"] },
  { key: "catalog", label: "الأقسام والخدمات", entities: ["service_sections", "services", "profession_categories"] },
  { key: "ads", label: "الإعلانات", entities: ["ads", "ad_categories"] },
  {
    key: "settings",
    label: "الإعدادات والتسعير",
    entities: ["app_settings", "pricing_rules", "commission_rules", "cities", "areas"],
  },
];

const ENTITY_LABEL: Record<string, string> = {
  user_roles: "أدوار المستخدمين",
  profiles: "حسابات المستخدمين",
  worker_profiles: "المندوبون",
  providers: "مقدمو الخدمة",
  orders: "الطلبات",
  service_sections: "أقسام الخدمات",
  services: "الخدمات",
  profession_categories: "تصنيفات المهن",
  ads: "الإعلانات",
  ad_categories: "تصنيفات الإعلانات",
  app_settings: "إعدادات التطبيق",
  pricing_rules: "قواعد التسعير",
  commission_rules: "قواعد العمولة",
  cities: "المدن",
  areas: "المناطق",
  payments: "المدفوعات",
};

const ACTION_SUFFIX: Record<string, string> = {
  insert: "إضافة",
  update: "تعديل",
  delete: "حذف",
};

function actionLabel(action: string, entity: string) {
  const suffix = action.startsWith(`${entity}_`) ? action.slice(entity.length + 1) : "";
  if (suffix && ACTION_SUFFIX[suffix]) return `${ACTION_SUFFIX[suffix]} — ${ENTITY_LABEL[entity] ?? entity}`;
  return action;
}

/** يعرض أهم الحقول المتغيرة بدل رمي JSON كامل على الشاشة. */
function changedFields(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter(
    (k) => !["updated_at", "created_at"].includes(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]),
  );
  if (keys.length === 0) return "";
  return keys
    .slice(0, 6)
    .map((k) => `${k}: ${JSON.stringify(b[k] ?? null)} ← ${JSON.stringify(a[k] ?? null)}`)
    .join(" · ");
}

function AdminAuditPage() {
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit", group],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("id, actor_id, action, entity, entity_id, before_data, after_data, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      const entities = GROUPS.find((g) => g.key === group)?.entities ?? [];
      if (entities.length > 0) query = query.in("entity", entities);
      const { data: rows, error } = await query;
      if (error) throw error;
      const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
      const names = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
        (profiles ?? []).forEach((p) => names.set(p.id, p.full_name));
      }
      return (rows ?? []).map((r) => ({
        ...(r as AuditRow),
        actorName: r.actor_id ? (names.get(r.actor_id) ?? "مستخدم محذوف") : "النظام",
      }));
    },
  });

  const term = search.trim();
  const rows = (data ?? []).filter(
    (r) => term === "" || r.action.includes(term) || r.entity.includes(term) || r.actorName.includes(term),
  );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">سجل التدقيق</h1>
        <p className="mt-1 text-sm opacity-90">كل عمليات الإدارة مسجّلة: من قام بها، ومتى، وما الذي تغيّر</p>
      </header>

      <AdminNav />

      <div className="px-4 pb-24">
        <ul className="mt-4 flex gap-2 overflow-x-auto">
          {GROUPS.map((g) => (
            <li key={g.key}>
              <button
                type="button"
                onClick={() => setGroup(g.key)}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold",
                  group === g.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {g.label}
              </button>
            </li>
          ))}
        </ul>

        <Input
          className="mt-4"
          placeholder="بحث بالاسم أو العملية"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">جاري التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">لا توجد عمليات مسجّلة ضمن هذا التصنيف.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((r) => {
              const diff = changedFields(r.before_data, r.after_data);
              return (
                <li key={r.id} className="rounded-2xl bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-bold">{actionLabel(r.action, r.entity)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("ar-IQ")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    بواسطة: {r.actorName}
                    {r.entity_id ? ` · المعرّف: ${r.entity_id.slice(0, 8)}…` : ""}
                  </p>
                  {diff ? (
                    <p className="mt-2 break-all rounded-xl bg-muted/60 p-2 text-[11px] leading-5 text-muted-foreground">
                      {diff}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
