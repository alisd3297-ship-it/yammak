/** تحويل رقم الهاتف إلى هوية دخول ثابتة (بدون رسائل SMS). */
import { normalizeIraqiPhone } from "@/lib/otp";

/** نطاق داخلي غير قابل للاستقبال — يُستخدم فقط كهوية دخول لحسابات الهاتف. */
export const PHONE_IDENTITY_DOMAIN = "phone.lababak.app";

/** يرجع البريد المشتق من الرقم، أو null إذا الرقم غير صالح. */
export function phoneToAuthEmail(input: string): string | null {
  const normalized = normalizeIraqiPhone(input);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `p${digits}@${PHONE_IDENTITY_DOMAIN}`;
}

/** هل هذا الحساب مسجّل برقم هاتف (بريد داخلي)؟ */
export function isPhoneIdentityEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.endsWith(`@${PHONE_IDENTITY_DOMAIN}`));
}
