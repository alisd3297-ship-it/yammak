export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaymentSubject = "order" | "trip" | "service_request";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "بانتظار الدفع",
  processing: "قيد المعالجة",
  succeeded: "مدفوع",
  failed: "فشل الدفع",
  cancelled: "ملغي",
  refunded: "مسترجع",
};

export const PAYMENT_SUBJECT_LABELS: Record<PaymentSubject, string> = {
  order: "طلب",
  trip: "رحلة",
  service_request: "طلب خدمة",
};

export function paymentTone(status: PaymentStatus): "ok" | "warn" | "bad" {
  if (status === "succeeded") return "ok";
  if (status === "failed" || status === "cancelled") return "bad";
  return "warn";
}

export function formatIQD(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} د.ع`;
}
