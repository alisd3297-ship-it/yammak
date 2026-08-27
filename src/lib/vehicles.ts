export type VehicleType = "bike" | "tuktuk" | "car" | "pickup" | "small_truck";

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  bike: "دراجة",
  tuktuk: "ستوتة",
  car: "سيارة",
  pickup: "بيك أب",
  small_truck: "شاحنة حمل",
};

export const VEHICLE_HINTS: Record<VehicleType, string> = {
  bike: "أغراض صغيرة وخفيفة",
  tuktuk: "أغراض متوسطة وصناديق خفيفة",
  car: "أغراض متوسطة وصناديق",
  pickup: "أثاث وأحمال كبيرة",
  small_truck: "نقل عفش وأحمال ثقيلة",
};

export const VEHICLE_ORDER: VehicleType[] = ["bike", "tuktuk", "car", "pickup", "small_truck"];

/** خيارات المندوب المعتمدة: دراجة، ستوتة، سيارة، شاحنة حمل. */
export const DRIVER_VEHICLE_ORDER: VehicleType[] = ["bike", "tuktuk", "car", "small_truck"];

/** ترتيب سعة المركبة: المندوب يستحق العرض إذا كانت مركبته بنفس السعة أو أعلى. */
export const VEHICLE_RANK: Record<VehicleType, number> = {
  bike: 1,
  tuktuk: 2,
  car: 2,
  pickup: 3,
  small_truck: 4,
};

export function vehicleLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return VEHICLE_LABELS[v as VehicleType] ?? null;
}
