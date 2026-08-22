import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Loader2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { requireStaff } from "@/lib/route-guards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/services")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "إدارة كتالوج الخدمات | يمّك" },
      {
        name: "description",
        content: "إنشاء وتعديل وحذف أقسام الخدمات والتصنيفات الفرعية والخدمات وإعادة ترتيبها ونقلها بين الأقسام.",
      },
      { property: "og:title", content: "إدارة كتالوج الخدمات | يمّك" },
      { property: "og:description", content: "لوحة إدارة كتالوج الخدمات في تطبيق يمّك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminServicesPage,
});

type Section = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  section_id: string | null;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
};

type Service = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  route_path: string | null;
  service_type: string;
  section_id: string | null;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
};

type Tab = "sections" | "categories" | "services";

const SERVICE_TYPES = [
  { value: "restaurant", label: "مطاعم" },
  { value: "store", label: "متاجر" },
  { value: "courier", label: "توصيل سريع" },
  { value: "special_delivery", label: "توصيل خاص" },
  { value: "taxi", label: "تاكسي" },
  { value: "profession", label: "مهن وخدمات" },
];

function selectClass() {
  return "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
}

function AdminServicesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("sections");
  const [busy, setBusy] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const catalog = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: async () => {
      const [sections, categories, services, providers, provServices] = await Promise.all([
        supabase
          .from("service_sections")
          .select("id, name, description, icon, sort_order, is_active, deleted_at")
          .order("sort_order"),
        supabase
          .from("profession_categories")
          .select("id, name, description, icon, section_id, sort_order, is_active, deleted_at")
          .order("sort_order"),
        supabase
          .from("services")
          .select("id, name, description, icon, route_path, service_type, section_id, sort_order, is_active, deleted_at")
          .order("sort_order"),
        supabase.from("providers").select("id, profession_category_id"),
        supabase.from("provider_services").select("id, category_id"),
      ]);
      return {
        sections: (sections.data ?? []) as Section[],
        categories: (categories.data ?? []) as Category[],
        services: (services.data ?? []) as Service[],
        providers: providers.data ?? [],
        provServices: provServices.data ?? [],
      };
    },
  });

  const data = catalog.data;

  const counts = useMemo(() => {
    const bySection = new Map<string, number>();
    for (const s of data?.services ?? []) {
      if (s.deleted_at || !s.section_id) continue;
      bySection.set(s.section_id, (bySection.get(s.section_id) ?? 0) + 1);
    }
    for (const c of data?.categories ?? []) {
      if (c.deleted_at || !c.section_id) continue;
      bySection.set(c.section_id, (bySection.get(c.section_id) ?? 0) + 1);
    }
    const byCategory = new Map<string, number>();
    for (const p of data?.providers ?? []) {
      const id = (p as { profession_category_id: string | null }).profession_category_id;
      if (id) byCategory.set(id, (byCategory.get(id) ?? 0) + 1);
    }
    for (const s of data?.provServices ?? []) {
      const id = (s as { category_id: string | null }).category_id;
      if (id) byCategory.set(id, (byCategory.get(id) ?? 0) + 1);
    }
    return { bySection, byCategory };
  }, [data]);

  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, okMsg: string) {
    setBusy(key);
    try {
      const { error } = await fn();
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["admin-catalog"] });
      await qc.invalidateQueries({ queryKey: ["home-catalog"] });
      await qc.invalidateQueries({ queryKey: ["service-providers"] });
      await qc.invalidateQueries({ queryKey: ["profession-categories"] });
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تنفيذ العملية");
    } finally {
      setBusy(null);
    }
  }

  const visible = <T extends { deleted_at: string | null }>(rows: T[]) =>
    showDeleted ? rows : rows.filter((r) => !r.deleted_at);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground">
        <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm opacity-90">
          <ArrowRight className="size-4" /> رجوع
        </Link>
        <h1 className="text-2xl font-black">كتالوج الخدمات</h1>
        <p className="mt-1 text-sm opacity-90">الأقسام والتصنيفات الفرعية والخدمات — إضافة وتعديل ونقل وحذف آمن.</p>
      </header>
      <AdminNav />

      <div className="mt-4 flex items-center justify-between px-4">
        <div className="flex gap-2">
          {(
            [
              ["sections", "الأقسام"],
              ["categories", "التصنيفات الفرعية"],
              ["services", "الخدمات"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold",
                tab === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showDeleted} onCheckedChange={setShowDeleted} />
          المحذوفة
        </label>
      </div>

      {catalog.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4 p-4 pb-24">
          {tab === "sections" && data ? (
            <SectionsTab
              sections={visible(data.sections)}
              allSections={data.sections.filter((s) => !s.deleted_at)}
              counts={counts.bySection}
              busy={busy}
              run={run}
            />
          ) : null}
          {tab === "categories" && data ? (
            <CategoriesTab
              categories={visible(data.categories)}
              sections={data.sections.filter((s) => !s.deleted_at)}
              counts={counts.byCategory}
              busy={busy}
              run={run}
            />
          ) : null}
          {tab === "services" && data ? (
            <ServicesTab
              services={visible(data.services)}
              sections={data.sections.filter((s) => !s.deleted_at)}
              busy={busy}
              run={run}
            />
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

type Runner = (
  key: string,
  fn: () => PromiseLike<{ error: { message: string } | null }>,
  okMsg: string,
) => Promise<void>;

function reorder(rows: Array<{ id: string; sort_order: number }>, id: string, dir: -1 | 1) {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const i = sorted.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return null;
  return [
    { id: sorted[i]!.id, sort_order: sorted[j]!.sort_order },
    { id: sorted[j]!.id, sort_order: sorted[i]!.sort_order },
  ];
}

/* ---------------- الأقسام ---------------- */

function SectionsTab({
  sections,
  allSections,
  counts,
  busy,
  run,
}: {
  sections: Section[];
  allSections: Section[];
  counts: Map<string, number>;
  busy: string | null;
  run: Runner;
}) {
  const [draft, setDraft] = useState({ name: "", description: "", icon: "Layers" });
  const [pendingDelete, setPendingDelete] = useState<Section | null>(null);
  const [moveTo, setMoveTo] = useState<string>("");

  async function create() {
    if (!draft.name.trim()) {
      toast.error("اكتب اسم القسم");
      return;
    }
    const next = Math.max(0, ...sections.map((s) => s.sort_order)) + 1;
    await run(
      "new-section",
      () =>
        supabase.from("service_sections").insert({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          icon: draft.icon.trim() || "Layers",
          sort_order: next,
          is_active: true,
        }),
      "تم إنشاء القسم",
    );
    setDraft({ name: "", description: "", icon: "Layers" });
  }

  const dependents = pendingDelete ? (counts.get(pendingDelete.id) ?? 0) : 0;

  return (
    <>
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold">قسم جديد</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>الاسم</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label>الأيقونة (lucide)</Label>
            <Input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
          </div>
          <div>
            <Label>الوصف</Label>
            <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
        </div>
        <Button className="mt-3" onClick={create} disabled={busy === "new-section"}>
          <Plus className="ml-1 size-4" /> إضافة قسم
        </Button>
      </div>

      {sections
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => (
          <RowCard
            key={s.id}
            deleted={!!s.deleted_at}
            title={s.name}
            badge={`${counts.get(s.id) ?? 0} عنصر مرتبط`}
            busy={busy === s.id}
            onUp={() => {
              const pair = reorder(sections, s.id, -1);
              if (pair) void run(s.id, () => supabase.from("service_sections").upsert(pair as never), "تم الترتيب");
            }}
            onDown={() => {
              const pair = reorder(sections, s.id, 1);
              if (pair) void run(s.id, () => supabase.from("service_sections").upsert(pair as never), "تم الترتيب");
            }}
            active={s.is_active}
            onToggle={(v) =>
              run(s.id, () => supabase.from("service_sections").update({ is_active: v }).eq("id", s.id), v ? "تم التفعيل" : "تم التعطيل")
            }
            onDelete={() => {
              setMoveTo("");
              setPendingDelete(s);
            }}
            onRestore={
              s.deleted_at
                ? () =>
                    run(
                      s.id,
                      () => supabase.from("service_sections").update({ deleted_at: null, is_active: true }).eq("id", s.id),
                      "تمت الاستعادة",
                    )
                : undefined
            }
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                defaultValue={s.name}
                onBlur={(e) =>
                  e.target.value !== s.name &&
                  run(s.id, () => supabase.from("service_sections").update({ name: e.target.value }).eq("id", s.id), "تم الحفظ")
                }
              />
              <Input
                defaultValue={s.icon}
                onBlur={(e) =>
                  e.target.value !== s.icon &&
                  run(s.id, () => supabase.from("service_sections").update({ icon: e.target.value }).eq("id", s.id), "تم الحفظ")
                }
              />
              <Textarea
                className="min-h-10 sm:col-span-3"
                defaultValue={s.description ?? ""}
                placeholder="وصف القسم"
                onBlur={(e) =>
                  e.target.value !== (s.description ?? "") &&
                  run(
                    s.id,
                    () => supabase.from("service_sections").update({ description: e.target.value || null }).eq("id", s.id),
                    "تم الحفظ",
                  )
                }
              />
            </div>
          </RowCard>
        ))}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القسم «{pendingDelete?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              {dependents > 0
                ? `تحذير: هذا القسم يحتوي على ${dependents} عنصر مرتبط (خدمات/تصنيفات). لن يُحذف أي عنصر تلقائياً — اختر قسماً لنقلها إليه، أو اكتفِ بالتعطيل.`
                : "لا توجد عناصر مرتبطة. يمكنك التعطيل (حذف مؤقت) أو الحذف النهائي."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dependents > 0 ? (
            <div>
              <Label>نقل العناصر إلى</Label>
              <select className={selectClass()} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">— بدون نقل —</option>
                {allSections
                  .filter((x) => x.id !== pendingDelete?.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={async () => {
                const id = pendingDelete!.id;
                setPendingDelete(null);
                await run(
                  id,
                  () =>
                    supabase.rpc("admin_delete_service_section", {
                      _id: id,
                      ...(moveTo ? { _reassign_to: moveTo } : {}),
                      _hard: false,
                    }),
                  "تم تعطيل القسم (حذف مؤقت)",
                );
              }}
            >
              تعطيل (حذف مؤقت)
            </Button>
            <AlertDialogAction
              onClick={async () => {
                const id = pendingDelete!.id;
                setPendingDelete(null);
                await run(
                  id,
                  () =>
                    supabase.rpc("admin_delete_service_section", {
                      _id: id,
                      ...(moveTo ? { _reassign_to: moveTo } : {}),
                      _hard: true,
                    }),
                  "تم حذف القسم نهائياً",
                );
              }}
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------------- التصنيفات الفرعية ---------------- */

function CategoriesTab({
  categories,
  sections,
  counts,
  busy,
  run,
}: {
  categories: Category[];
  sections: Section[];
  counts: Map<string, number>;
  busy: string | null;
  run: Runner;
}) {
  const [draft, setDraft] = useState({ name: "", icon: "Wrench", section_id: "" });
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [moveTo, setMoveTo] = useState("");

  async function create() {
    if (!draft.name.trim()) {
      toast.error("اكتب اسم التصنيف");
      return;
    }
    const next = Math.max(0, ...categories.map((c) => c.sort_order)) + 1;
    await run(
      "new-cat",
      () =>
        supabase.from("profession_categories").insert({
          name: draft.name.trim(),
          icon: draft.icon.trim() || "Wrench",
          section_id: draft.section_id || null,
          sort_order: next,
          is_active: true,
        }),
      "تم إنشاء التصنيف",
    );
    setDraft({ name: "", icon: "Wrench", section_id: "" });
  }

  const dependents = pendingDelete ? (counts.get(pendingDelete.id) ?? 0) : 0;

  return (
    <>
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold">تصنيف فرعي جديد</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>الاسم</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label>الأيقونة</Label>
            <Input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
          </div>
          <div>
            <Label>القسم الأب</Label>
            <select
              className={selectClass()}
              value={draft.section_id}
              onChange={(e) => setDraft({ ...draft, section_id: e.target.value })}
            >
              <option value="">— بدون قسم —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button className="mt-3" onClick={create} disabled={busy === "new-cat"}>
          <Plus className="ml-1 size-4" /> إضافة تصنيف
        </Button>
      </div>

      {categories
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => (
          <RowCard
            key={c.id}
            deleted={!!c.deleted_at}
            title={c.name}
            badge={`${counts.get(c.id) ?? 0} مرتبط`}
            busy={busy === c.id}
            active={c.is_active}
            onUp={() => {
              const pair = reorder(categories, c.id, -1);
              if (pair) void run(c.id, () => supabase.from("profession_categories").upsert(pair as never), "تم الترتيب");
            }}
            onDown={() => {
              const pair = reorder(categories, c.id, 1);
              if (pair) void run(c.id, () => supabase.from("profession_categories").upsert(pair as never), "تم الترتيب");
            }}
            onToggle={(v) =>
              run(
                c.id,
                () => supabase.from("profession_categories").update({ is_active: v }).eq("id", c.id),
                v ? "تم التفعيل" : "تم التعطيل",
              )
            }
            onDelete={() => {
              setMoveTo("");
              setPendingDelete(c);
            }}
            onRestore={
              c.deleted_at
                ? () =>
                    run(
                      c.id,
                      () =>
                        supabase.from("profession_categories").update({ deleted_at: null, is_active: true }).eq("id", c.id),
                      "تمت الاستعادة",
                    )
                : undefined
            }
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                defaultValue={c.name}
                onBlur={(e) =>
                  e.target.value !== c.name &&
                  run(c.id, () => supabase.from("profession_categories").update({ name: e.target.value }).eq("id", c.id), "تم الحفظ")
                }
              />
              <Input
                defaultValue={c.icon}
                onBlur={(e) =>
                  e.target.value !== c.icon &&
                  run(c.id, () => supabase.from("profession_categories").update({ icon: e.target.value }).eq("id", c.id), "تم الحفظ")
                }
              />
              <select
                className={selectClass()}
                value={c.section_id ?? ""}
                onChange={(e) =>
                  run(
                    c.id,
                    () =>
                      supabase
                        .from("profession_categories")
                        .update({ section_id: e.target.value || null })
                        .eq("id", c.id),
                    "تم نقل التصنيف",
                  )
                }
              >
                <option value="">— بدون قسم —</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </RowCard>
        ))}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التصنيف «{pendingDelete?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              {dependents > 0
                ? `تحذير: مرتبط بـ ${dependents} مزوّد/خدمة مزوّد. لن يُحذف أي منها تلقائياً — انقلها إلى تصنيف آخر أو اكتفِ بالتعطيل للحفاظ على السجلات التاريخية.`
                : "لا توجد ارتباطات. يمكنك التعطيل أو الحذف النهائي."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dependents > 0 ? (
            <div>
              <Label>نقل الارتباطات إلى</Label>
              <select className={selectClass()} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">— بدون نقل —</option>
                {categories
                  .filter((x) => x.id !== pendingDelete?.id && !x.deleted_at)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={async () => {
                const id = pendingDelete!.id;
                setPendingDelete(null);
                await run(
                  id,
                  () =>
                    supabase.rpc("admin_delete_profession_category", {
                      _id: id,
                      ...(moveTo ? { _reassign_to: moveTo } : {}),
                      _hard: false,
                    }),
                  "تم تعطيل التصنيف (حذف مؤقت)",
                );
              }}
            >
              تعطيل (حذف مؤقت)
            </Button>
            <AlertDialogAction
              onClick={async () => {
                const id = pendingDelete!.id;
                setPendingDelete(null);
                await run(
                  id,
                  () =>
                    supabase.rpc("admin_delete_profession_category", {
                      _id: id,
                      ...(moveTo ? { _reassign_to: moveTo } : {}),
                      _hard: true,
                    }),
                  "تم حذف التصنيف نهائياً",
                );
              }}
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------------- الخدمات ---------------- */

function ServicesTab({
  services,
  sections,
  busy,
  run,
}: {
  services: Service[];
  sections: Section[];
  busy: string | null;
  run: Runner;
}) {
  const [draft, setDraft] = useState({
    name: "",
    icon: "Sparkles",
    section_id: "",
    service_type: "profession",
    route_path: "",
  });
  const [pendingDelete, setPendingDelete] = useState<Service | null>(null);

  async function create() {
    if (!draft.name.trim()) {
      toast.error("اكتب اسم الخدمة");
      return;
    }
    const next = Math.max(0, ...services.map((s) => s.sort_order)) + 1;
    await run(
      "new-service",
      () =>
        supabase.from("services").insert({
          name: draft.name.trim(),
          icon: draft.icon.trim() || "Sparkles",
          section_id: draft.section_id || null,
          service_type: draft.service_type as never,
          route_path: draft.route_path.trim() || null,
          sort_order: next,
          is_active: true,
        }),
      "تمت إضافة الخدمة",
    );
    setDraft({ name: "", icon: "Sparkles", section_id: "", service_type: "profession", route_path: "" });
  }

  return (
    <>
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold">خدمة جديدة</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>الاسم</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label>الأيقونة</Label>
            <Input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
          </div>
          <div>
            <Label>القسم</Label>
            <select
              className={selectClass()}
              value={draft.section_id}
              onChange={(e) => setDraft({ ...draft, section_id: e.target.value })}
            >
              <option value="">— بدون قسم —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>نوع الخدمة</Label>
            <select
              className={selectClass()}
              value={draft.service_type}
              onChange={(e) => setDraft({ ...draft, service_type: e.target.value })}
            >
              {SERVICE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>المسار (اختياري)</Label>
            <Input
              value={draft.route_path}
              placeholder="/services"
              onChange={(e) => setDraft({ ...draft, route_path: e.target.value })}
            />
          </div>
        </div>
        <Button className="mt-3" onClick={create} disabled={busy === "new-service"}>
          <Plus className="ml-1 size-4" /> إضافة خدمة
        </Button>
      </div>

      {services
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => (
          <RowCard
            key={s.id}
            deleted={!!s.deleted_at}
            title={s.name}
            badge={SERVICE_TYPES.find((t) => t.value === s.service_type)?.label ?? s.service_type}
            busy={busy === s.id}
            active={s.is_active}
            onUp={() => {
              const pair = reorder(services, s.id, -1);
              if (pair) void run(s.id, () => supabase.from("services").upsert(pair as never), "تم الترتيب");
            }}
            onDown={() => {
              const pair = reorder(services, s.id, 1);
              if (pair) void run(s.id, () => supabase.from("services").upsert(pair as never), "تم الترتيب");
            }}
            onToggle={(v) =>
              run(s.id, () => supabase.from("services").update({ is_active: v }).eq("id", s.id), v ? "تم التفعيل" : "تم التعطيل")
            }
            onDelete={() => setPendingDelete(s)}
            onRestore={
              s.deleted_at
                ? () =>
                    run(
                      s.id,
                      () => supabase.from("services").update({ deleted_at: null, is_active: true }).eq("id", s.id),
                      "تمت الاستعادة",
                    )
                : undefined
            }
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                defaultValue={s.name}
                onBlur={(e) =>
                  e.target.value !== s.name &&
                  run(s.id, () => supabase.from("services").update({ name: e.target.value }).eq("id", s.id), "تم الحفظ")
                }
              />
              <Input
                defaultValue={s.icon}
                onBlur={(e) =>
                  e.target.value !== s.icon &&
                  run(s.id, () => supabase.from("services").update({ icon: e.target.value }).eq("id", s.id), "تم الحفظ")
                }
              />
              <select
                className={selectClass()}
                value={s.section_id ?? ""}
                onChange={(e) =>
                  run(
                    s.id,
                    () => supabase.from("services").update({ section_id: e.target.value || null }).eq("id", s.id),
                    "تم نقل الخدمة",
                  )
                }
              >
                <option value="">— بدون قسم —</option>
                {sections.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <Textarea
                className="min-h-10 sm:col-span-3"
                defaultValue={s.description ?? ""}
                placeholder="وصف الخدمة"
                onBlur={(e) =>
                  e.target.value !== (s.description ?? "") &&
                  run(
                    s.id,
                    () => supabase.from("services").update({ description: e.target.value || null }).eq("id", s.id),
                    "تم الحفظ",
                  )
                }
              />
            </div>
          </RowCard>
        ))}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الخدمة «{pendingDelete?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              التعطيل يخفي الخدمة عن الزبون ومقدم الخدمة مع الحفاظ على الطلبات والسجلات القديمة. الحذف النهائي لا يُنصح به
              إن كانت الخدمة مستخدمة سابقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={async () => {
                const id = pendingDelete!.id;
                setPendingDelete(null);
                await run(id, () => supabase.rpc("admin_delete_service", { _id: id, _hard: false }), "تم تعطيل الخدمة");
              }}
            >
              تعطيل (حذف مؤقت)
            </Button>
            <AlertDialogAction
              onClick={async () => {
                const id = pendingDelete!.id;
                setPendingDelete(null);
                await run(id, () => supabase.rpc("admin_delete_service", { _id: id, _hard: true }), "تم حذف الخدمة");
              }}
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------------- بطاقة صف ---------------- */

function RowCard({
  title,
  badge,
  deleted,
  active,
  busy,
  children,
  onUp,
  onDown,
  onToggle,
  onDelete,
  onRestore,
}: {
  title: string;
  badge: string;
  deleted: boolean;
  active: boolean;
  busy: boolean;
  children: React.ReactNode;
  onUp: () => void;
  onDown: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
  onRestore?: (() => void) | undefined;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", deleted && "opacity-60")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-bold">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{badge}</span>
        {deleted ? (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">محذوف مؤقتاً</span>
        ) : null}
        <div className="ms-auto flex items-center gap-1">
          {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          <Button size="icon" variant="ghost" onClick={onUp} aria-label="أعلى">
            <ArrowUp className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDown} aria-label="أسفل">
            <ArrowDown className="size-4" />
          </Button>
          <Switch checked={active} onCheckedChange={onToggle} aria-label="تفعيل" />
          {onRestore ? (
            <Button size="sm" variant="outline" onClick={onRestore}>
              استعادة
            </Button>
          ) : (
            <Button size="icon" variant="ghost" onClick={onDelete} aria-label="حذف">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
