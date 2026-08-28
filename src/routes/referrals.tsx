import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, Copy, Share2 } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireSignedIn } from "@/lib/route-guards";
import { formatIQD } from "@/lib/orders";
import { getMyReferrals, redeemReferral } from "@/lib/referrals.functions";

export const Route = createFileRoute("/referrals")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "ادعُ أصدقاءك | لبابك" },
      {
        name: "description",
        content: "شارك كود الإحالة الخاص بك واحصل على مكافآت عند أول طلب لأصدقائك في لبابك.",
      },
      { property: "og:title", content: "ادعُ أصدقاءك | لبابك" },
      { property: "og:description", content: "نظام الإحالات والمكافآت." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMyReferrals);
  const redeem = useServerFn(redeemReferral);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({ queryKey: ["my-referrals"], queryFn: () => load() });

  async function copy() {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      toast.success("تم نسخ الكود");
    } catch {
      toast.error("تعذر النسخ، انسخه يدوياً");
    }
  }

  async function share() {
    if (!data?.code) return;
    const text = `جرّب تطبيق لبابك واستخدم كود الإحالة ${data.code}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "لبابك", text });
        return;
      } catch {
        /* المستخدم ألغى المشاركة */
      }
    }
    void copy();
  }

  async function redeemCode() {
    if (busy) return;
    setBusy(true);
    try {
      await redeem({ data: { code } });
      toast.success("تم تفعيل كود الإحالة");
      setCode("");
      void qc.invalidateQueries({ queryKey: ["my-referrals"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تفعيل الكود");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/account" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Gift className="size-6" /> ادعُ أصدقاءك
        </h1>
        <p className="mt-1 text-sm opacity-90">كل صديق يطلب، إلك مكافأة بالمحفظة</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <section className="rounded-2xl bg-card p-4 text-center shadow-soft">
          <p className="text-sm text-muted-foreground">كودك الخاص</p>
          <p className="my-2 text-3xl font-black tracking-widest text-primary">
            {data?.code ?? "—"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => void copy()}>
              <Copy className="me-1 size-4" /> نسخ
            </Button>
            <Button className="h-11 flex-1" onClick={() => void share()}>
              <Share2 className="me-1 size-4" /> مشاركة
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card p-4 text-center shadow-soft">
            <p className="text-2xl font-black">{data?.invitedCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">صديق انضم بكودك</p>
          </div>
          <div className="rounded-2xl bg-card p-4 text-center shadow-soft">
            <p className="text-2xl font-black text-success">
              {formatIQD(data?.rewardedTotal ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">مكافآت محققة</p>
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="mb-2 font-bold">عندك كود صديق؟</h2>
          {data?.usedCode ? (
            <p className="text-sm text-muted-foreground">
              استخدمت كود <span className="font-bold">{data.usedCode}</span> سابقاً.
            </p>
          ) : (
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="h-11 flex-1 tracking-widest"
                aria-label="كود الإحالة"
              />
              <Button className="h-11 px-5" onClick={() => void redeemCode()} disabled={busy}>
                تفعيل
              </Button>
            </div>
          )}
        </section>

        {!!data?.invited.length && (
          <section>
            <h2 className="mb-3 text-base font-bold">الإحالات</h2>
            <div className="space-y-2">
              {data.invited.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-2xl bg-card p-3 text-sm shadow-soft"
                >
                  <span>{new Date(r.createdAt).toLocaleDateString("ar-IQ-u-nu-latn")}</span>
                  <span
                    className={
                      r.status === "rewarded" ? "font-bold text-success" : "text-muted-foreground"
                    }
                  >
                    {r.status === "rewarded" ? formatIQD(r.reward) : "بانتظار أول طلب"}
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
