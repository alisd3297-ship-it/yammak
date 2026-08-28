import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Handshake, Clock } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireSignedIn } from "@/lib/route-guards";
import { OPERATING_ADDRESS_PREFIX } from "@/lib/location";
import { formatIQD } from "@/lib/orders";
import {
  acceptQuoteOffer,
  createQuoteRequest,
  listMyQuoteRequests,
  QUOTE_STATUS_LABELS,
} from "@/lib/quotes.functions";

export const Route = createFileRoute("/quotes")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "طلب عرض سعر | لبابك" },
      {
        name: "description",
        content: "اطلب عروض أسعار من مقدمي الخدمة في لبابك، قارن الأسعار وأوقات التنفيذ واختر الأنسب.",
      },
      { property: "og:title", content: "طلب عرض سعر | لبابك" },
      { property: "og:description", content: "قارن عروض المهنيين واختر الأنسب إلك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuotesPage,
});

function QuotesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyQuoteRequests);
  const createFn = useServerFn(createQuoteRequest);
  const acceptFn = useServerFn(acceptQuoteOffer);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState(OPERATING_ADDRESS_PREFIX);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: requests } = useQuery({
    queryKey: ["my-quote-requests"],
    queryFn: () => listFn(),
  });

  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      await createFn({
        data: { title, description, address, budget: budget ? Number(budget) : null },
      });
      toast.success("انرسل طلب العرض للمهنيين");
      setTitle("");
      setDescription("");
      setBudget("");
      await qc.invalidateQueries({ queryKey: ["my-quote-requests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الإرسال");
    } finally {
      setBusy(false);
    }
  }

  async function accept(requestId: string, offerId: string) {
    try {
      await acceptFn({ data: { requestId, offerId } });
      toast.success("تم قبول العرض");
      await qc.invalidateQueries({ queryKey: ["my-quote-requests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر قبول العرض");
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/services" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Handshake className="size-6" /> طلب عرض سعر
        </h1>
        <p className="mt-1 text-sm opacity-90">اوصف الشغل، واستلم عروض من المهنيين وقارن بينها</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-11"
            placeholder="عنوان الشغل، مثلاً: صيانة مكيف"
            aria-label="عنوان الطلب"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="اكتب تفاصيل الشغل، الموقع داخل البيت، والوقت المناسب"
          />
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-11"
            placeholder="العنوان"
            aria-label="العنوان"
          />
          <Input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="h-11"
            type="number"
            min={0}
            placeholder="ميزانيتك التقريبية (اختياري)"
            aria-label="الميزانية"
          />
          <Button className="h-12 w-full" disabled={busy} onClick={() => void send()}>
            {busy ? "جاري الإرسال…" : "اطلب عروض"}
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold">طلباتي وعروضها</h2>
          {(requests ?? []).map((r) => (
            <div key={r.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{r.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold">
                  {QUOTE_STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {r.offers.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{o.providerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatIQD(o.amount)}
                        {o.etaMinutes ? (
                          <>
                            {" · "}
                            <Clock className="inline size-3" /> {o.etaMinutes} دقيقة
                          </>
                        ) : null}
                      </p>
                      {o.message && <p className="mt-1 text-xs">{o.message}</p>}
                    </div>
                    {r.status !== "accepted" ? (
                      <Button
                        className="h-9 px-3 text-xs"
                        onClick={() => void accept(r.id, o.id)}
                      >
                        قبول
                      </Button>
                    ) : (
                      <span className="text-xs font-bold text-success">
                        {o.status === "accepted" ? "مقبول" : "—"}
                      </span>
                    )}
                  </div>
                ))}
                {!r.offers.length && (
                  <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                    بانتظار وصول العروض…
                  </p>
                )}
              </div>
            </div>
          ))}
          {!requests?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              ما عندك طلبات عروض بعد.
            </p>
          )}
        </section>
      </div>

      <BottomNav />
    </PageShell>
  );
}
