import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/lib/route-guards";
import { listUsers } from "@/lib/admin.functions";
import { ROLE_LABELS, type AppRole } from "@/lib/auth";

export const Route = createFileRoute("/admin/subscribers")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "المشتركون | لبابك" },
      {
        name: "description",
        content:
          "جميع الحسابات المشتركة في لبابك عدا الزبائن: مطاعم ومتاجر ومهنيون ومندوبون وفريق الإدارة.",
      },
      { property: "og:title", content: "المشتركون | لبابك" },
      { property: "og:description", content: "إدارة حسابات الشركاء والمندوبين والفريق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSubscribersPage,
});

type Kind = "all" | "provider" | "worker" | "staff";
type StatusFilter = "all" | "approved" | "pending" | "blocked";

const KIND_LABELS: Record<Exclude<Kind, "all">, string> = {
  provider: "نشاط تجاري / مهني",
  worker: "مندوب / سائق",
  staff: "فريق الإدارة",
};

const PROVIDER_KIND_LABELS: Record<string, string> = {
  restaurant: "مطعم",
  store: "متجر",
  profession: "مهنة وخدمة",
};

const PROVIDER_STATUS_LABELS: Record<string, string> = {
  approved: "معتمد",
  pending: "قيد المراجعة",
  suspended: "موقوف",
  rejected: "مرفوض",
};

function AdminSubscribersPage() {
  const load = useServerFn(listUsers);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-subscribers-users", query],
    queryFn: () => load({ data: { search: query } }),
  });

  const { data: providers } = useQuery({
    queryKey: ["admin-subscribers-providers"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, name, kind, status, phone, owner_id, created_at")
        .limit(500);
      return data ?? [];
    },
  });

  const { data: workers } = useQuery({
    queryKey: ["admin-subscribers-workers"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_profiles")
        .select("user_id, worker_kind, is_approved, is_available, application_status, created_at")
        .limit(500);
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const providerByOwner = new Map((providers ?? []).map((p) => [p.owner_id, p]));
    const workerByUser = new Map((workers ?? []).map((w) => [w.user_id, w]));

    return (users ?? [])
      .map((u) => {
        const roles = u.roles as AppRole[];
        const provider = providerByOwner.get(u.user_id) ?? null;
        const worker = workerByUser.get(u.user_id) ?? null;
        const isStaff = roles.some((r) =>
          ["super_admin", "admin", "supervisor"].includes(r as string),
        );
        const kinds: Exclude<Kind, "all">[] = [];
        if (provider || roles.includes("provider")) kinds.push("provider");
        if (worker || roles.includes("worker")) kinds.push("worker");
        if (isStaff) kinds.push("staff");
        return { user: u, roles, provider, worker, kinds };
      })
      .filter((r) => r.kinds.length > 0) // استبعاد حسابات الزبائن تماماً
      .filter((r) => kind === "all" || r.kinds.includes(kind as Exclude<Kind, "all">))
      .filter((r) => {
        if (status === "all") return true;
        if (status === "blocked") return r.user.is_blocked;
        const approved =
          (r.provider ? r.provider.status === "approved" : true) &&
          (r.worker ? r.worker.is_approved : true);
        return status === "approved" ? approved && !r.user.is_blocked : !approved;
      });
  }, [users, providers, workers, kind, status]);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">المشتركون</h1>
        <p className="mt-1 text-sm opacity-90">
          كل الحسابات المشتركة عدا الزبائن: أنشطة، مندوبون، وفريق الإدارة.
        </p>
      </header>

      <AdminNav />

      <div className="flex gap-2 px-4 pt-4">
        <Input
          className="h-11"
          placeholder="ابحث بالاسم أو رقم الهاتف"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setQuery(search)}
        />
        <Button className="h-11" onClick={() => setQuery(search)}>
          بحث
        </Button>
      </div>

      <div className="mt-3 space-y-2 px-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              { key: "all", label: "الكل" },
              { key: "provider", label: "أنشطة" },
              { key: "worker", label: "مندوبون" },
              { key: "staff", label: "الإدارة" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setKind(t.key)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition",
                kind === t.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              { key: "all", label: "كل الحالات" },
              { key: "approved", label: "مفعّل" },
              { key: "pending", label: "قيد المراجعة" },
              { key: "blocked", label: "محظور" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition",
                status === t.key
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-4 py-5">
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && !rows.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو نتائج.</p>
        )}
        {rows.map(({ user, roles, provider, worker, kinds }) => (
          <article key={user.user_id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {provider?.name || user.full_name || "بدون اسم"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user.phone || provider?.phone || "بدون رقم"} · انضم{" "}
                  {new Date(user.created_at).toLocaleDateString("ar-IQ-u-nu-latn")}
                </p>
              </div>
              {user.is_blocked && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  محظور
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              {kinds.map((k) => (
                <span key={k} className="rounded-full bg-accent px-2 py-1 text-accent-foreground">
                  {KIND_LABELS[k]}
                </span>
              ))}
              {provider && (
                <>
                  <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                    {PROVIDER_KIND_LABELS[provider.kind] ?? provider.kind}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                    {PROVIDER_STATUS_LABELS[provider.status] ?? provider.status}
                  </span>
                </>
              )}
              {worker && (
                <>
                  <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                    {worker.worker_kind === "taxi" ? "سائق تكسي" : "مندوب توصيل"}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                    {worker.is_approved ? "معتمد" : "قيد المراجعة"}
                    {worker.is_approved && worker.is_available ? " · متصل" : ""}
                  </span>
                </>
              )}
              {roles.map((r) => (
                <span key={r} className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                  {ROLE_LABELS[r] ?? r}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
