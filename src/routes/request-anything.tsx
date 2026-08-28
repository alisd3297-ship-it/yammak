import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, MapPin, Mic, MicOff, Camera, Store, Gift } from "lucide-react";
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
import { extractItemsFromImage } from "@/lib/vision.functions";
import { useVoiceInput } from "@/lib/voice-input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/request-anything")({
  ssr: false,
  beforeLoad: requireCustomerFlow,
  head: () => ({
    meta: [
      { title: "اطلب أي شي | لبابك" },
      {
        name: "description",
        content: "اكتب طلبك أو سجّله بصوتك أو صوّره، ونحوّله إلى طلب منظم بالعناصر والعنوان.",
      },
      { property: "og:title", content: "اطلب أي شي | لبابك" },
      { property: "og:description", content: "طلب حر بالنص أو الصوت أو الصورة، مع «جيبلي من هنانا»." },
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

type Mode = "text" | "voice" | "image" | "errand";

const MODES: { key: Mode; label: string }[] = [
  { key: "text", label: "كتابة" },
  { key: "voice", label: "بالصوت" },
  { key: "image", label: "من صورة" },
  { key: "errand", label: "جيبلي من هنانا" },
];

function RequestAnythingPage() {
  useCustomerAreaGuard();
  const qc = useQueryClient();
  const geo = useUserLocation();
  const submit = useServerFn(submitCustomRequest);
  const listFn = useServerFn(listMyCustomRequests);
  const readImage = useServerFn(extractItemsFromImage);

  const [mode, setMode] = useState<Mode>("text");
  const [raw, setRaw] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [items, setItems] = useState<ParsedLine[]>([]);
  const [address, setAddress] = useState(OPERATING_ADDRESS_PREFIX);
  const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [sourcePlace, setSourcePlace] = useState("");
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const voice = useVoiceInput((text) => setRaw((prev) => (prev ? `${prev}\n${text}` : text)));

  const { data: history } = useQuery({
    queryKey: ["my-custom-requests"],
    queryFn: () => listFn(),
  });

  const preview = useMemo(() => parseRequestText(raw), [raw]);

  async function onPickImage(file: File) {
    if (reading) return;
    setReading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
        reader.readAsDataURL(file);
      });
      const result = await readImage({ data: { imageDataUrl: dataUrl } });
      setRaw((prev) => (prev ? `${prev}\n${result.text}` : result.text));
      toast.success(`قرينا ${result.items.length} عنصر من الصورة`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر قراءة الصورة");
    } finally {
      setReading(false);
    }
  }

  function startConfirm() {
    if (!raw.trim()) {
      toast.error("اكتب طلبك أولاً");
      return;
    }
    if (mode === "errand" && !sourcePlace.trim()) {
      toast.error("حدد من وين نجيب الطلب");
      return;
    }
    setItems(
      preview.length ? preview : [{ name: raw.trim().slice(0, 120), quantity: 1, note: null }],
    );
    setConfirming(true);
  }

  async function send() {
    if (busy) return;
    if (!address.trim()) {
      toast.error("حدد عنوان التسليم");
      return;
    }
    if (forSomeoneElse && !recipientPhone.trim()) {
      toast.error("اكتب رقم هاتف المستلم");
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
          inputKind: mode,
          sourcePlace: mode === "errand" ? sourcePlace : null,
          recipientName: forSomeoneElse ? recipientName : null,
          recipientPhone: forSomeoneElse ? recipientPhone : null,
        },
      });
      toast.success("وصل طلبك، فريق لبابك راح يحوّله إلى طلب منظم");
      setRaw("");
      setItems([]);
      setNotes("");
      setBudget("");
      setSourcePlace("");
      setRecipientName("");
      setRecipientPhone("");
      setForSomeoneElse(false);
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
        <p className="mt-1 text-sm opacity-90">اكتب أو احچي أو صوّر — وإحنا نرتبه إلك</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        {!confirming ? (
          <section className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition",
                    mode === m.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === "errand" && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-bold" htmlFor="src">
                  من وين نجيبه؟
                </label>
                <Input
                  id="src"
                  value={sourcePlace}
                  onChange={(e) => setSourcePlace(e.target.value)}
                  className="h-11"
                  placeholder="اسم المحل أو المكان، مثلاً: صيدلية الشفاء - شارع السدة"
                />
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Store className="size-3" /> المندوب راح يروح للمكان ويشتري الطلب ويوصله إلك.
                </p>
              </div>
            )}

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

            {mode === "voice" && (
              <div className="mt-3">
                {voice.supported ? (
                  <Button
                    type="button"
                    variant={voice.listening ? "destructive" : "outline"}
                    className="h-11 w-full"
                    onClick={voice.toggle}
                  >
                    {voice.listening ? (
                      <>
                        <MicOff className="me-1 size-4" /> إيقاف التسجيل
                      </>
                    ) : (
                      <>
                        <Mic className="me-1 size-4" /> ابدأ الكلام
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                    جهازك ما يدعم الإدخال الصوتي، تكدر تكتب طلبك يدوياً.
                  </p>
                )}
              </div>
            )}

            {mode === "image" && (
              <div className="mt-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onPickImage(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  disabled={reading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="me-1 size-4" />
                  {reading ? "نقرأ الصورة…" : "اختر صورة القائمة"}
                </Button>
              </div>
            )}

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

            {mode === "errand" && sourcePlace.trim() && (
              <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                <Store className="me-1 inline size-3" /> نجيبه من: {sourcePlace}
              </div>
            )}

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

            <div className="rounded-xl bg-muted/60 p-3">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={forSomeoneElse}
                  onChange={(e) => setForSomeoneElse(e.target.checked)}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                <Gift className="size-4 text-primary" /> الطلب لشخص آخر
              </label>
              {forSomeoneElse && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="h-11"
                    placeholder="اسم المستلم"
                    aria-label="اسم المستلم"
                  />
                  <Input
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="h-11"
                    placeholder="رقم المستلم"
                    inputMode="tel"
                    aria-label="رقم المستلم"
                  />
                </div>
              )}
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
              <Button
                variant="outline"
                className="h-12 flex-1"
                onClick={() => setConfirming(false)}
              >
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
