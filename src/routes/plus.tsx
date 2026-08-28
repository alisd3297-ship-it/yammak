import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Crown, Check, Wallet } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireSignedIn } from "@/lib/route-guards";
import { formatIQD } from "@/lib/orders";
import { getMyPlus, subscribePlus, PLUS_PLANS, type PlusPlan } from "@/lib/plus.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plus")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "لبابك بلس | لبابك" },
      {
        name: "description",
        content: "اشترك بلبابك بلس واحصل على أولوية بالطلبات وامتيازات دائمة داخل التطبيق.",
      },
      { property: "og:title", content: "لبابك بلس | لبابك" },
      { property: "og:description", content: "اشتراك بامتيازات وأولوية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlusPage,
});

const BENEFITS = [
  "أولوية بإرسال طلبك للمناديب",
  "دعم أسرع من فريق لبابك",
  "عروض وخصومات خاصة بالمشتركين",
  "إشعارات مبكرة بالعروض القريبة منك",
];

function PlusPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMyPlus);
  const subscribe = useServerFn(subscribePlus);
  const [plan, setPlan] = useState<PlusPlan>("monthly");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({ queryKey: ["my-plus"], queryFn: () => load() });

  async function activate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await subscribe({ data: { plan } });
      toast.success(
        `تم التفعيل حتى ${new Date(res.expires_at).toLocaleDateString("ar-IQ-u-nu-latn")}`,
      );
      void qc.invalidateQueries({ queryKey: ["my-plus"] });
      void qc.invalidateQueries({ queryKey: ["my-wallet"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التفعيل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/account" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Crown className="size-6" /> لبابك بلس
        </h1>
        <p className="mt-1 text-sm opacity-90">
          {data?.isActive
            ? `مفعّل حتى ${data.expiresAt ? new Date(data.expiresAt).toLocaleDateString("ar-IQ-u-nu-latn") : "—"}`
            : "امتيازات إضافية باشتراك بسيط"}
        </p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 font-bold">شنو تستفيد؟</h2>
          <ul className="space-y-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-3 font-bold">اختر الخطة</h2>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(PLUS_PLANS) as PlusPlan[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPlan(key)}
                className={cn(
                  "rounded-2xl border p-4 text-center transition",
                  plan === key ? "border-primary bg-accent" : "border-border",
                )}
              >
                <p className="text-sm font-bold">{PLUS_PLANS[key].label}</p>
                <p className="mt-1 text-lg font-black text-primary">
                  {formatIQD(PLUS_PLANS[key].amount)}
                </p>
              </button>
            ))}
          </div>

          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4" /> رصيد محفظتك: {formatIQD(data?.balance ?? 0)}
          </p>

          <Button className="mt-4 h-12 w-full" onClick={() => void activate()} disabled={busy}>
            {busy ? "جاري التفعيل…" : data?.isActive ? "تجديد الاشتراك" : "تفعيل الاشتراك"}
          </Button>
          <Link to="/wallet" className="mt-3 block text-center text-xs font-bold text-primary">
            شحن المحفظة
          </Link>
        </section>

        {!!data?.history.length && (
          <section>
            <h2 className="mb-3 text-base font-bold">سجل الاشتراكات</h2>
            <div className="space-y-2">
              {data.history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-2xl bg-card p-3 text-sm shadow-soft"
                >
                  <span className="font-semibold">
                    {h.plan === "yearly" ? "سنوي" : "شهري"} · {formatIQD(h.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {h.expiresAt
                      ? `حتى ${new Date(h.expiresAt).toLocaleDateString("ar-IQ-u-nu-latn")}`
                      : h.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
