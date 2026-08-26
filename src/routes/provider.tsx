import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, StatusDot } from "@/components/app-shell";
import { ProviderCatalog } from "@/components/provider-catalog";
import { ProviderServices } from "@/components/provider-services";
import { ProviderServiceRequests } from "@/components/provider-service-requests";
import { ProviderCustomerTabs } from "@/components/provider-customer-tabs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/lib/auth";
import { dispatchOrder } from "@/lib/dispatch.functions";
import { changeOrderStatus } from "@/lib/orders.functions";
import {
  ORDER_STATUS_LABELS,
  FULFILLMENT_LABELS,
  asFulfillment,
  formatIQD,
  statusTone,
  type OrderStatus,
} from "@/lib/orders";

import { requireProvider } from "@/lib/route-guards";

export const Route = createFileRoute("/provider")({
  ssr: false,
  beforeLoad: requireProvider,
  head: () => ({
    meta: [
      { title: "لوحة مقدم الخدمة | لبابك" },
      { name: "description", content: "استقبل الطلبات، جهّزها، وأرسلها للمندوب من لوحة تحكم متجرك في لبابك." },
      { property: "og:title", content: "لوحة مقدم الخدمة | لبابك" },
      { property: "og:description", content: "إدارة الطلبات وحالة المتجر." },
    ],
  }),
  component: ProviderDashboard,
});

const NEXT_STEP: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  awaiting_provider: { next: "accepted", label: "قبول الطلب" },
  accepted: { next: "ready_for_pickup", label: "الطلب جاهز" },
  preparing: { next: "ready_for_pickup", label: "الطلب جاهز" },
};

function ProviderDashboard() {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const dispatch = useServerFn(dispatchOrder);
  const setStatus = useServerFn(changeOrderStatus);

  const [tab, setTab] = useState<"orders" | "catalog" | "tabs">("orders");

  const { data: provider } = useQuery({
    queryKey: ["my-provider", account?.userId],
    enabled: !!account?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, name, kind, is_open, status, orders_count, rating")
        .eq("owner_id", account!.userId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["provider-orders", provider?.id],
    enabled: !!provider?.id,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id, code, status, total, notes, dropoff_text, created_at, fulfillment, party_size, scheduled_at, order_items(name, quantity)",
        )
        .eq("provider_id", provider!.id)
        .order("created_at", { ascending: false })
        .limit(40);
      return data ?? [];
    },
  });

  const isProfession = provider?.kind === "profession";

  async function toggleOpen(open: boolean) {
    if (!provider) return;
    await supabase.from("providers").update({ is_open: open }).eq("id", provider.id);
    qc.invalidateQueries({ queryKey: ["my-provider"] });
  }

  async function advance(orderId: string, next: OrderStatus, pickup = false) {
    try {
      await setStatus({ data: { orderId, status: next } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث الطلب");
      return;
    }
    if (next === "ready_for_pickup" && !pickup) {
      try {
        const res = await dispatch({ data: { orderId } });
        toast.success(res.message);
      } catch {
        toast.error("تعذر إرسال الطلب للمندوبين، سنعيد المحاولة");
      }
    }
    qc.invalidateQueries({ queryKey: ["provider-orders"] });
  }

  async function cancel(orderId: string) {
    try {
      await setStatus({ data: { orderId, status: "cancelled", reason: "رفض المتجر الطلب" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إلغاء الطلب");
      return;
    }
    qc.invalidateQueries({ queryKey: ["provider-orders"] });
  }

  if (!account?.userId)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">هذه اللوحة للمتاجر والمطاعم المسجلة.</p>
          <Link to="/auth" className="mt-3 inline-block font-semibold text-primary">
            تسجيل الدخول
          </Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">{provider?.name ?? "لوحة مقدم الخدمة"}</h1>
        {provider && (
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/15 px-4 py-3">
            <span className="text-sm font-semibold">
              {isProfession
                ? provider.is_open
                  ? "متاح لاستقبال الطلبات"
                  : "غير متاح حالياً"
                : provider.is_open
                  ? "المتجر مفتوح"
                  : "المتجر مغلق"}
            </span>
            <Switch checked={provider.is_open} onCheckedChange={toggleOpen} />
          </div>
        )}
        <Link
          to="/provider-finance"
          className="mt-3 inline-block rounded-full bg-primary-foreground/15 px-4 py-2 text-xs font-semibold backdrop-blur"
        >
          مالية النشاط والتسويات
        </Link>
      </header>

      {provider && (
        <div className="mt-4 flex gap-2 px-4">
          {(isProfession
            ? ([
                { key: "orders", label: "طلبات الخدمة" },
                { key: "catalog", label: "خدماتي وأسعاري" },
              ] as const)
            : ([
                { key: "orders", label: "الطلبات" },
                { key: "catalog", label: "الكتالوج" },
                { key: "tabs", label: "قوائم الزبائن" },
              ] as const)
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 rounded-full px-4 py-2 text-xs font-semibold transition",
                tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {provider && tab === "tabs" && !isProfession && (
        <div className="px-4 py-5">
          <ProviderCustomerTabs providerId={provider.id} />
        </div>
      )}

      {provider && tab === "catalog" && (
        <div className="px-4 py-5">
          {isProfession ? (
            <ProviderServices providerId={provider.id} />
          ) : (
            <ProviderCatalog providerId={provider.id} isStore={provider.kind === "store"} />
          )}
        </div>
      )}

      {provider && isProfession && tab === "orders" && (
        <div className="px-4 py-5">
          {provider.status !== "approved" && (
            <p className="mb-3 rounded-2xl bg-warning/15 p-4 text-sm">
              ملفك قيد المراجعة من الإدارة، ما راح تستلم طلبات قبل الاعتماد.
            </p>
          )}
          <ProviderServiceRequests providerId={provider.id} />
        </div>
      )}

      <div className={cn("space-y-3 px-4 py-5", provider && (isProfession || tab !== "orders") && "hidden")}>
        {!provider && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ما عندك نشاط مرتبط بحسابك.{" "}
            <Link to="/join/provider" className="font-semibold text-primary">
              قدّم طلب انضمام
            </Link>
          </p>
        )}
        {provider?.status !== "approved" && provider && (
          <p className="rounded-2xl bg-warning/15 p-4 text-sm">نشاطك قيد المراجعة من الإدارة، ما راح تستلم طلبات قبل الاعتماد.</p>
        )}

        {(orders ?? []).map((o) => {
          const ful = asFulfillment(o.fulfillment);
          const pickup = ful !== "delivery";
          const step =
            pickup && o.status === "ready_for_pickup"
              ? { next: "completed" as OrderStatus, label: "تم تسليم الطلب للزبون" }
              : NEXT_STEP[o.status as OrderStatus];
          return (
            <article key={o.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="font-bold">طلب #{o.code}</p>
                <span className="text-sm font-bold text-primary">{formatIQD(Number(o.total))}</span>
              </div>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <StatusDot tone={statusTone(o.status as OrderStatus)} />
                {ORDER_STATUS_LABELS[o.status as OrderStatus]}
                <span className="rounded-full bg-accent px-2 py-0.5 font-bold text-accent-foreground">
                  {FULFILLMENT_LABELS[ful]}
                </span>
              </p>
              <ul className="mt-2 text-sm text-muted-foreground">
                {(o.order_items as { name: string; quantity: number }[] | null)?.map((i, idx) => (
                  <li key={idx}>
                    {i.name} × {i.quantity}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                {pickup
                  ? ful === "dine_in"
                    ? `حجز بالصالة${o.party_size ? ` · ${o.party_size} أشخاص` : ""}${o.scheduled_at ? ` · ${new Date(o.scheduled_at).toLocaleString("ar-IQ-u-nu-latn")}` : ""}`
                    : "سفري: الزبون يستلم من المحل"
                  : `التوصيل إلى: ${o.dropoff_text}`}
              </p>
              {o.notes && <p className="text-xs text-muted-foreground">ملاحظات: {o.notes}</p>}
              {step && (
                <div className="mt-3 flex gap-2">
                  <Button className="h-10 flex-1" onClick={() => advance(o.id, step.next, pickup)}>
                    {step.label}
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => cancel(o.id)}>
                    رفض
                  </Button>
                </div>
              )}
            </article>
          );
        })}
        {provider && !orders?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو طلبات حالياً.</p>
        )}
      </div>
    </PageShell>
  );
}
