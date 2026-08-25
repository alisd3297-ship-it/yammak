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
  preparing: "تم القبول",
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
  return new Intl.NumberFormat("ar-IQ-u-nu-latn", { maximumFractionDigits: 0 }).format(value) + " د.ع";
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

export const CUSTOMER_STATUS_FLOW: OrderStatus[] = [
  "awaiting_provider",
  "accepted",
  "ready_for_pickup",
  "searching_driver",
  "driver_accepted",
  "picked_up",
  "on_the_way",
  "delivered",
];

/** مسار حالات طلب المندوب المستقل (بدون مقدم خدمة). */
export const COURIER_STATUS_FLOW: OrderStatus[] = [
  "searching_driver",
  "driver_accepted",
  "driver_heading_pickup",
  "picked_up",
  "on_the_way",
  "delivered",
];

export const COURIER_STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  searching_driver: "جاري البحث عن مندوب",
  offered_to_driver: "تم إرسال الطلب لمندوب",
  driver_accepted: "المندوب قبل المهمة",
  driver_heading_pickup: "المندوب متوجه لنقطة الاستلام",
  picked_up: "تم استلام الغرض",
  on_the_way: "بالطريق لنقطة التسليم",
  delivered: "تم التسليم",
};

export function isCourierType(t: string | null | undefined): boolean {
  return t === "courier" || t === "special_delivery";
}

/** طريقة استلام الطلب من المطعم/المتجر. */
export type Fulfillment = "delivery" | "takeaway" | "dine_in";

export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  delivery: "توصيل",
  takeaway: "سفري",
  dine_in: "حجز بالصالة",
};

export function asFulfillment(v: string | null | undefined): Fulfillment {
  return v === "takeaway" || v === "dine_in" ? v : "delivery";
}

/** مسار الحالات كما يراه الزبون حسب طريقة الاستلام. */
export function customerFlowFor(fulfillment: Fulfillment): OrderStatus[] {
  if (fulfillment === "delivery") return CUSTOMER_STATUS_FLOW;
  return ["awaiting_provider", "accepted", "ready_for_pickup", "completed"];
}

/** تسميات مبسّطة للحالة حسب طريقة الاستلام. */
export function statusLabelFor(status: OrderStatus, fulfillment: Fulfillment): string {
  if (fulfillment !== "delivery") {
    if (status === "awaiting_provider") return "تم إرسال الطلب";
    if (status === "ready_for_pickup")
      return fulfillment === "dine_in" ? "طلبك جاهز بالصالة" : "جاهز للاستلام من المحل";
  }
  return ORDER_STATUS_LABELS[status];
}
