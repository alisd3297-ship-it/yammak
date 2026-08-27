import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/lib/route-guards";
import { listUsers, setUserBlocked, setUserRole } from "@/lib/admin.functions";
import { ROLE_LABELS, useAccount, type AppRole } from "@/lib/auth";

export const Route = createFileRoute("/admin/users")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "إدارة المستخدمين والأدوار | لبابك" },
      {
        name: "description",
        content:
          "عرض المستخدمين وأدوارهم ومنح أو سحب الصلاحيات وحظر الحسابات وفق صلاحيات إدارية صارمة.",
      },
      { property: "og:title", content: "إدارة المستخدمين والأدوار | لبابك" },
      { property: "og:description", content: "إدارة صلاحيات مستخدمي لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsersPage,
});

const STAFF_ROLES: AppRole[] = ["super_admin", "admin", "supervisor"];
const OPS_ROLES: AppRole[] = ["worker", "provider", "customer"];

function AdminUsersPage() {
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const load = useServerFn(listUsers);
  const changeRole = useServerFn(setUserRole);
  const changeBlocked = useServerFn(setUserBlocked);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const isSuper = !!account?.roles.includes("super_admin");
  const isAdmin = isSuper || !!account?.roles.includes("admin");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users", query],
    queryFn: () => load({ data: { search: query } }),
  });

  async function toggleRole(userId: string, role: AppRole, has: boolean) {
    try {
      await changeRole({ data: { userId, role, grant: !has } });
      toast.success(has ? "تم سحب الدور" : "تم منح الدور");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تعديل الدور");
    }
  }

  async function toggleBlocked(userId: string, blocked: boolean) {
    try {
      await changeBlocked({ data: { userId, blocked: !blocked } });
      toast.success(blocked ? "تم رفع الحظر" : "تم حظر الحساب");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">المستخدمون والأدوار</h1>
        <p className="mt-1 text-sm opacity-90">
          أدوار الإدارة يتحكم بها المدير العام فقط، والأدوار التشغيلية للمدير.
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

      <div className="space-y-3 px-4 py-5">
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        {users?.length === 0 && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو نتائج.</p>
        )}
        {(users ?? []).map((u) => (
          <article key={u.user_id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="font-bold">{u.full_name || "بدون اسم"}</p>
              {u.is_blocked && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  محظور
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {u.phone || "بدون رقم"} · انضم{" "}
              {new Date(u.created_at).toLocaleDateString("ar-IQ-u-nu-latn")}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {[...STAFF_ROLES, ...OPS_ROLES].map((role) => {
                const has = u.roles.includes(role);
                const staffRole = STAFF_ROLES.includes(role);
                const allowed = staffRole ? isSuper : isAdmin;
                return (
                  <button
                    key={role}
                    disabled={!allowed}
                    onClick={() => toggleRole(u.user_id, role, has)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      has ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      !allowed && "opacity-40",
                    )}
                    title={allowed ? undefined : "تحتاج صلاحية أعلى"}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>

            {isAdmin && u.user_id !== account?.userId && (
              <Button
                variant="outline"
                className="mt-3 h-10"
                onClick={() => toggleBlocked(u.user_id, u.is_blocked)}
              >
                {u.is_blocked ? "رفع الحظر" : "حظر الحساب"}
              </Button>
            )}
          </article>
        ))}
      </div>
    </PageShell>
  );
}
