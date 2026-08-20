export type OrderStatus =
  | "new"
  | "awaiting_provider"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "searching_driver"
  | "offered_to_driver"
  | "driver_accepted"
  | "driver_heading_pickup"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "completed"
  | "cancelled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "طلب جديد",
  awaiting_provider: "بانتظار قبول مقدم الخدمة",
  accepted: "تم القبول",
  preparing: "قيد التجهيز",
  ready_for_pickup: "جاهز للاستلام",
  searching_driver: "جاري البحث عن مندوب",
  offered_to_driver: "تم إرسال الطلب للمندوب",
  driver_accepted: "تم قبول المهمة",
  driver_heading_pickup: "المندوب في الطريق للاستلام",
  picked_up: "تم استلام الطلب",
  on_the_way: "في الطريق إليك",
  delivered: "تم التوصيل",
  completed: "مكتمل",
  cancelled: "ملغى",
};

export const ACTIVE_STATUSES: OrderStatus[] = [
  "new",
  "awaiting_provider",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "searching_driver",
  "offered_to_driver",
  "driver_accepted",
  "driver_heading_pickup",
  "picked_up",
  "on_the_way",
];

export function statusTone(status: OrderStatus): "muted" | "warning" | "success" | "danger" {
  if (status === "cancelled") return "danger";
  if (status === "completed" || status === "delivered") return "success";
  if (ACTIVE_STATUSES.includes(status)) return "warning";
  return "muted";
}

export function formatIQD(value: number): string {
  return new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(value) + " د.ع";
}

export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
