import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav, PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/lib/route-guards";
import {
  getOrderApprovalSettings,
  reviewOrderApproval,
  setOrderApprovalSettings,
} from "@/lib/admin.functions";
import { ORDER_STATUS_LABELS, formatIQD, statusTone, type OrderStatus } from "@/lib/orders";
import type { Database } from "@/integrations/supabase/types";

type OrderType = Database["public"]["Enums"]["order_type"];

export const Route = createFileRoute("/admin/orders")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "موافقات الطلبات | يمّك" },
      {
        name: "description",
        content: "مراجعة الطلبات التي تحتاج موافقة الإدارة قبل التجهيز، وقبولها أو رفضها مع سبب واضح.",
      },
      { property: "og:title", content: "موافقات الطلبات | يمّك" },
      { property: "og:description", content: "موافقة الإدارة على الطلبات قبل التجهيز." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOrdersPage,
});

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "restaurant", label: "مطاعم وكافتريات" },
  { value: "store", label: "متاجر" },
  { value: "courier", label: "توصيل سريع" },
  { value: "special_delivery", label: "توصيل خاص" },
];

function AdminOrdersPage() {
  const qc = useQueryClient();
  const review = useServerFn(reviewOrderApproval);
  const loadSettings = useServerFn(getOrderApprovalSettings);
  const saveSettings = useServerFn(setOrderApprovalSettings);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const { data: settings } = useQuery({
    queryKey: ["order-approval-settings"],
    queryFn: () => loadSettings({}),
  });

  const { data: pending } = useQuery({
    queryKey: ["orders-awaiting-approval"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, order_type, total, dropoff_text, notes, created_at, providers(name)")
        .eq("requires_admin_approval", true)
        .is("admin_approved_at", null)
        .not("status", "in", "(cancelled,completed)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: reviewed } = useQuery({
    queryKey: ["orders-reviewed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, total, admin_approved_at, admin_review_reason")
        .eq("requires_admin_approval", true)
        .not("admin_approved_at", "is", null)
        .order("admin_approved_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  async function toggleEnabled(enabled: boolean) {
    try {
      await saveSettings({ data: { enabled, orderTypes: settings?.orderTypes ?? [] } });
      qc.invalidateQueries({ queryKey: ["order-approval-settings"] });
      toast.success(enabled ? "تم تفعيل موافقة الإدارة" : "تم تعطيل موافقة الإدارة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ الإعداد");
    }
  }

  async function toggleType(type: OrderType) {
    const current = settings?.orderTypes ?? [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    try {
      await saveSettings({ data: { enabled: settings?.enabled ?? false, orderTypes: next } });
      qc.invalidateQueries({ queryKey: ["order-approval-settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ الإعداد");
    }
  }

  async function decide(orderId: string, approve: boolean) {
    try {
      await review({
        data: { orderId, approve, ...(reasons[orderId] ? { reason: reasons[orderId] } : {}) },
      });
      toast.success(approve ? "تمت الموافقة على الطلب" : "تم رفض الطلب");
      qc.invalidateQueries({ queryKey: ["orders-awaiting-approval"] });
      qc.invalidateQueries({ queryKey: ["orders-reviewed"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ القرار");
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">موافقات الطلبات</h1>
        <p className="mt-1 text-sm opacity-90">
          موافقة الإدارة على الطلبات قبل تجهيزها — منفصلة عن اعتماد تسجيل المزوّدين والمندوبين.
        </p>
      </header>

      <AdminNav />

      <section className="mx-4 mt-5 rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">تفعيل موافقة الإدارة</h2>
            <p className="text-xs text-muted-foreground">
              عند التفعيل لا يتقدم الطلب قبل موافقة المدير.
            </p>
          </div>
          <Switch checked={!!settings?.enabled} onCheckedChange={toggleEnabled} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {ORDER_TYPES.map((t) => {
            const active = (settings?.orderTypes ?? []).includes(t.value);
            return (
              <button
                key={t.value}
                onClick={() => toggleType(t.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          بدون اختيار أي نوع تُطبَّق الموافقة على كل الأنواع.
        </p>
      </section>

      <section className="space-y-3 px-4 py-5">
        <h2 className="font-bold">بانتظار قرارك ({pending?.length ?? 0})</h2>
        {!pending?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ماكو طلبات تنتظر موافقة حالياً.
          </p>
        )}
        {(pending ?? []).map((o) => (
          <article key={o.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="font-bold">طلب #{o.code}</p>
              <span className="text-sm font-bold text-primary">{formatIQD(Number(o.total))}</span>
            </div>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <StatusDot tone={statusTone(o.status as OrderStatus)} />
              {ORDER_STATUS_LABELS[o.status as OrderStatus]}
              {" · "}
              {(o.providers as { name: string } | null)?.name ?? "بدون مزوّد"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">التوصيل إلى: {o.dropoff_text}</p>
            {o.notes && <p className="text-xs text-muted-foreground">ملاحظات: {o.notes}</p>}
            <Input
              className="mt-3 h-10"
              placeholder="سبب القرار (اختياري للموافقة، مهم عند الرفض)"
              value={reasons[o.id] ?? ""}
              onChange={(e) => setReasons((r) => ({ ...r, [o.id]: e.target.value }))}
            />
            <div className="mt-3 flex gap-2">
              <Button className="h-10 flex-1" onClick={() => decide(o.id, true)}>
                موافقة
              </Button>
              <Button variant="outline" className="h-10" onClick={() => decide(o.id, false)}>
                رفض
              </Button>
            </div>
          </article>
        ))}
      </section>

      {!!reviewed?.length && (
        <section className="space-y-2 px-4 pb-8">
          <h2 className="font-bold">سجل القرارات</h2>
          {reviewed.map((o) => (
            <div key={o.id} className="rounded-2xl bg-muted/60 p-3 text-xs">
              <div className="flex justify-between font-semibold">
                <span>طلب #{o.code}</span>
                <span>{ORDER_STATUS_LABELS[o.status as OrderStatus]}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {o.admin_approved_at
                  ? new Date(o.admin_approved_at).toLocaleString("ar-IQ-u-nu-latn")
                  : ""}
                {o.admin_review_reason ? ` · ${o.admin_review_reason}` : ""}
              </p>
            </div>
          ))}
        </section>
      )}
    </PageShell>
  );
}
