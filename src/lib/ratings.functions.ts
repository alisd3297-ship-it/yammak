import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * تقييم طلب توصيل بعد إكماله.
 * الصلاحية تُفرض بـ RLS (المقيّم طرف في الطلب والطلب مسلَّم/مكتمل)،
 * والتكرار يمنعه فهرس فريد على (order_id, rater_id, target_type).
 */
export const rateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      orderId: string;
      targetType: "provider" | "driver";
      targetId: string;
      stars: number;
      comment?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const stars = Math.min(Math.max(Math.trunc(Number(data.stars)), 1), 5);
    const { error } = await context.supabase.from("ratings").insert({
      order_id: data.orderId,
      rater_id: context.userId,
      target_type: data.targetType,
      target_id: data.targetId,
      stars,
      comment: data.comment?.trim() || null,
    });
    if (error) {
      if (error.code === "23505") throw new Error("سبق أن قيّمت هذا الطلب");
      throw new Error("تعذر حفظ التقييم، تأكد أن الطلب مكتمل");
    }
    return { ok: true };
  });

/** التقييمات التي سجّلها المستخدم الحالي على طلب معيّن. */
export const myOrderRatings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("ratings")
      .select("target_type, stars")
      .eq("order_id", data.orderId)
      .eq("rater_id", context.userId);
    return (rows ?? []) as { target_type: string; stars: number }[];
  });
