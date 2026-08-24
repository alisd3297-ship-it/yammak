import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminNav, PageShell, StatusDot } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/route-guards";
import {
  adminListSettlements,
  adminSettlementParties,
  approveSettlement,
  generateSettlement,
  listSettlementItems,
  paySettlement,
} from "@/lib/finance.functions";
import { formatIQD } from "@/lib/payments";
import {
  PARTY_TYPE_LABELS,
  PAYOUT_METHOD_LABELS,
  SETTLEMENT_STATUS_LABELS,
  endOfToday,
  settlementTone,
  startOfDaysAgo,
  type PartyType,
  type PayoutMethod,
} from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/settlements")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "التسويات المالية | إدارة لبابك" },
      {
        name: "description",
        content: "توليد تسويات التجار والمندوبين، اعتمادها وصرفها عبر المحفظة أو النقد في لبابك.",
      },
      { property: "og:title", content: "التسويات المالية | إدارة لبابك" },
      { property: "og:description", content: "تسويات وصرفيات المنصة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSettlementsPage,
});

const STATUS_FILTERS = ["all", "draft", "approved", "paid"] as const;

function AdminSettlementsPage() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSettlements);
  const parties = useServerFn(adminSettlementParties);
  const generate = useServerFn(generateSettlement);
  const approve = useServerFn(approveSettlement);
  const pay = useServerFn(paySettlement);
  const items = useServerFn(listSettlementItems);

  const [filter, setFilter] = useState<string>("all");
  const [partyType, setPartyType] = useState<PartyType>("provider");
  const [partyId, setPartyId] = useState<string>("");
  const [days, setDays] = useState<number>(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settlements", filter],
    queryFn: () => list({ data: { status: filter } }),
  });

  const { data: partyOptions } = useQuery({
    queryKey: ["admin-settlement-parties"],
    queryFn: () => parties(),
  });

  const { data: itemRows } = useQuery({
    queryKey: ["settlement-items", openItems],
    enabled: Boolean(openItems),
    queryFn: () => items({ data: { settlementId: openItems ?? "" } }),
  });

  const options = partyType === "provider" ? partyOptions?.providers : partyOptions?.drivers;

  const run = async (label: string, fn: () => Promise<unknown>, key: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(label);
      await qc.invalidateQueries({ queryKey: ["admin-settlements"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">التسويات المالية</h1>
        <p className="mt-1 text-sm opacity-90">توليد واعتماد وصرف تسويات التجار والمندوبين (IQD)</p>
        <AdminNav />
      </header>

      <div className="space-y-5 px-4 py-5">
        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="text-sm font-black">توليد تسوية جديدة</h2>
          <div className="mt-3 grid gap-3">
            <div className="flex gap-2">
              {(["provider", "driver"] as PartyType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setPartyType(t);
                    setPartyId("");
                  }}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold",
                    partyType === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {PARTY_TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            <select
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">اختر الجهة…</option>
              {options?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold",
                    days === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  آخر {d} يوم
                </button>
              ))}
            </div>

            <Button
              disabled={!partyId || busy === "generate"}
              onClick={() =>
                run(
                  "تم توليد التسوية",
                  () =>
                    generate({
                      data: { partyType, partyId, from: startOfDaysAgo(days), to: endOfToday() },
                    }),
                  "generate",
                )
              }
            >
              توليد التسوية
            </Button>
          </div>
        </section>

        <div className="flex gap-2 overflow-x-auto">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold",
                filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {s === "all" ? "الكل" : SETTLEMENT_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && !data?.length && (
          <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
            ماكو تسويات بهذا الفلتر.
          </p>
        )}

        <div className="space-y-3">
          {data?.map((s) => (
            <article key={s.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black">{s.partyName}</span>
                <span className="text-xs text-muted-foreground">{PARTY_TYPE_LABELS[s.partyType]}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <StatusDot tone={settlementTone(s.status)} />
                  {SETTLEMENT_STATUS_LABELS[s.status]}
                </span>
                <span className="font-black">{formatIQD(s.net)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(s.periodStart).toLocaleDateString("ar-IQ-u-nu-latn")} —{" "}
                {new Date(s.periodEnd).toLocaleDateString("ar-IQ-u-nu-latn")} · {s.itemsCount} بند ·
                إجمالي {formatIQD(s.gross)} · عمولة {formatIQD(s.commission)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {s.status === "draft" && (
                  <Button
                    size="sm"
                    disabled={busy === s.id}
                    onClick={() =>
                      run("تم اعتماد التسوية", () => approve({ data: { settlementId: s.id } }), s.id)
                    }
                  >
                    اعتماد
                  </Button>
                )}
                {s.status === "approved" &&
                  (["wallet", "cash", "bank"] as PayoutMethod[]).map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant="outline"
                      disabled={busy === s.id}
                      onClick={() =>
                        run(
                          "تم الصرف",
                          () => pay({ data: { settlementId: s.id, method: m } }),
                          s.id,
                        )
                      }
                    >
                      صرف: {PAYOUT_METHOD_LABELS[m]}
                    </Button>
                  ))}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenItems(openItems === s.id ? null : s.id)}
                >
                  {openItems === s.id ? "إخفاء البنود" : "عرض البنود"}
                </Button>
              </div>

              {openItems === s.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {!itemRows?.length && (
                    <p className="text-xs text-muted-foreground">ماكو بنود في هذه الفترة.</p>
                  )}
                  {itemRows?.map((i) => (
                    <div key={i.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{i.label}</span>
                      <span className="font-semibold">{formatIQD(i.net)}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
