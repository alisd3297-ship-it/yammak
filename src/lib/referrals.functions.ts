import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function friendly(message: string): string {
  if (message.includes("code_not_found")) return "كود الإحالة غير صحيح";
  if (message.includes("self_referral")) return "ما تكدر تستخدم كودك الخاص";
  if (message.includes("already_referred")) return "استخدمت كود إحالة سابقاً";
  if (message.includes("unauthorized")) return "سجّل دخولك أولاً";
  return "تعذر تفعيل كود الإحالة";
}

/** كود الإحالة الخاص بالمستخدم وقائمة من دعاهم ومكافآتهم. */
export const getMyReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [profileRes, invitedRes, receivedRes] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("referral_code")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("referrals")
        .select("id, code, status, reward_amount, currency, rewarded_at, created_at")
        .eq("referrer_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("referrals")
        .select("id, code, status, created_at")
        .eq("referee_id", context.userId)
        .maybeSingle(),
    ]);

    const invited = invitedRes.data ?? [];
    return {
      code: profileRes.data?.referral_code ?? null,
      usedCode: receivedRes.data?.code ?? null,
      invitedCount: invited.length,
      rewardedTotal: invited
        .filter((r) => r.status === "rewarded")
        .reduce((s, r) => s + Number(r.reward_amount ?? 0), 0),
      invited: invited.map((r) => ({
        id: r.id,
        status: r.status as "pending" | "rewarded",
        reward: Number(r.reward_amount ?? 0),
        currency: r.currency,
        rewardedAt: r.rewarded_at,
        createdAt: r.created_at,
      })),
    };
  });

/** استخدام كود إحالة صديق (مرة واحدة فقط لكل حساب). */
export const redeemReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data, context }) => {
    const code = (data.code ?? "").trim().toUpperCase();
    if (!code) throw new Error("اكتب كود الإحالة");
    const { data: res, error } = await context.supabase.rpc("redeem_referral", { _code: code });
    if (error) throw new Error(friendly(error.message));
    return res as unknown as { ok: boolean };
  });
