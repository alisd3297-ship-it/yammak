import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/auth";
import { setProviderStatus } from "@/lib/provider.functions";
import {
  SERVICE_STATUS_LABELS,
  formatServicePrice,
  type ServicePriceUnit,
  type ServiceRequestStatus,
} from "@/lib/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/providers")({
  head: () => ({
    meta: [
      { title: "اعتماد مقدمي الخدمة | يمّك" },
      { name: "description", content: "مراجعة طلبات المطاعم والكافتريات والمتاجر ومقدمي الخدمات واعتمادها أو رفضها أو تعليقها، ومتابعة طلبات الخدمات." },
      { property: "og:title", content: "اعتماد مقدمي الخدمة | يمّك" },
      { property: "og:description", content: "لوحة إدارة اعتماد المزوّدين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminProvidersPage,
});

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  suspended: "معلّق",
  rejected: "مرفوض",
};

const FILTERS = ["pending", "approved", "suspended", "rejected"] as const;

function AdminProvidersPage() {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const setStatus = useServerFn(setProviderStatus);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [view, setView] = useState<"providers" | "service-requests">("providers");

  const isStaff = (account?.roles ?? []).some((r) => ["super_admin", "admin", "supervisor"].includes(r));

  const { data: providers } = useQuery({
    queryKey: ["admin-providers", filter],
    enabled: isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, name, kind, status, phone, address_text, description, created_at")
        .eq("status", filter)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: serviceRequests } = useQuery({
    queryKey: ["admin-service-requests"],
    enabled: isStaff && view === "service-requests",
    queryFn: async () => {
      const { data } = await supabase
        .from("service_requests")
        .select("id, code, status, service_name, price_amount, price_unit, address_text, created_at, providers(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  async function apply(providerId: string, status: "approved" | "rejected" | "suspended" | "pending") {
    try {
      await setStatus({ data: { providerId, status } });
      toast.success("تم تحديث حالة المزوّد");
      qc.invalidateQueries({ queryKey: ["admin-providers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث الحالة");
    }
  }

  if (!isStaff)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">هذه الصفحة مخصصة لفريق إدارة يمّك.</p>
          <Link to="/" className="mt-3 inline-block font-semibold text-primary">
            رجوع للرئيسية
          </Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">اعتماد مقدمي الخدمة</h1>
        <p className="mt-1 text-sm opacity-90">راجع طلبات المطاعم والكافتريات والمتاجر</p>
        <div className="mt-3 flex gap-4 text-sm font-semibold underline">
          <Link to="/admin/courier">طلبات المندوب المستقل</Link>
          <Link to="/admin/drivers">السائقون والرحلات</Link>
          <Link to="/admin/payments">المدفوعات</Link>

        </div>
      </header>


      <div className="mt-4 flex gap-2 px-4">
        {(
          [
            { key: "providers", label: "مقدمو الخدمة" },
            { key: "service-requests", label: "طلبات الخدمات" },
          ] as const
        ).map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-xs font-semibold transition",
              view === v.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "service-requests" && (
        <div className="space-y-3 px-4 py-5">
          {(serviceRequests ?? []).map((r) => (
            <article key={r.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="font-bold">#{r.code}</p>
                <span className="text-xs text-muted-foreground">
                  {SERVICE_STATUS_LABELS[r.status as ServiceRequestStatus]}
                </span>
              </div>
              <p className="mt-1 text-sm">{r.service_name}</p>
              <p className="text-xs text-muted-foreground">{(r.providers as { name: string } | null)?.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatServicePrice(Number(r.price_amount), r.price_unit as ServicePriceUnit)} — {r.address_text}
              </p>
            </article>
          ))}
          {!serviceRequests?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو طلبات خدمة.</p>
          )}
        </div>
      )}

      <div className={cn("mt-4 flex gap-2 overflow-x-auto px-4", view !== "providers" && "hidden")}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition",
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      <div className={cn("space-y-3 px-4 py-5", view !== "providers" && "hidden")}>
        {(providers ?? []).map((p) => (
          <article key={p.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="font-bold">{p.name}</p>
              <span className="text-xs text-muted-foreground">
                {p.kind === "store" ? "متجر" : p.kind === "restaurant" ? "مطعم" : "مهنة"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
            <p className="text-xs text-muted-foreground">{p.address_text}</p>
            {p.phone && <p className="text-xs text-muted-foreground">هاتف: {p.phone}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {p.status !== "approved" && (
                <Button className="h-10 flex-1" onClick={() => apply(p.id, "approved")}>
                  اعتماد
                </Button>
              )}
              {p.status !== "suspended" && (
                <Button variant="outline" className="h-10" onClick={() => apply(p.id, "suspended")}>
                  تعليق
                </Button>
              )}
              {p.status !== "rejected" && (
                <Button variant="outline" className="h-10" onClick={() => apply(p.id, "rejected")}>
                  رفض
                </Button>
              )}
            </div>
          </article>
        ))}
        {!providers?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو طلبات بهذه الحالة.</p>
        )}
      </div>
    </PageShell>
  );
}
