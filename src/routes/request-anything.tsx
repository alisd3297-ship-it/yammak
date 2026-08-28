import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, MapPin } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireCustomerFlow } from "@/lib/route-guards";
import { useCustomerAreaGuard } from "@/lib/auth";
import { useUserLocation } from "@/lib/geo";
import { OPERATING_ADDRESS_PREFIX } from "@/lib/location";
import { parseRequestText, type ParsedLine } from "@/lib/request-parser";
import { submitCustomRequest, listMyCustomRequests } from "@/lib/custom-requests.functions";

export const Route = createFileRoute("/request-anything")({
  ssr: false,
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "اطلب أي شي | لبابك" },
      {
        name: "description",
        content: "اكتب طلبك بلغتك الطبيعية ونحوّله إلى طلب منظم بالعناصر والعنوان والملاحظات.",
      },
      { property: "og:title", content: "اطلب أي شي | لبابك" },
      { property: "og:description", content: "طلب حر يتحول إلى طلب منظم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestAnythingPage,
});

const STATUS_LABELS: Record<string, string> = {
  submitted: "قيد المراجعة",
  reviewing: "تحت المعالجة",
  converted: "تحوّل إلى طلب",
  rejected: "مرفوض",
};

function RequestAnythingPage() {
  useCustomerAreaGuard();
  const qc = useQueryClient();
  const geo = useUserLocation();
  const submit = useServerFn(submitCustomRequest);
  const listFn = useServerFn(listMyCustomRequests);

  const [raw, setRaw] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [items, setItems] = useState<ParsedLine[]>([]);
  const [address, setAddress] = useState(OPERATING_ADDRESS_PREFIX);
  const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["my-custom-requests"],
    queryFn: () => listFn(),
  });

  const preview = useMemo(() => parseRequestText(raw), [raw]);

  function startConfirm() {
    if (!raw.trim()) {
      toast.error("اكتب طلبك أولاً");
      return;
    }
    setItems(preview.length ? preview : [{ name: raw.trim().slice(0, 120), quantity: 1, note: null }]);
    setConfirming(true);
  }

  async function send() {
    if (busy) return;
    if (!address.trim()) {
      toast.error("حدد عنوان التسليم");
      return;
    }
    setBusy(true);
    try {
      await submit({
        data: {
          rawText: raw,
          items,
          address,
          lat: geo.precise ? geo.point.lat : null,
          lng: geo.precise ? geo.point.lng : null,
          notes: notes || null,
          budget: budget ? Number(budget) : null,
          currency: "IQD",
        },
      });
      toast.success("وصل طلبك، فريق لبابك راح يحوّله إلى طلب منظم");
      setRaw("");
      setItems([]);
      setNotes("");
      setBudget("");
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["my-custom-requests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Sparkles className="size-6" /> اطلب أي شي
        </h1>
        <p className="mt-1 text-sm opacity-90">اكتب طلبك بلغتك وإحنا نرتبه إلك</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        {!confirming ? (
          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <label className="mb-2 block text-sm font-bold" htmlFor="raw">
              شنو تحتاج؟
            </label>
            <Textarea
              id="raw"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={5}
              placeholder={"مثال:\n2 صمون\nكيلو طماطة\nعلبة دواء بنادول"}
            />
            {preview.length > 0 && (
              <div className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                فهمنا {preview.length} عنصر — تكدر تعدلهم بالخطوة الجاية.
              </div>
            )}
            <Button className="mt-4 h-12 w-full" onClick={startConfirm}>
              مراجعة الطلب
            </Button>
          </section>
        ) : (
          <section className="space-y-4 rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="font-bold">تأكيد الطلب</h2>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={it.name}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p)),
                      )
                    }
                    className="h-11 flex-1"
                    aria-label="اسم العنصر"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, quantity: Number(e.target.value) || 1 } : p,
                        ),
                      )
                    }
                    className="h-11 w-20"
                    aria-label="الكمية"
                  />
                  <Button
                    variant="ghost"
                    className="h-11 px-2"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="حذف"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                className="h-10 w-full"
                onClick={() => setItems((prev) => [...prev, { name: "", quantity: 1, note: null }])}
              >
                <Plus className="me-1 size-4" /> إضافة عنصر
              </Button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold" htmlFor="addr">
                عنوان التسليم
              </label>
              <Input
                id="addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-11"
              />
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {geo.label}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-bold" htmlFor="budget">
                  ميزانية تقريبية (اختياري)
                </label>
                <Input
                  id="budget"
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="h-11"
                  placeholder="بالدينار"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold" htmlFor="notes">
                  ملاحظات
                </label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-11"
                  placeholder="مثلاً: اتصل قبل الوصول"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="h-12 flex-1" onClick={() => setConfirming(false)}>
                رجوع للتعديل
              </Button>
              <Button className="h-12 flex-1" onClick={() => void send()} disabled={busy}>
                {busy ? "جاري الإرسال…" : "تأكيد وإرسال"}
              </Button>
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-base font-bold">طلباتي الحرة</h2>
          <div className="space-y-3">
            {(history ?? []).map((r) => (
              <div key={r.id} className="rounded-2xl bg-card p-3 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <p className="line-clamp-2 flex-1 text-sm">{r.rawText}</p>
                  <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold">
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString("ar-IQ-u-nu-latn")}
                </p>
                {r.orderId && (
                  <Link
                    to="/orders/$id"
                    params={{ id: r.orderId }}
                    className="mt-2 inline-block text-xs font-bold text-primary"
                  >
                    فتح الطلب
                  </Link>
                )}
              </div>
            ))}
            {!history?.length && (
              <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                ما عندك طلبات حرة بعد.
              </p>
            )}
          </div>
        </section>
      </div>

      <BottomNav />
    </PageShell>
  );
}
