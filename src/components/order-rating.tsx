import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { myOrderRatings, rateOrder } from "@/lib/ratings.functions";

type Target = { type: "provider" | "driver"; id: string; label: string };

/** تقييم المزوّد والمندوب بعد إكمال طلب التوصيل. */
export function OrderRatingCard({
  orderId,
  providerId,
  driverId,
}: {
  orderId: string;
  providerId?: string | null;
  driverId?: string | null;
}) {
  const qc = useQueryClient();
  const submit = useServerFn(rateOrder);
  const load = useServerFn(myOrderRatings);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: existing } = useQuery({
    queryKey: ["order-ratings", orderId],
    queryFn: () => load({ data: { orderId } }),
  });

  const targets: Target[] = [
    ...(providerId ? [{ type: "provider" as const, id: providerId, label: "المتجر / المطعم" }] : []),
    ...(driverId ? [{ type: "driver" as const, id: driverId, label: "المندوب" }] : []),
  ];
  if (targets.length === 0) return null;

  async function send(t: Target) {
    const value = stars[t.type];
    if (!value) {
      toast.error("اختر عدد النجوم أولاً");
      return;
    }
    setBusy(t.type);
    try {
      await submit({
        data: {
          orderId,
          targetType: t.type,
          targetId: t.id,
          stars: value,
          ...(comments[t.type] ? { comment: comments[t.type] } : {}),
        },
      });
      toast.success("شكراً على تقييمك");
      qc.invalidateQueries({ queryKey: ["order-ratings", orderId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ التقييم");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl bg-card p-4 shadow-soft">
      <h2 className="mb-3 font-bold">قيّم تجربتك</h2>
      <div className="space-y-4">
        {targets.map((t) => {
          const done = existing?.find((r) => r.target_type === t.type);
          return (
            <div key={t.type} className="rounded-xl bg-muted/50 p-3">
              <p className="text-sm font-semibold">{t.label}</p>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = (done?.stars ?? stars[t.type] ?? 0) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={!!done}
                      aria-label={`${n} نجوم`}
                      onClick={() => setStars((s) => ({ ...s, [t.type]: n }))}
                    >
                      <Star
                        className={cn(
                          "size-7",
                          active ? "fill-warning text-warning" : "text-muted-foreground/40",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
              {done ? (
                <p className="mt-2 text-xs text-muted-foreground">تم تسجيل تقييمك.</p>
              ) : (
                <>
                  <Input
                    className="mt-2 h-10"
                    placeholder="تعليق (اختياري)"
                    value={comments[t.type] ?? ""}
                    onChange={(e) => setComments((c) => ({ ...c, [t.type]: e.target.value }))}
                  />
                  <Button
                    className="mt-2 h-10 w-full"
                    disabled={busy === t.type}
                    onClick={() => send(t)}
                  >
                    إرسال التقييم
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
