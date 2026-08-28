import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { requireSignedIn } from "@/lib/route-guards";
import { formatIQD } from "@/lib/orders";
import {
  CLAIM_REASONS,
  CLAIM_STATUS_LABELS,
  listMyClaims,
  submitGuaranteeClaim,
} from "@/lib/guarantee.functions";

export const Route = createFileRoute("/guarantee")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "ضمان لبابك | حماية طلبك" },
      {
        name: "description",
        content: "ضمان لبابك: إذا صار خلل بطلبك افتح مطالبة ونعوّضك بعد مراجعة سريعة من الفريق.",
      },
      { property: "og:title", content: "ضمان لبابك | حماية طلبك" },
      { property: "og:description", content: "طلبك محمي، وإذا صار خلل نعوّضك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuaranteePage,
});

function GuaranteePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyClaims);
  const submitFn = useServerFn(submitGuaranteeClaim);

  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState(CLAIM_REASONS[0]!.key);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: claims } = useQuery({ queryKey: ["my-claims"], queryFn: () => listFn() });

  const { data: orders } = useQuery({
    queryKey: ["claimable-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  async function send() {
    if (busy) return;
    if (!orderId) {
      toast.error("اختر الطلب");
      return;
    }
    setBusy(true);
    try {
      await submitFn({ data: { orderId, reason, description } });
      toast.success("استلمنا مطالبتك، راح نراجعها بسرعة");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["my-claims"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال المطالبة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/account" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <ShieldCheck className="size-6" /> ضمان لبابك
        </h1>
        <p className="mt-1 text-sm opacity-90">إذا صار خلل بطلبك، افتح مطالبة وإحنا نعوّضك</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          <label className="block text-sm font-bold" htmlFor="order">
            الطلب
          </label>
          <select
            id="order"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">اختر الطلب</option>
            {(orders ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {new Date(o.created_at).toLocaleDateString("ar-IQ-u-nu-latn")}
              </option>
            ))}
          </select>

          <label className="block text-sm font-bold" htmlFor="reason">
            سبب المطالبة
          </label>
          <select
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            {CLAIM_REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="اشرح شنو صار بالضبط"
          />
          <Button className="h-12 w-full" disabled={busy} onClick={() => void send()}>
            {busy ? "جاري الإرسال…" : "إرسال المطالبة"}
          </Button>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold">مطالباتي</h2>
          {(claims ?? []).map((c) => (
            <div key={c.id} className="rounded-2xl bg-card p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <p className="line-clamp-2 flex-1 text-sm">{c.description}</p>
                <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold">
                  {CLAIM_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              {c.compensation > 0 && (
                <p className="mt-1 text-xs font-bold text-success">
                  تعويض: {formatIQD(c.compensation)}
                </p>
              )}
              {c.note && <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>}
            </div>
          ))}
          {!claims?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              ما عندك مطالبات — نتمنى يبقى الحال هيچي.
            </p>
          )}
        </section>
      </div>

      <BottomNav />
    </PageShell>
  );
}
