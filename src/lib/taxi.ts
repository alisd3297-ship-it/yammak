export type TripStatus =
  | "requested"
  | "searching_driver"
  | "driver_assigned"
  | "driver_arriving"
  | "driver_arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TaxiClass = "economy" | "comfort" | "van";

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  requested: "تم الطلب",
  searching_driver: "نبحث عن سائق",
  driver_assigned: "تم قبول الرحلة",
  driver_arriving: "السائق بالطريق إلك",
  driver_arrived: "السائق وصل",
  in_progress: "الرحلة جارية",
  completed: "انتهت الرحلة",
  cancelled: "ملغاة",
};

export const TRIP_FLOW: TripStatus[] = [
  "searching_driver",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
  "completed",
];

export const OPEN_TRIP_STATUSES: TripStatus[] = [
  "requested",
  "searching_driver",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
];

export function tripTone(status: TripStatus): "muted" | "warning" | "success" | "danger" {
  if (status === "cancelled") return "danger";
  if (status === "completed") return "success";
  if (status === "requested" || status === "searching_driver") return "warning";
  return "muted";
}

export const TAXI_CLASSES: { key: TaxiClass; label: string; hint: string; seats: number }[] = [
  { key: "economy", label: "اقتصادي", hint: "سيارة عادية حتى 4 ركاب", seats: 4 },
  { key: "comfort", label: "مريح", hint: "سيارة حديثة ومكيفة", seats: 4 },
  { key: "van", label: "عائلي", hint: "فان حتى 6 ركاب", seats: 6 },
];

export const TAXI_CLASS_LABELS: Record<TaxiClass, string> = {
  economy: "اقتصادي",
  comfort: "مريح",
  van: "عائلي",
};

export const TAXI_CLASS_RANK: Record<TaxiClass, number> = { economy: 1, comfort: 2, van: 3 };

export function taxiClassLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return TAXI_CLASS_LABELS[v as TaxiClass] ?? null;
}

/** خطوات السائق ضمن الرحلة — الانتقال الوحيد المسموح من كل حالة. */
export const TAXI_DRIVER_STEPS: Partial<Record<TripStatus, { next: TripStatus; label: string }>> = {
  driver_assigned: { next: "driver_arriving", label: "متوجه للراكب" },
  driver_arriving: { next: "driver_arrived", label: "وصلت لنقطة الانطلاق" },
  driver_arrived: { next: "in_progress", label: "بدء الرحلة" },
  in_progress: { next: "completed", label: "إنهاء الرحلة" },
};
