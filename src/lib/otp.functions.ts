import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeIraqiPhone } from "@/lib/otp";

type RequestResult = {
  configured: boolean;
  expiresAt: string;
  maxAttempts: number;
  cooldownSeconds: number;
  phone: string;
};

/** حالة التحقق الحقيقية تُقرأ من الخادم فقط. */
export const getPhoneVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("phone, phone_verified_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error("تعذر قراءة حالة التحقق");

    const { smsConfigured } = await import("@/lib/otp.server");
    const { data: flags } = await context.supabase.rpc("otp_flag", {
      _flag: "require_for_order_completion",
    });

    return {
      phone: data?.phone ?? null,
      verified: Boolean(data?.phone_verified_at),
      verifiedAt: data?.phone_verified_at ?? null,
      smsConfigured: smsConfigured(),
      requiredForOrderCompletion: Boolean(flags),
    };
  });

/** إصدار رمز جديد: التوليد والبصمة والإرسال كلها داخل الخادم. */
export const requestPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { phone: string }) => {
    const normalized = normalizeIraqiPhone(String(data.phone ?? ""));
    if (!normalized) throw new Error("رقم الهاتف غير صالح");
    return { phone: normalized };
  })
  .handler(async ({ data, context }): Promise<RequestResult> => {
    const { generateCode, generateSalt, hashCode, smsConfigured, sendSms, otpMessage } =
      await import("@/lib/otp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const code = generateCode();
    const salt = generateSalt();

    const { data: issued, error } = await supabaseAdmin.rpc("otp_request", {
      _user_id: context.userId,
      _phone: data.phone,
      _code_hash: hashCode(code, salt),
      _salt: salt,
    });
    if (error) throw new Error(error.message);

    const challenge = issued as unknown as {
      id: string;
      expires_at: string;
      max_attempts: number;
      cooldown_seconds: number;
    };

    if (!smsConfigured()) {
      // التكامل جاهز للإنتاج لكن الأسرار غير متوفرة — لا نتظاهر بالنجاح
      return {
        configured: false,
        expiresAt: challenge.expires_at,
        maxAttempts: challenge.max_attempts,
        cooldownSeconds: challenge.cooldown_seconds,
        phone: data.phone,
      };
    }

    try {
      await sendSms(data.phone, otpMessage(code));
      await supabaseAdmin.rpc("otp_mark_delivered", {
        _challenge_id: challenge.id,
        _delivered: true,
        _channel: "sms",
      });
    } catch (e) {
      await supabaseAdmin.rpc("otp_mark_delivered", {
        _challenge_id: challenge.id,
        _delivered: false,
        _channel: "sms",
      });
      throw new Error(e instanceof Error ? e.message : "sms_send_failed");
    }

    return {
      configured: true,
      expiresAt: challenge.expires_at,
      maxAttempts: challenge.max_attempts,
      cooldownSeconds: challenge.cooldown_seconds,
      phone: data.phone,
    };
  });

/** التحقق: المقارنة تتم داخل قاعدة البيانات على البصمة، والواجهة لا تستطيع تعليم نفسها verified. */
export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => {
    const code = String(data.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("الرمز يجب أن يكون 6 أرقام");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashCode } = await import("@/lib/otp.server");

    const { data: challenge, error: readError } = await supabaseAdmin
      .from("phone_verifications")
      .select("id, salt")
      .eq("user_id", context.userId)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error("تعذر التحقق حالياً");
    if (!challenge) throw new Error("otp_not_requested");

    const { data: result, error } = await supabaseAdmin.rpc("otp_verify", {
      _user_id: context.userId,
      _code_hash: hashCode(data.code, challenge.salt),
    });
    if (error) throw new Error(error.message);

    const outcome = result as unknown as {
      verified: boolean;
      phone: string;
      reason?: string;
      remaining?: number;
    };
    if (!outcome.verified) {
      // فشل التحقق يُحسب فعلياً في قاعدة البيانات (العدّاد محفوظ) ثم نرجع رسالة واضحة
      if (outcome.reason === "otp_expired") throw new Error("انتهت صلاحية الرمز، اطلب رمزاً جديداً");
      if (outcome.reason === "otp_attempts_exceeded")
        throw new Error("تجاوزت عدد المحاولات، اطلب رمزاً جديداً");
      if (outcome.reason === "otp_not_requested") throw new Error("otp_not_requested");
      throw new Error(`الرمز غير صحيح، تبقّى ${outcome.remaining ?? 0} محاولات`);
    }

    return { verified: true, phone: outcome.phone };
  });

