import { formatIQD } from "@/lib/orders";

export type ServiceRequestStatus =
  | "requested"
  | "accepted"
  | "scheduled"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rejected";

export type ServicePriceUnit = "fixed" | "hourly" | "daily" | "visit" | "negotiable";

export const SERVICE_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  requested: "بانتظار قبول مقدم الخدمة",
  accepted: "تم القبول",
  scheduled: "مجدول بموعد",
  en_route: "مقدم الخدمة بالطريق",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
  rejected: "مرفوض",
};

export const SERVICE_ACTIVE_STATUSES: ServiceRequestStatus[] = [
  "requested",
  "accepted",
  "scheduled",
  "en_route",
  "in_progress",
];

export function serviceStatusTone(
  status: ServiceRequestStatus,
): "muted" | "warning" | "success" | "danger" {
  if (status === "cancelled" || status === "rejected") return "danger";
  if (status === "completed") return "success";
  if (SERVICE_ACTIVE_STATUSES.includes(status)) return "warning";
  return "muted";
}

export const PRICE_UNIT_LABELS: Record<ServicePriceUnit, string> = {
  fixed: "سعر مقطوع",
  hourly: "بالساعة",
  daily: "باليوم",
  visit: "أجرة زيارة",
  negotiable: "بالاتفاق",
};

export function formatServicePrice(amount: number, unit: ServicePriceUnit): string {
  if (unit === "negotiable" || amount <= 0) return "السعر بالاتفاق";
  const suffix =
    unit === "hourly" ? " / ساعة" : unit === "daily" ? " / يوم" : unit === "visit" ? " / زيارة" : "";
  return `${formatIQD(amount)}${suffix}`;
}

/** الخطوة التالية المتاحة لمقدم الخدمة حسب الحالة الحالية. */
export const PROVIDER_NEXT_STEPS: Partial<
  Record<ServiceRequestStatus, { next: ServiceRequestStatus; label: string }[]>
> = {
  requested: [
    { next: "accepted", label: "قبول الطلب" },
    { next: "scheduled", label: "جدولة بموعد" },
  ],
  accepted: [
    { next: "en_route", label: "بالطريق" },
    { next: "in_progress", label: "بدء التنفيذ" },
  ],
  scheduled: [
    { next: "en_route", label: "بالطريق" },
    { next: "in_progress", label: "بدء التنفيذ" },
  ],
  en_route: [{ next: "in_progress", label: "بدء التنفيذ" }],
  in_progress: [{ next: "completed", label: "إنهاء الخدمة" }],
};
