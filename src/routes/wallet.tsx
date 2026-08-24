import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet as WalletIcon, ArrowDownCircle, ArrowUpCircle, ReceiptText } from "lucide-react";
import { BackButton, BottomNav, PageShell  } from "@/components/app-shell";
import { requireSignedIn } from "@/lib/route-guards";
import { getMyWallet, listMyInvoices, listMyRefundRequests } from "@/lib/wallet.functions";
import { formatIQD } from "@/lib/payments";
import {
  REFUND_REQUEST_STATUS_LABELS,
  WALLET_DIRECTION_LABELS,
  WALLET_REASON_LABELS,
  formatUsdHint,
} from "@/lib/finance";
import { useFeature } from "@/lib/features";

export const Route = createFileRoute("/wallet")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "محفظة يمّك | الرصيد والحركات" },
      {
        name: "description",
        content: "رصيد محفظتك بالدينار العراقي، حركات الإيداع والخصم، طلبات الاسترجاع وفواتيرك في يمّك.",
      },
      { property: "og:title", content: "محفظة يمّك" },
      { property: "og:description", content: "رصيدك وحركاتك المالية في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const walletEnabled = useFeature("wallet");
  const invoicesEnabled = useFeature("invoices");
  const fetchWallet = useServerFn(getMyWallet);
  const fetchRefunds = useServerFn(listMyRefundRequests);
  const fetchInvoices = useServerFn(listMyInvoices);

  const { data, isLoading } = useQuery({ queryKey: ["my-wallet"], queryFn: () => fetchWallet() });
  const { data: refunds } = useQuery({ queryKey: ["my-refunds"], queryFn: () => fetchRefunds() });
  const { data: invoices } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: () => fetchInvoices(),
    enabled: invoicesEnabled,
  });

  const usdHint = data ? formatUsdHint(data.balance, data.usdToIqd) : null;

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/payments" label="عمليات الدفع" />
        <h1 className="text-2xl font-black">محفظة يمّك</h1>
        <div className="mt-4 rounded-2xl bg-primary-foreground/15 p-4 backdrop-blur">
          <span className="flex items-center gap-2 text-sm opacity-90">
            <WalletIcon className="size-4" /> الرصيد الحالي
          </span>
          <p className="mt-1 text-3xl font-black">{formatIQD(data?.balance ?? 0)}</p>
          {usdHint && <p className="mt-1 text-xs opacity-80">{usdHint} (عرض فقط)</p>}
        </div>
      </header>

      <div className="space-y-5 px-4 py-5">
        {!walletEnabled && (
          <p className="rounded-2xl bg-card p-4 text-center text-sm text-muted-foreground shadow-soft">
            المحفظة قيد التهيئة حالياً. الرصيد والحركات تظهر هنا بمجرد تفعيلها.
          </p>
        )}
        {data?.isLocked && (
          <p className="rounded-2xl bg-destructive/10 p-4 text-center text-sm font-semibold text-destructive">
            محفظتك موقوفة مؤقتاً، راجع الدعم.
          </p>
        )}

        <section>
          <h2 className="mb-2 text-sm font-black">آخر الحركات</h2>
          {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
          {!isLoading && !data?.transactions.length && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
              ماكو حركات لحد الآن.
            </p>
          )}
          <div className="space-y-2">
            {data?.transactions.map((t) => (
              <article key={t.id} className="rounded-2xl bg-card p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    {t.direction === "credit" ? (
                      <ArrowDownCircle className="size-4 text-success" />
                    ) : (
                      <ArrowUpCircle className="size-4 text-destructive" />
                    )}
                    {WALLET_DIRECTION_LABELS[t.direction]}
                    <span className="text-xs font-normal text-muted-foreground">
                      {WALLET_REASON_LABELS[t.reason] ?? t.reason}
                    </span>
                  </span>
                  <span className="font-black">
                    {t.direction === "credit" ? "+" : "−"} {formatIQD(t.amount)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>الرصيد بعدها: {formatIQD(t.balanceAfter)}</span>
                  <span>{new Date(t.createdAt).toLocaleString("ar-IQ-u-nu-latn")}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {!!refunds?.length && (
          <section>
            <h2 className="mb-2 text-sm font-black">طلبات الاسترجاع</h2>
            <div className="space-y-2">
              {refunds.map((r) => (
                <article key={r.id} className="rounded-2xl bg-card p-4 shadow-soft">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold">{formatIQD(r.amount)}</span>
                    <span className="text-xs text-muted-foreground">
                      {REFUND_REQUEST_STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
                  {r.note && <p className="mt-1 text-xs text-muted-foreground">ملاحظة الإدارة: {r.note}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {invoicesEnabled && !!invoices?.length && (
          <section>
            <h2 className="mb-2 text-sm font-black">الفواتير</h2>
            <div className="space-y-2">
              {invoices.map((i) => (
                <article key={i.id} className="rounded-2xl bg-card p-4 shadow-soft">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-bold">
                      <ReceiptText className="size-4 text-primary" /> {i.number}
                    </span>
                    <span className="font-black">{formatIQD(i.total)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(i.issuedAt).toLocaleString("ar-IQ-u-nu-latn")}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
      <BottomNav />
    </PageShell>
  );
}
