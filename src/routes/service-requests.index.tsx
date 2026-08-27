import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCustomerFlow } from "@/lib/route-guards";
import { BackButton, BottomNav, PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useCustomerAreaGuard, useAccount } from "@/lib/auth";
import { changeServiceRequestStatus, rateServiceRequest } from "@/lib/services.functions";
import {
  SERVICE_STATUS_LABELS,
  formatServicePrice,
  serviceStatusTone,
  type ServicePriceUnit,
  type ServiceRequestStatus,
} from "@/lib/services";

export const Route = createFileRoute("/service-requests/")({
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "طلبات الخدمة | لبابك" },
      {
        name: "description",
        content: "تابع حالة طلبات المهن والخدمات وقيّم مقدم الخدمة بعد إنجاز الشغل.",
      },
      { property: "og:title", content: "طلبات الخدمة | لبابك" },
      { property: "og:description", content: "متابعة طلبات المهن والخدمات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServiceRequestsPage,
});

function ServiceRequestsPage() {
  useCustomerAreaGuard();
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const setStatus = useServerFn(changeServiceRequestStatus);
  const rate = useServerFn(rateServiceRequest);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: requests } = useQuery({
    queryKey: ["my-service-requests", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("service_requests")
        .select(
          "id, code, status, service_name, price_amount, price_unit, currency, address_text, scheduled_at, description, created_at, providers(name)",
        )
        .eq("customer_id", account!.userId!)
        .order("created_at", { ascending: false })
        .limit(40);
      return data ?? [];
    },
  });

  const { data: ratings } = useQuery({
    queryKey: ["my-service-ratings", account?.userId],
    enabled: !!account?.userId,
    queryFn: async () => {
      const { data } = await supabase.from("service_ratings").select("request_id, stars");
      return data ?? [];
    },
  });

  async function cancel(id: string) {
    setBusy(id);
    try {
      await setStatus({ data: { requestId: id, status: "cancelled", reason: "إلغاء من الزبون" } });
      qc.invalidateQueries({ queryKey: ["my-service-requests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إلغاء الطلب");
    } finally {
      setBusy(null);
    }
  }

  async function submitRating(id: string, stars: number) {
    setBusy(id);
    try {
      await rate({ data: { requestId: id, stars } });
      toast.success("شكراً لتقييمك");
      qc.invalidateQueries({ queryKey: ["my-service-ratings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال التقييم");
    } finally {
      setBusy(null);
    }
  }

  if (!account?.userId)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">سجّل دخولك حتى تشوف طلبات الخدمة.</p>
          <Link to="/auth" className="mt-3 inline-block font-semibold text-primary">
            تسجيل الدخول
          </Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/services" label="المهن والخدمات" />
        <h1 className="text-2xl font-black">طلبات الخدمة</h1>
        <p className="mt-1 text-sm opacity-90">تابع حالة الطلب وقيّم بعد الإنجاز</p>
      </header>

      <div className="space-y-3 px-4 py-5">
        {(requests ?? []).map((r) => {
          const status = r.status as ServiceRequestStatus;
          const rated = (ratings ?? []).find((x) => x.request_id === r.id);
          const canCancel = ["requested", "accepted", "scheduled"].includes(status);
          return (
            <article key={r.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="font-bold">#{r.code}</p>
                <span className="text-sm font-bold text-primary">
                  {formatServicePrice(
                    Number(r.price_amount),
                    r.price_unit as ServicePriceUnit,
                    r.currency,
                  )}
                </span>
              </div>
              <p className="mt-1 text-sm">{r.service_name}</p>
              <p className="text-xs text-muted-foreground">
                {(r.providers as { name: string } | null)?.name}
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <StatusDot tone={serviceStatusTone(status)} />
                {SERVICE_STATUS_LABELS[status]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">العنوان: {r.address_text}</p>
              {r.scheduled_at && (
                <p className="text-xs text-muted-foreground">
                  الموعد: {new Date(r.scheduled_at).toLocaleString("ar-IQ-u-nu-latn")}
                </p>
              )}
              {r.description && (
                <p className="text-xs text-muted-foreground">التفاصيل: {r.description}</p>
              )}

              {canCancel && (
                <Button
                  variant="outline"
                  className="mt-3 h-10 w-full"
                  disabled={busy === r.id}
                  onClick={() => cancel(r.id)}
                >
                  إلغاء الطلب
                </Button>
              )}

              {status === "completed" && (
                <div className="mt-3">
                  {rated ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      تقييمك: {rated.stars}
                      <Star className="size-3.5 fill-warning text-warning" />
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">قيّم الخدمة:</span>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          disabled={busy === r.id}
                          onClick={() => submitRating(r.id, s)}
                          aria-label={`تقييم ${s} نجوم`}
                          className="p-0.5"
                        >
                          <Star className="size-5 text-warning" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {!requests?.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            ماكو طلبات خدمة لحد الآن.
          </p>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
