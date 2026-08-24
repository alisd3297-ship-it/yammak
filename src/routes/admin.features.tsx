import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminNav, PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/route-guards";
import { setFeatureFlag } from "@/lib/finance.functions";
import { PHASE_LABELS, useFeatureFlags } from "@/lib/features";

export const Route = createFileRoute("/admin/features")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "مفاتيح الميزات | إدارة لبابك" },
      {
        name: "description",
        content: "تفعيل ميزات لبابك تدريجياً: نسبة التفعيل والجمهور المستهدف لكل ميزة على حدة.",
      },
      { property: "og:title", content: "مفاتيح الميزات | إدارة لبابك" },
      { property: "og:description", content: "تفعيل تدريجي آمن لكل ميزة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFeaturesPage,
});

function AdminFeaturesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useFeatureFlags();
  const save = useServerFn(setFeatureFlag);
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (
    key: string,
    patch: { isEnabled?: boolean; rolloutPercent?: number; audience?: "all" | "staff" },
  ) => {
    setBusy(key);
    try {
      await save({ data: { key, ...patch } });
      toast.success("تم التحديث");
      await qc.invalidateQueries({ queryKey: ["feature-flags"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التحديث");
    } finally {
      setBusy(null);
    }
  };

  const phases = [...new Set((data ?? []).map((f) => f.phase))].sort((a, b) => a - b);

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">مفاتيح الميزات</h1>
        <p className="mt-1 text-sm opacity-90">فعّل كل ميزة تدريجياً بدون أي أثر على ما يعمل حالياً</p>
        <AdminNav />
      </header>

      <div className="space-y-6 px-4 py-5">
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}

        {phases.map((phase) => (
          <section key={phase}>
            <h2 className="mb-2 text-sm font-black">
              المرحلة {phase} — {PHASE_LABELS[phase] ?? "ميزات"}
            </h2>
            <div className="space-y-2">
              {(data ?? [])
                .filter((f) => f.phase === phase)
                .map((f) => (
                  <article key={f.key} className="rounded-2xl bg-card p-4 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-black">
                          <StatusDot tone={f.is_enabled ? "success" : "muted"} />
                          {f.label}
                        </p>
                        {f.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={f.is_enabled ? "outline" : "default"}
                        disabled={busy === f.key}
                        onClick={() => update(f.key, { isEnabled: !f.is_enabled })}
                      >
                        {f.is_enabled ? "إيقاف" : "تفعيل"}
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">نسبة التفعيل:</span>
                      {[10, 50, 100].map((p) => (
                        <button
                          key={p}
                          disabled={busy === f.key}
                          onClick={() => update(f.key, { rolloutPercent: p })}
                          className={
                            f.rollout_percent === p
                              ? "rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground"
                              : "rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground"
                          }
                        >
                          {p}%
                        </button>
                      ))}
                      <span className="ms-2 text-muted-foreground">الجمهور:</span>
                      {(["all", "staff"] as const).map((a) => (
                        <button
                          key={a}
                          disabled={busy === f.key}
                          onClick={() => update(f.key, { audience: a })}
                          className={
                            f.audience === a
                              ? "rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground"
                              : "rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground"
                          }
                        >
                          {a === "all" ? "الجميع" : "الإدارة"}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
