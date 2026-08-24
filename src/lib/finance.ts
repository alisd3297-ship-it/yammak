export type WalletDirection = "credit" | "debit";
export type SettlementStatus = "draft" | "approved" | "paid" | "cancelled";
export type PayoutMethod = "wallet" | "cash" | "bank";
export type RefundRequestStatus = "pending" | "approved" | "rejected" | "processed";
export type PartyType = "provider" | "driver";

export const WALLET_DIRECTION_LABELS: Record<WalletDirection, string> = {
  credit: "إيداع",
  debit: "خصم",
};

export const WALLET_REASON_LABELS: Record<string, string> = {
  payment: "دفع طلب",
  refund: "استرجاع",
  settlement: "تسوية",
  admin_adjust: "تعديل إداري",
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  paid: "مصروفة",
  cancelled: "ملغاة",
};

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  wallet: "محفظة",
  cash: "نقد",
  bank: "حوالة",
};

export const REFUND_REQUEST_STATUS_LABELS: Record<RefundRequestStatus, string> = {
  pending: "بانتظار المراجعة",
  approved: "معتمد قيد التنفيذ",
  rejected: "مرفوض",
  processed: "منفّذ",
};

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  provider: "مقدم خدمة",
  driver: "مندوب",
};

export function settlementTone(status: SettlementStatus): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "approved") return "warning";
  if (status === "cancelled") return "danger";
  return "muted";
}

export function refundTone(status: RefundRequestStatus): "success" | "warning" | "danger" | "muted" {
  if (status === "processed") return "success";
  if (status === "rejected") return "danger";
  if (status === "approved") return "warning";
  return "muted";
}

/** كل الأرصدة بالدينار العراقي؛ الدولار للعرض فقط. */
export function formatUsdHint(amountIqd: number, usdToIqd: number): string | null {
  if (!usdToIqd || usdToIqd <= 0) return null;
  const usd = amountIqd / usdToIqd;
  if (usd < 0.01) return null;
  return `≈ ${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} $`;
}

export function startOfDaysAgo(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function endOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}
