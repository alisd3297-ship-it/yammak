import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { changeServiceRequestStatus } from "@/lib/services.functions";
import {
  PROVIDER_NEXT_STEPS,
  SERVICE_STATUS_LABELS,
  formatServicePrice,
  serviceStatusTone,
  type ServicePriceUnit,
  type ServiceRequestStatus,
} from "@/lib/services";

/** طلبات الخدمة الواردة لمقدم الخدمة — كل تغيير حالة يمر عبر الدالة الخلفية. */
export function ProviderServiceRequests({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const setStatus = useServerFn(changeServiceRequestStatus);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: requests } = useQuery({
    queryKey: ["provider-service-requests", providerId],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("service_requests")
        .select(
          "id, code, status, service_name, price_amount, price_unit, address_text, description, scheduled_at, created_at",
        )
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(40);
      return data ?? [];
    },
  });

  async function advance(id: string, status: ServiceRequestStatus, reason?: string) {
    setBusy(id);
    try {
      await setStatus({ data: { requestId: id, status, reason: reason ?? null } });
      qc.invalidateQueries({ queryKey: ["provider-service-requests", providerId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث الطلب");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {(requests ?? []).map((r) => {
        const status = r.status as ServiceRequestStatus;
        const steps = PROVIDER_NEXT_STEPS[status] ?? [];
        return (
          <article key={r.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="font-bold">#{r.code}</p>
              <span className="text-sm font-bold text-primary">
                {formatServicePrice(Number(r.price_amount), r.price_unit as ServicePriceUnit)}
              </span>
            </div>
            <p className="mt-1 text-sm">{r.service_name}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <StatusDot tone={serviceStatusTone(status)} />
              {SERVICE_STATUS_LABELS[status]}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">العنوان: {r.address_text}</p>
            {r.scheduled_at && (
              <p className="text-xs text-muted-foreground">
                الموعد: {new Date(r.scheduled_at).toLocaleString("ar-IQ")}
              </p>
            )}
            {r.description && <p className="text-xs text-muted-foreground">التفاصيل: {r.description}</p>}
            {(steps.length > 0 || status === "requested") && (
              <div className="mt-3 flex flex-wrap gap-2">
                {steps.map((s) => (
                  <Button
                    key={s.next}
                    className="h-10 flex-1"
                    disabled={busy === r.id}
                    onClick={() => advance(r.id, s.next)}
                  >
                    {s.label}
                  </Button>
                ))}
                {status === "requested" && (
                  <Button
                    variant="outline"
                    className="h-10"
                    disabled={busy === r.id}
                    onClick={() => advance(r.id, "rejected", "رفض مقدم الخدمة")}
                  >
                    رفض
                  </Button>
                )}
              </div>
            )}
          </article>
        );
      })}
      {!requests?.length && (
        <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو طلبات خدمة حالياً.</p>
      )}
    </div>
  );
}
