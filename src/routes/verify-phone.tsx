import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPhoneVerification,
  requestPhoneOtp,
  verifyPhoneOtp,
} from "@/lib/otp.functions";
import { maskPhone, normalizeIraqiPhone, otpErrorMessage } from "@/lib/otp";

export const Route = createFileRoute("/verify-phone")({
  head: () => ({
    meta: [
      { title: "تأكيد رقم الهاتف | يمّك" },
      {
        name: "description",
        content: "أكّد رقم هاتفك برمز تحقق آمن لتفعيل الإجراءات الحساسة في تطبيق يمّك.",
      },
      { property: "og:title", content: "تأكيد رقم الهاتف | يمّك" },
      { property: "og:description", content: "رمز تحقق آمن لمرة واحدة لحماية حسابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPhonePage,
});

function VerifyPhonePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const status = useServerFn(getPhoneVerification);
  const requestOtp = useServerFn(requestPhoneOtp);
  const verifyOtp = useServerFn(verifyPhoneOtp);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const seeded = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["phone-verification"],
    queryFn: () => status(),
    retry: false,
  });

  useEffect(() => {
    if (data?.phone && !seeded.current) {
      seeded.current = true;
      setPhone(data.phone);
    }
  }, [data?.phone]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    const normalized = normalizeIraqiPhone(phone);
    if (!normalized) {
      toast.error("اكتب رقم هاتف عراقي صحيح مثل 07701234567");
      return;
    }
    setBusy(true);
    try {
      const res = await requestOtp({ data: { phone: normalized } });
      setStage("code");
      setCooldown(res.cooldownSeconds);
      setNotice(
        res.configured
          ? `أرسلنا رمزاً مكوناً من 6 أرقام إلى ${maskPhone(res.phone)}`
          : "خدمة الرسائل غير مفعّلة على هذا التطبيق، لذلك لن تصلك رسالة. الرمز صدر فعلياً بالخادم ويحتاج تفعيل مزود SMS.",
      );
      if (!res.configured) toast.warning("مزود الرسائل غير مهيأ بعد");
      else toast.success("تم إرسال الرمز");
    } catch (e) {
      toast.error(otpErrorMessage(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await verifyOtp({ data: { code } });
      toast.success("تم تأكيد رقم هاتفك");
      await qc.invalidateQueries({ queryKey: ["phone-verification"] });
      await qc.invalidateQueries({ queryKey: ["account"] });
      navigate({ to: "/orders" });
    } catch (e) {
      const msg = otpErrorMessage(e instanceof Error ? e.message : "");
      toast.error(msg);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <Link to="/orders" className="mb-3 inline-flex items-center gap-1 text-sm opacity-90">
          <ArrowRight className="size-4" /> رجوع
        </Link>
        <h1 className="text-2xl font-black">تأكيد رقم الهاتف</h1>
        <p className="mt-1 text-sm opacity-90">خطوة أمان تحمي حسابك وطلباتك</p>
      </header>

      <div className="space-y-4 px-4 py-5">
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}

        {data?.verified ? (
          <div className="rounded-2xl bg-card p-5 text-center shadow-soft">
            <ShieldCheck className="mx-auto size-10 text-success" />
            <p className="mt-3 font-bold">رقمك مؤكَّد</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.phone ? maskPhone(data.phone) : ""}
            </p>
            <Button asChild variant="outline" className="mt-4 h-11 w-full">
              <Link to="/orders">رجوع لطلباتي</Link>
            </Button>
          </div>
        ) : (
          <>
            {data && !data.smsConfigured && (
              <div className="flex gap-2 rounded-2xl bg-warning/10 p-4 text-xs text-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <p>
                  مزود الرسائل القصيرة غير مهيأ في هذا التطبيق بعد، فما راح تصل رسالة فعلية حتى
                  تُضاف الأسرار المطلوبة.
                </p>
              </div>
            )}

            <div className="space-y-4 rounded-2xl bg-card p-5 shadow-soft">
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  dir="ltr"
                  className="text-left"
                  placeholder="07701234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={stage === "code"}
                />
              </div>

              {stage === "phone" ? (
                <Button className="h-12 w-full" onClick={send} disabled={busy}>
                  {busy ? "جاري الإرسال…" : "أرسل رمز التحقق"}
                </Button>
              ) : (
                <>
                  {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="code">رمز التحقق (6 أرقام)</Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={6}
                      className="text-center text-2xl font-black tracking-[0.4em]"
                      placeholder="------"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                  <Button
                    className="h-12 w-full"
                    onClick={verify}
                    disabled={busy || code.length !== 6}
                  >
                    {busy ? "جاري التحقق…" : "تأكيد الرمز"}
                  </Button>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      className="font-semibold text-primary disabled:text-muted-foreground"
                      onClick={send}
                      disabled={busy || cooldown > 0}
                    >
                      {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : "إعادة إرسال الرمز"}
                    </button>
                    <button
                      className="text-muted-foreground"
                      onClick={() => {
                        setStage("phone");
                        setCode("");
                        setNotice(null);
                      }}
                    >
                      تغيير الرقم
                    </button>
                  </div>
                </>
              )}
            </div>

            <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
              الرمز صالح 5 دقائق، وعدد المحاولات محدود. ما نخزن الرمز نفسه بقاعدة البيانات، ولا
              يمكن تأكيد الرقم من التطبيق بدون رمز صحيح.
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}
