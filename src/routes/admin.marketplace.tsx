import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Store, ShieldCheck } from "lucide-react";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireStaff } from "@/lib/route-guards";
import { formatIQD } from "@/lib/orders";
import { LISTING_STATUS_LABELS, listAllListings, reviewListing } from "@/lib/marketplace.functions";
import { CLAIM_STATUS_LABELS, decideClaim, listAllClaims } from "@/lib/guarantee.functions";

export const Route = createFileRoute("/admin/marketplace")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "السوق والضمان | إدارة لبابك" },
      {
        name: "description",
        content: "مراجعة إعلانات سوق لبابك والبتّ بمطالبات ضمان لبابك مع صرف التعويضات.",
      },
      { property: "og:title", content: "السوق والضمان | إدارة لبابك" },
      { property: "og:description", content: "مراجعة الإعلانات ومطالبات الضمان." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminMarketplacePage,
});

function AdminMarketplacePage() {
  const qc = useQueryClient();
  const listingsFn = useServerFn(listAllListings);
  const reviewFn = useServerFn(reviewListing);
  const claimsFn = useServerFn(listAllClaims);
  const decideFn = useServerFn(decideClaim);

  const { data: listings } = useQuery({
    queryKey: ["admin-listings"],
    queryFn: () => listingsFn(),
  });
  const { data: claims } = useQuery({ queryKey: ["admin-claims"], queryFn: () => claimsFn() });
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  async function review(id: string, status: "published" | "rejected") {
    try {
      await reviewFn({ data: { id, status } });
      toast.success(status === "published" ? "تم النشر" : "تم الرفض");
      await qc.invalidateQueries({ queryKey: ["admin-listings"] });
    } catch {
      toast.error("تعذر تحديث الإعلان");
    }
  }

  async function decide(
    claimId: string,
    status: "approved" | "rejected" | "compensated",
    compensation?: number,
  ) {
    try {
      await decideFn({ data: { claimId, status, compensation: compensation ?? 0 } });
      toast.success("تم تحديث المطالبة");
      await qc.invalidateQueries({ queryKey: ["admin-claims"] });
    } catch {
      toast.error("تعذر تحديث المطالبة");
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground">
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Store className="size-6" /> السوق والضمان
        </h1>
        <p className="mt-1 text-sm opacity-90">مراجعة إعلانات السوق ومطالبات ضمان لبابك</p>
      </header>
      <AdminNav />

      <div className="space-y-6 px-4 py-5">
        <section className="space-y-2">
          <h2 className="text-base font-bold">إعلانات السوق</h2>
          {(listings ?? []).map((l) => (
            <div key={l.id} className="rounded-2xl bg-card p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold">{l.title}</p>
                <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold">
                  {LISTING_STATUS_LABELS[l.status] ?? l.status}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.description}</p>
              {l.price != null && <p className="mt-1 text-xs font-bold">{formatIQD(l.price)}</p>}
              {l.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <Button
                    className="h-9 px-3 text-xs"
                    onClick={() => void review(l.id, "published")}
                  >
                    نشر
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 px-3 text-xs"
                    onClick={() => void review(l.id, "rejected")}
                  >
                    رفض
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!listings?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو إعلانات.</p>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <ShieldCheck className="size-4 text-primary" /> مطالبات الضمان
          </h2>
          {(claims ?? []).map((c) => (
            <div key={c.id} className="rounded-2xl bg-card p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <p className="line-clamp-2 flex-1 text-sm">{c.description}</p>
                <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold">
                  {CLAIM_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              {(c.status === "pending" || c.status === "reviewing" || c.status === "approved") && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    className="h-9 w-32"
                    placeholder="مبلغ التعويض"
                    aria-label="مبلغ التعويض"
                    value={amounts[c.id] ?? ""}
                    onChange={(e) => setAmounts((p) => ({ ...p, [c.id]: e.target.value }))}
                  />
                  <Button
                    className="h-9 px-3 text-xs"
                    onClick={() =>
                      void decide(c.id, "compensated", Number(amounts[c.id] ?? 0) || 0)
                    }
                  >
                    تعويض
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 px-3 text-xs"
                    onClick={() => void decide(c.id, "approved")}
                  >
                    قبول
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 px-3 text-xs"
                    onClick={() => void decide(c.id, "rejected")}
                  >
                    رفض
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!claims?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو مطالبات.</p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
