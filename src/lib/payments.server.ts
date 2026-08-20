/**
 * محوّل مزود الدفع (Stripe) — يعمل داخل الخادم فقط.
 * كل الطلبات تتم عبر fetch لواجهة Stripe الرسمية (متوافق مع بيئة الحافة).
 * إذا كانت الأسرار غير موجودة، تبقى الطبقة معطلة بدون أي نجاح وهمي.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export type ProviderIntent = {
  id: string;
  clientSecret: string | null;
  status: string;
  amountMinor: number;
  currency: string;
};

export function stripeSecret(): string | null {
  return process.env["STRIPE_SECRET_KEY"] || null;
}

export function stripeWebhookSecret(): string | null {
  return process.env["STRIPE_WEBHOOK_SECRET"] || null;
}

export function paymentsConfigured(): boolean {
  return Boolean(stripeSecret());
}

/** تحويل المبلغ إلى أصغر وحدة حسب العملة (IQD عملة بثلاث خانات لدى Stripe). */
export function toMinorUnits(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  if (c === "IQD") return Math.round(amount) * 1000;
  const zeroDecimal = ["JPY", "KRW", "VND", "CLP"];
  if (zeroDecimal.includes(c)) return Math.round(amount);
  return Math.round(amount * 100);
}

export function fromMinorUnits(minor: number, currency: string): number {
  const c = currency.toUpperCase();
  if (c === "IQD") return minor / 1000;
  const zeroDecimal = ["JPY", "KRW", "VND", "CLP"];
  if (zeroDecimal.includes(c)) return minor;
  return minor / 100;
}

async function stripeRequest(
  path: string,
  init: { method: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string },
): Promise<Record<string, unknown>> {
  const key = stripeSecret();
  if (!key) throw new Error("payments_not_configured");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: init.method,
    headers,
    ...(init.body ? { body: init.body.toString() } : {}),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json["error"] ?? {}) as { message?: string; code?: string };
    throw new Error(`stripe_error:${err.code ?? res.status}:${err.message ?? "unknown"}`);
  }
  return json;
}

function toIntent(raw: Record<string, unknown>): ProviderIntent {
  return {
    id: String(raw["id"]),
    clientSecret: (raw["client_secret"] as string | null) ?? null,
    status: String(raw["status"] ?? "unknown"),
    amountMinor: Number(raw["amount"] ?? 0),
    currency: String(raw["currency"] ?? "iqd"),
  };
}

export async function createProviderIntent(args: {
  amount: number;
  currency: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}): Promise<ProviderIntent> {
  const body = new URLSearchParams();
  body.set("amount", String(toMinorUnits(args.amount, args.currency)));
  body.set("currency", args.currency.toLowerCase());
  body.set("automatic_payment_methods[enabled]", "true");
  for (const [k, v] of Object.entries(args.metadata)) body.set(`metadata[${k}]`, v);

  const raw = await stripeRequest("/payment_intents", {
    method: "POST",
    body,
    idempotencyKey: args.idempotencyKey,
  });
  return toIntent(raw);
}

export async function retrieveProviderIntent(intentId: string): Promise<ProviderIntent> {
  return toIntent(await stripeRequest(`/payment_intents/${intentId}`, { method: "GET" }));
}

export async function refundProviderIntent(args: {
  intentId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  reason?: string;
}): Promise<{ id: string; status: string }> {
  const body = new URLSearchParams();
  body.set("payment_intent", args.intentId);
  body.set("amount", String(toMinorUnits(args.amount, args.currency)));
  if (args.reason) body.set("metadata[reason]", args.reason);
  const raw = await stripeRequest("/refunds", {
    method: "POST",
    body,
    idempotencyKey: args.idempotencyKey,
  });
  return { id: String(raw["id"]), status: String(raw["status"] ?? "unknown") };
}

/** تحويل حالة Stripe إلى حالة الدفع الداخلية. */
export function mapProviderStatus(
  status: string,
): "pending" | "processing" | "succeeded" | "failed" | "cancelled" {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "cancelled";
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "processing":
      return "processing";
    default:
      return "processing";
  }
}

/** التحقق من توقيع webhook (HMAC SHA256 مع مقارنة ثابتة الزمن ونافذة زمنية). */
export async function verifyStripeSignature(args: {
  payload: string;
  header: string | null;
  secret: string;
  toleranceSeconds?: number;
}): Promise<boolean> {
  if (!args.header) return false;
  const parts = Object.fromEntries(
    args.header.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k ?? "", rest.join("=")];
    }),
  ) as Record<string, string>;

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > (args.toleranceSeconds ?? 300)) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(args.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${args.payload}`));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
