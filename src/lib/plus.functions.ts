import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PLUS_PLANS = {
  monthly: { label: "شهري", amount: 5000, months: 1 },
  yearly: { label: "سنوي", amount: 50000, months: 12 },
} as const;

export type PlusPlan = keyof typeof PLUS_PLANS;

function friendly(message: string): string {
  if (message.includes("insufficient_balance")) return "رصيد المحفظة غير كافي، اشحن محفظتك أولاً";
  if (message.includes("wallet_locked")) return "المحفظة موقوفة، راجع الدعم";
  if (message.includes("invalid_plan")) return "خطة الاشتراك غير صحيحة";
  if (message.includes("unauthorized")) return "سجّل دخولك أولاً";
  return "تعذر تفعيل الاشتراك، حاول مرة ثانية";
}

/** حالة اشتراك «لبابك بلس» للمستخدم الحالي مع رصيد محفظته. */
export const getMyPlus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [subRes, walletRes] = await Promise.all([
      context.supabase
        .from("plus_subscriptions")
        .select("id, plan, status, amount, currency, started_at, expires_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(10),
      context.supabase
        .from("wallets")
        .select("balance, currency")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    const subs = subRes.data ?? [];
    const active = subs.find(
      (s) => s.status === "active" && (!s.expires_at || new Date(s.expires_at) > new Date()),
    );

    return {
      isActive: !!active,
      plan: (active?.plan ?? null) as PlusPlan | null,
      expiresAt: active?.expires_at ?? null,
      balance: Number(walletRes.data?.balance ?? 0),
      currency: walletRes.data?.currency ?? "IQD",
      history: subs.map((s) => ({
        id: s.id,
        plan: s.plan,
        status: s.status,
        amount: Number(s.amount),
        currency: s.currency,
        startedAt: s.started_at,
        expiresAt: s.expires_at,
      })),
    };
  });

/** تفعيل/تجديد الاشتراك بخصم المبلغ من المحفظة (المنطق كامل داخل قاعدة البيانات). */
export const subscribePlus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { plan: PlusPlan }) => data)
  .handler(async ({ data, context }) => {
    const plan = data.plan === "yearly" ? "yearly" : "monthly";
    const { data: res, error } = await context.supabase.rpc("subscribe_plus", { _plan: plan });
    if (error) throw new Error(friendly(error.message));
    return res as unknown as {
      ok: boolean;
      plan: string;
      expires_at: string;
      balance_after: number;
      amount: number;
    };
  });
