import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAdStatus } from "@/lib/ads.functions";
import { AD_STATUS_LABEL, AD_STATUS_TONE, formatAdPrice, type AdRow, type AdStatus } from "@/lib/ads";
import { AdImage } from "@/components/ad-image";
import { useAccount } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { requireStaff } from "@/lib/route-guards";

export const Route = createFileRoute("/admin/ads")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "إدارة الإعلانات | يمّك" },
      { name: "description", content: "مراجعة إعلانات المستخدمين والموافقة والرفض والإيقاف وتحديد مدة النشر والترتيب." },
      { property: "og:title", content: "إدارة الإعلانات | يمّك" },
      { property: "og:description", content: "لوحة الإدارة لمراجعة الإعلانات في تطبيق يمّك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAdsPage,
});

const FILTERS: Array<{ key: AdStatus | "all"; label: string }> = [
  { key: "pending", label: "قيد المراجعة" },
  { key: "published", label: "منشور" },
  { key: "rejected", label: "مرفوض" },
  { key: "paused", label: "موقوف" },
  { key: "expired", label: "منتهي" },
  { key: "all", label: "الكل" },
];

function AdminAdsPage() {
  const queryClient = useQueryClient();
  const decide = useServerFn(setAdStatus);
  const [filter, setFilter] = useState<AdStatus | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { sort?: string; expires?: string; reason?: string }>>({});
  const { data: account } = useAccount();
  const isStaff = (account?.roles ?? []).some((r) => ["super_admin", "admin", "supervisor"].includes(r));

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ads", filter],
    queryFn: async () => {
      let query = supabase
        .from("ads")
        .select(
          "id, category_id, title, body, price, contact_phone, address_text, images, status, rejection_reason, sort_order, published_at, expires_at, created_at, ad_categories(name)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (filter !== "all") query = query.eq("status", filter);
      const { data: rows } = await query;
      return (rows ?? []) as Array<AdRow & { ad_categories: { name: string } | null }>;
    },
    enabled: isStaff,
  });

  async function act(ad: AdRow, status: AdStatus) {
    const draft = drafts[ad.id] ?? {};
    if (status === "rejected" && !draft.reason?.trim()) {
      toast.error("اكتب سبب الرفض");
      return;
    }
    setBusy(ad.id);
    try {
      await decide({
        data: {
          adId: ad.id,
          status,
          reason: draft.reason?.trim() || null,
          sortOrder: draft.sort?.trim() ? Number(draft.sort) : null,
          expiresAt: draft.expires ? new Date(draft.expires).toISOString() : null,
        },
      });
      toast.success(`تم تحديث الإعلان: ${AD_STATUS_LABEL[status]}`);
      await queryClient.invalidateQueries({ queryKey: ["admin-ads"] });
      await queryClient.invalidateQueries({ queryKey: ["ads-board"] });
    } catch (error) {
      toast.error((error as Error).message || "تعذر تنفيذ الإجراء");
    } finally {
      setBusy(null);
    }
  }

  if (!isStaff)
    return (
      <PageShell>
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">هذه الصفحة مخصصة لفريق إدارة يمّك.</p>
          <Link to="/" className="mt-3 inline-block font-semibold text-primary">
            رجوع للرئيسية
          </Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-6 text-primary-foreground shadow-card">
        <div className="flex items-center gap-3">
          <Link to="/" aria-label="رجوع" className="rounded-full bg-white/15 p-2">
            <ArrowRight className="size-5" />
          </Link>
          <h1 className="text-xl font-black">إدارة الإعلانات</h1>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition",
                filter === item.key ? "bg-primary text-primary-foreground" : "bg-card shadow-soft",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="rounded-2xl bg-card p-5 text-center text-sm text-muted-foreground shadow-soft">جاري التحميل…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-card p-5 text-center text-sm text-muted-foreground shadow-soft">لا توجد إعلانات هنا.</p>
        ) : (
          (data ?? []).map((ad) => {
            const draft = drafts[ad.id] ?? {};
            const update = (patch: Partial<{ sort: string; expires: string; reason: string }>) =>
              setDrafts((current) => ({ ...current, [ad.id]: { ...current[ad.id], ...patch } }));
            return (
              <article key={ad.id} className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
                <div className="flex items-center gap-2">
                  <StatusDot tone={AD_STATUS_TONE[ad.status]} />
                  <span className="text-xs font-bold">{AD_STATUS_LABEL[ad.status]}</span>
                  <span className="ms-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">
                    {ad.ad_categories?.name ?? "—"}
                  </span>
                </div>

                <div className="flex gap-3">
                  {ad.images[0] ? (
                    <AdImage path={ad.images[0]} className="size-20 rounded-xl object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <Link to="/ads/$id" params={{ id: ad.id }} className="font-bold underline-offset-4 hover:underline">
                      {ad.title}
                    </Link>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{ad.body}</p>
                    <p className="text-sm font-bold text-primary">{formatAdPrice(ad.price)}</p>
                    <p className="text-xs text-muted-foreground">
                      {ad.contact_phone} — {ad.address_text}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`sort-${ad.id}`} className="text-xs">
                      الترتيب
                    </Label>
                    <Input
                      id={`sort-${ad.id}`}
                      inputMode="numeric"
                      value={draft.sort ?? String(ad.sort_order)}
                      onChange={(e) => update({ sort: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`exp-${ad.id}`} className="text-xs">
                      ينتهي في
                    </Label>
                    <Input
                      id={`exp-${ad.id}`}
                      type="date"
                      value={draft.expires ?? (ad.expires_at ? ad.expires_at.slice(0, 10) : "")}
                      onChange={(e) => update({ expires: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`reason-${ad.id}`} className="text-xs">
                    سبب الرفض (عند الرفض)
                  </Label>
                  <Input id={`reason-${ad.id}`} value={draft.reason ?? ""} onChange={(e) => update({ reason: e.target.value })} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy === ad.id} onClick={() => void act(ad, "published")}>
                    {busy === ad.id ? <Loader2 className="size-4 animate-spin" /> : null} نشر
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy === ad.id} onClick={() => void act(ad, "rejected")}>
                    رفض
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy === ad.id} onClick={() => void act(ad, "paused")}>
                    إيقاف
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === ad.id} onClick={() => void act(ad, "expired")}>
                    إنهاء
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === ad.id} onClick={() => void act(ad, "pending")}>
                    إعادة للمراجعة
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
