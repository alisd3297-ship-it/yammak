import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/auth";
import { respondToOffer } from "@/lib/dispatch.functions";
import { changeOrderStatus } from "@/lib/orders.functions";
import { completeOrderStop } from "@/lib/special-delivery.functions";
import { clearArrivalFlag } from "@/lib/driver-flow";
import type { OrderStatus } from "@/lib/orders";

export type DriverOffer = {
  id: string;
  order_id: string;
  distance_km: number | null;
  expires_at: string;
  orders: {
    code: string;
    total: number;
    delivery_fee: number | null;
    order_type: string;
    notes: string | null;
    pickup_text: string | null;
    dropoff_text: string | null;
    vehicle_type: string | null;
    cargo_description: string | null;
    cargo_weight_kg: number | null;
    scheduled_at: string | null;
  } | null;
};

export type DriverTask = {
  id: string;
  code: string;
  status: OrderStatus;
  total: number;
  delivery_fee: number | null;
  order_type: string;
  notes: string | null;
  pickup_text: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_text: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  vehicle_type: string | null;
  cargo_description: string | null;
  scheduled_at: string | null;
  order_stops: {
    id: string;
    position: number;
    address_text: string;
    recipient_name: string | null;
    recipient_phone: string | null;
    notes: string | null;
    is_delivered: boolean;
  }[];
};

export function useWorkerProfile() {
  const { data: account } = useAccount();
  return useQuery({
    queryKey: ["worker-profile", account?.userId],
    enabled: !!account?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_profiles")
        .select(
          "user_id, is_approved, is_available, worker_kind, rating, ratings_count, vehicle, vehicle_type, vehicle_make, vehicle_model, vehicle_color, plate_number, taxi_class, taxi_seats, max_active_orders, application_status, rejection_reason",
        )
        .eq("user_id", account!.userId!)
        .maybeSingle();
      return data;
    },
  });
}

/** العروض القريبة تظهر فقط عندما يكون المندوب «متصل». */
export function useDriverOffers() {
  const { data: account } = useAccount();
  const { data: worker } = useWorkerProfile();
  const online = !!worker?.is_available && !!worker?.is_approved;
  return useQuery({
    queryKey: ["driver-offers", account?.userId],
    enabled: !!account?.userId && online,
    refetchInterval: online ? 8_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_offers")
        .select(
          "id, order_id, distance_km, expires_at, status, orders(code, total, delivery_fee, order_type, notes, pickup_text, dropoff_text, vehicle_type, cargo_description, cargo_weight_kg, scheduled_at)",
        )
        .eq("driver_id", account!.userId!)
        .eq("status", "sent")
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      return (data ?? []) as unknown as DriverOffer[];
    },
  });
}

export function useDriverTasks() {
  const { data: account } = useAccount();
  return useQuery({
    queryKey: ["driver-orders", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, code, status, total, delivery_fee, order_type, notes, pickup_text, pickup_lat, pickup_lng, dropoff_text, dropoff_lat, dropoff_lng, vehicle_type, cargo_description, scheduled_at, order_stops(id, position, address_text, recipient_name, recipient_phone, notes, is_delivered)",
        )
        .eq("driver_id", account!.userId!)
        .in("status", ["driver_accepted", "driver_heading_pickup", "picked_up", "on_the_way"]);
      if (error) throw error;
      return (data ?? []) as unknown as DriverTask[];
    },
  });
}

/** سجل المهام المكتملة + ملخص اليوم والأسبوع. */
export function useDriverHistory() {
  const { data: account } = useAccount();
  return useQuery({
    queryKey: ["driver-history", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, total, delivery_fee, dropoff_text, completed_at, updated_at, order_type")
        .eq("driver_id", account!.userId!)
        .in("status", ["delivered", "completed"])
        .gte("updated_at", since.toISOString())
        .order("updated_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });
}

export function driverSummary(rows: { delivery_fee: number | null; updated_at: string }[] | undefined) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let todayCount = 0;
  let todayEarnings = 0;
  let weekEarnings = 0;
  for (const r of rows ?? []) {
    const fee = Number(r.delivery_fee ?? 0);
    weekEarnings += fee;
    if (new Date(r.updated_at) >= today) {
      todayCount += 1;
      todayEarnings += fee;
    }
  }
  return { todayCount, todayEarnings, weekEarnings, weekCount: rows?.length ?? 0 };
}

/** إجراءات المندوب الموحّدة (نفس منطق الخادم الحالي). */
export function useDriverActions() {
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const respond = useServerFn(respondToOffer);
  const setStatus = useServerFn(changeOrderStatus);
  const finishStop = useServerFn(completeOrderStop);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["driver-offers"] });
    qc.invalidateQueries({ queryKey: ["driver-orders"] });
    qc.invalidateQueries({ queryKey: ["driver-history"] });
  };

  return {
    /** تبديل «متصل/غير متصل» بتحديث فوري للواجهة وتراجع تلقائي عند الفشل. */
    async toggleAvailable(value: boolean) {
      if (!account?.userId) return;
      const key = ["worker-profile", account.userId] as const;
      const previous = qc.getQueryData(key);
      qc.setQueryData(key, (old: unknown) =>
        old && typeof old === "object" ? { ...(old as object), is_available: value } : old,
      );
      const { error } = await supabase
        .from("worker_profiles")
        .update({ is_available: value })
        .eq("user_id", account.userId);
      if (error) {
        qc.setQueryData(key, previous);
        toast.error("تعذر تحديث حالة الاتصال، حاول مرة ثانية");
        return;
      }
      if (!value) {
        await supabase.from("worker_locations").update({ is_online: false }).eq("user_id", account.userId);
        qc.setQueryData(["driver-offers", account.userId], []);
      }
      toast.success(value ? "صرت متصل، راح توصلك الطلبات القريبة" : "صرت غير متصل، توقفت الطلبات القريبة");
      qc.invalidateQueries({ queryKey: ["worker-profile"] });
      qc.invalidateQueries({ queryKey: ["driver-offers"] });
    },
    /** حفظ نوع وسيلة النقل في ملف المندوب — يظهر للإدارة ويُستخدم في توزيع الطلبات. */
    async setVehicleType(value: string) {
      if (!account?.userId) return;
      const key = ["worker-profile", account.userId] as const;
      const previous = qc.getQueryData(key);
      qc.setQueryData(key, (old: unknown) =>
        old && typeof old === "object" ? { ...(old as object), vehicle_type: value } : old,
      );
      const { error } = await supabase
        .from("worker_profiles")
        .update({ vehicle_type: value as never })
        .eq("user_id", account.userId);
      if (error) {
        qc.setQueryData(key, previous);
        toast.error("تعذر حفظ نوع وسيلة النقل");
        return;
      }
      toast.success("تم حفظ نوع وسيلة النقل");
      qc.invalidateQueries({ queryKey: ["worker-profile"] });
    },

    async answerOffer(offerId: string, accept: boolean) {
      try {
        await respond({ data: accept ? { offerId, accept } : { offerId, accept, reason: "رفض المندوب" } });
        toast.success(accept ? "قبلت المهمة" : "تم رفض العرض");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الرد على العرض");
      }
      invalidate();
    },
    async advance(orderId: string, next: OrderStatus) {
      try {
        await setStatus({ data: { orderId, status: next } });
        if (next === "delivered") clearArrivalFlag(orderId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذر تحديث حالة الطلب");
        return;
      }
      invalidate();
    },
    async completeStop(stopId: string) {
      try {
        await finishStop({ data: { stopId } });
        toast.success("تم تحديث نقطة التسليم");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذر تحديث النقطة");
      }
      invalidate();
    },
  };
}
