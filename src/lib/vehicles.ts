export type VehicleType = "bike" | "car" | "pickup" | "small_truck";

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  bike: "دراجة",
  car: "سيارة",
  pickup: "بيك أب",
  small_truck: "شاحنة صغيرة",
};

export const VEHICLE_HINTS: Record<VehicleType, string> = {
  bike: "أغراض صغيرة وخفيفة",
  car: "أغراض متوسطة وصناديق",
  pickup: "أثاث وأحمال كبيرة",
  small_truck: "نقل عفش وأحمال ثقيلة",
};

export const VEHICLE_ORDER: VehicleType[] = ["bike", "car", "pickup", "small_truck"];

/** ترتيب سعة المركبة: المندوب يستحق العرض إذا كانت مركبته بنفس السعة أو أعلى. */
export const VEHICLE_RANK: Record<VehicleType, number> = {
  bike: 1,
  car: 2,
  pickup: 3,
  small_truck: 4,
};

export function vehicleLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return VEHICLE_LABELS[v as VehicleType] ?? null;
}
