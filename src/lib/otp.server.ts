/**
 * منطق OTP الخاص بالخادم فقط:
 * - توليد رمز عشوائي آمن (لا يُخزن أبداً كنص صريح)
 * - اشتقاق بصمة SHA-256 مع salt عشوائي + pepper من الأسرار إن وُجد
 * - محوّل SMS جاهز للإنتاج (Twilio) يعمل عبر fetch فقط
 */

import { createHash, randomBytes, randomInt } from "crypto";
import { OTP_LENGTH } from "@/lib/otp";

export function generateCode(): string {
  let out = "";
  for (let i = 0; i < OTP_LENGTH; i++) out += String(randomInt(0, 10));
  return out;
}

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

function pepper(): string {
  return process.env["OTP_PEPPER"] ?? "";
}

/** بصمة الرمز: sha256(salt + code + pepper) — الرمز نفسه لا يغادر الذاكرة. */
export function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}:${pepper()}`).digest("hex");
}

export type SmsConfig = {
  accountSid: string;
  authToken: string;
  from: string;
};

export function smsConfig(): SmsConfig | null {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"] ?? process.env["TWILIO_MESSAGING_SERVICE_SID"];
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

export function smsConfigured(): boolean {
  return smsConfig() !== null;
}

/** إرسال الرمز فعلياً عبر Twilio. يرمي خطأ واضح إذا فشل الإرسال. */
export async function sendSms(to: string, body: string): Promise<{ sid: string }> {
  const cfg = smsConfig();
  if (!cfg) throw new Error("sms_not_configured");

  const params = new URLSearchParams({ To: to, Body: body });
  if (cfg.from.startsWith("MG")) params.set("MessagingServiceSid", cfg.from);
  else params.set("From", cfg.from);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    // لا نُسرّب تفاصيل المزود للمستخدم؛ نسجلها في سجل الخادم فقط
    console.error("[otp] twilio send failed", res.status, detail.slice(0, 400));
    throw new Error("sms_send_failed");
  }
  const json = (await res.json()) as { sid?: string };
  return { sid: json.sid ?? "" };
}

export function otpMessage(code: string): string {
  return `رمز التحقق في لبابك: ${code}\nصالح لمدة 5 دقائق. لا تشاركه مع أي أحد.`;
}
