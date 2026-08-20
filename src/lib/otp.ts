/** ثوابت وأدوات مشتركة لتأكيد رقم الهاتف — آمنة للاستخدام في الواجهة. */

export const OTP_LENGTH = 6;

/** تطبيع رقم عراقي إلى صيغة E.164 قدر الإمكان. */
export function normalizeIraqiPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  let n = digits.replace(/^\+/, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("964")) return `+${n}`;
  if (n.startsWith("0")) return `+964${n.slice(1)}`;
  if (n.length === 10 && n.startsWith("7")) return `+964${n}`;
  if (digits.startsWith("+")) return digits;
  return null;
}

export function maskPhone(phone: string): string {
  const tail = phone.slice(-4);
  return `••••••${tail}`;
}

export function otpErrorMessage(raw: string): string {
  if (raw.includes("otp_cooldown")) {
    const secs = raw.split(":").pop()?.trim();
    return `انتظر ${secs || "قليلاً"} ثانية قبل طلب رمز جديد`;
  }
  if (raw.includes("otp_rate_limited"))
    return "وصلت الحد الأقصى لطلبات الرمز خلال ساعة، حاول لاحقاً";
  if (raw.includes("otp_attempts_exceeded"))
    return "تجاوزت عدد المحاولات المسموحة، اطلب رمزاً جديداً";
  if (raw.includes("otp_invalid_code")) {
    const left = raw.split(":").pop()?.trim();
    return `الرمز غير صحيح${left ? ` — بقيت لك ${left} محاولة` : ""}`;
  }
  if (raw.includes("otp_expired")) return "انتهت صلاحية الرمز، اطلب رمزاً جديداً";
  if (raw.includes("otp_not_requested")) return "ما موجود رمز فعّال، اطلب رمزاً أولاً";
  if (raw.includes("invalid_phone")) return "رقم الهاتف غير صالح";
  if (raw.includes("sms_not_configured"))
    return "خدمة الرسائل غير مفعّلة حالياً، راجع إدارة التطبيق";
  if (raw.includes("sms_send_failed")) return "تعذر إرسال الرسالة، حاول مرة ثانية";
  if (raw.includes("phone_verification_required")) return "لازم تأكد رقم هاتفك قبل هذا الإجراء";
  if (raw.includes("unauthorized") || raw.includes("forbidden")) return "غير مصرح بهذا الإجراء";
  return "صار خطأ غير متوقع، حاول مرة ثانية";
}
