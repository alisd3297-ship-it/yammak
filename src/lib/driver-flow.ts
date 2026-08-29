import { useCallback, useEffect, useState } from "react";
import type { OrderStatus } from "@/lib/orders";

/**
 * مراحل مهمة المندوب كما يراها في الواجهة.
 * بعض المراحل («وصلت لمكان الاستلام» و«وصلت للزبون») مراحل تأكيد محلية
 * لا تغيّر حالة الطلب في قاعدة البيانات، حتى لا نكسر دورة الطلب الحالية،
 * لكنها تمنع القفز العشوائي وتوضح الخطوة التالية للمندوب.
 */
export type DriverStage =
  | "accepted"
  | "heading_pickup"
  | "at_pickup"
  | "picked_up"
  | "heading_customer"
  | "at_customer"
  | "done";

export type ArrivalFlag = "none" | "pickup" | "dropoff";

export const DRIVER_STAGE_LABELS: Record<DriverStage, string> = {
  accepted: "قبلت المهمة",
  heading_pickup: "متوجه لمكان الاستلام",
  at_pickup: "وصلت لمكان الاستلام",
  picked_up: "استلمت الطلب",
  heading_customer: "متوجه للزبون",
  at_customer: "وصلت للزبون",
  done: "تم التسليم",
};

/** ترتيب المراحل المعروض في الخط الزمني. */
export const DRIVER_STAGE_ORDER: DriverStage[] = [
  "accepted",
  "heading_pickup",
  "at_pickup",
  "picked_up",
  "heading_customer",
  "at_customer",
  "done",
];

export function stageOf(status: OrderStatus, arrival: ArrivalFlag): DriverStage {
  switch (status) {
    case "driver_accepted":
      return "accepted";
    case "driver_heading_pickup":
      return arrival === "pickup" || arrival === "dropoff" ? "at_pickup" : "heading_pickup";
    case "picked_up":
      return "picked_up";
    case "on_the_way":
      return arrival === "dropoff" ? "at_customer" : "heading_customer";
    default:
      return "done";
  }
}

export type StageAction =
  | { kind: "status"; next: OrderStatus; label: string }
  | { kind: "arrival"; flag: ArrivalFlag; label: string }
  | null;

/** الإجراء الوحيد المسموح في المرحلة الحالية (لا قفز بين الحالات). */
export function nextActionFor(stage: DriverStage, pickupLabel: string): StageAction {
  switch (stage) {
    case "accepted":
      return { kind: "status", next: "driver_heading_pickup", label: `التوجه إلى ${pickupLabel}` };
    case "heading_pickup":
      return { kind: "arrival", flag: "pickup", label: "وصلت لمكان الاستلام" };
    case "at_pickup":
      return { kind: "status", next: "picked_up", label: "استلمت الطلب" };
    case "picked_up":
      return { kind: "status", next: "on_the_way", label: "التوجه للزبون" };
    case "heading_customer":
      return { kind: "arrival", flag: "dropoff", label: "وصلت للزبون" };
    case "at_customer":
      return { kind: "status", next: "delivered", label: "تسليم الطلب" };
    default:
      return null;
  }
}

const KEY = (orderId: string) => `lubabak.driver.arrival.${orderId}`;

/** تأكيدات الوصول تُحفظ محلياً على جهاز المندوب فقط. */
export function useArrivalFlag(orderId: string): [ArrivalFlag, (f: ArrivalFlag) => void] {
  const [flag, setFlag] = useState<ArrivalFlag>("none");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem(KEY(orderId));
    setFlag(v === "pickup" || v === "dropoff" ? v : "none");
  }, [orderId]);

  const update = useCallback(
    (f: ArrivalFlag) => {
      setFlag(f);
      if (typeof window === "undefined") return;
      if (f === "none") window.localStorage.removeItem(KEY(orderId));
      else window.localStorage.setItem(KEY(orderId), f);
    },
    [orderId],
  );

  return [flag, update];
}

export function clearArrivalFlag(orderId: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY(orderId));
}

/* ------------------------------------------------------------------ */
/* التدفق المختصر المعروض للمندوب: قبول المهمة → جاهز → تم التسليم      */
/* الحالات الداخلية للطلب تبقى كما هي، لكن الواجهة تعرض ٣ مراحل فقط.    */
/* ------------------------------------------------------------------ */

export type SimpleStage = "accepted" | "ready" | "delivered";

export const SIMPLE_STAGE_ORDER: SimpleStage[] = ["accepted", "ready", "delivered"];

export const SIMPLE_STAGE_LABELS: Record<SimpleStage, string> = {
  accepted: "قبلت المهمة",
  ready: "جاهز — استلمت الطلب",
  delivered: "تم التسليم",
};

export function simpleStageOf(status: OrderStatus): SimpleStage {
  if (status === "driver_accepted" || status === "driver_heading_pickup") return "accepted";
  if (status === "picked_up" || status === "on_the_way") return "ready";
  return "delivered";
}

/** الإجراء الوحيد المتاح، مع سلسلة الحالات الداخلية اللازمة لتنفيذه. */
export function simpleNextAction(
  status: OrderStatus,
): { label: string; chain: OrderStatus[] } | null {
  switch (status) {
    case "driver_accepted":
      return { label: "جاهز — استلمت الطلب", chain: ["driver_heading_pickup", "picked_up"] };
    case "driver_heading_pickup":
      return { label: "جاهز — استلمت الطلب", chain: ["picked_up"] };
    case "picked_up":
      return { label: "تم التسليم", chain: ["on_the_way", "delivered"] };
    case "on_the_way":
      return { label: "تم التسليم", chain: ["delivered"] };
    default:
      return null;
  }
}
