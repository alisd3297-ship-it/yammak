import { createFileRoute } from "@tanstack/react-router";

/**
 * webhook مزود الدفع: يتحقق من التوقيع أولاً، ثم يثبّت النتيجة server-side
 * بشكل idempotent عبر معرف الحدث. لا يغيّر أي حالة عمل تجارية.
 */
export const Route = createFileRoute("/api/public/payments/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { stripeWebhookSecret, verifyStripeSignature, mapProviderStatus, fromMinorUnits } =
          await import("@/lib/payments.server");

        const secret = stripeWebhookSecret();
        if (!secret) return new Response("payments_not_configured", { status: 503 });

        const payload = await request.text();
        const ok = await verifyStripeSignature({
          payload,
          header: request.headers.get("stripe-signature"),
          secret,
        });
        if (!ok) return new Response("invalid_signature", { status: 401 });

        let event: {
          id?: string;
          type?: string;
          data?: { object?: Record<string, unknown> };
        };
        try {
          event = JSON.parse(payload);
        } catch {
          return new Response("invalid_payload", { status: 400 });
        }

        const type = event.type ?? "";
        const object = (event.data?.object ?? {}) as Record<string, unknown>;

        let intentId: string | null = null;
        let status: "succeeded" | "failed" | "cancelled" | "processing" | "refunded" | null = null;
        let amount: number | null = null;
        let failureReason: string | null = null;

        if (type.startsWith("payment_intent.")) {
          intentId = String(object["id"] ?? "") || null;
          const currency = String(object["currency"] ?? "iqd");
          amount = fromMinorUnits(Number(object["amount"] ?? 0), currency);
          if (type === "payment_intent.succeeded") status = "succeeded";
          else if (type === "payment_intent.payment_failed") {
            status = "failed";
            const err = (object["last_payment_error"] ?? {}) as { message?: string };
            failureReason = err.message ?? "payment_failed";
          } else if (type === "payment_intent.canceled") status = "cancelled";
          else status = mapProviderStatus(String(object["status"] ?? ""));
        } else if (type === "charge.refunded") {
          intentId = (object["payment_intent"] as string | null) ?? null;
          status = "refunded";
        }

        if (!intentId || !status) return Response.json({ received: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("settle_payment", {
          _provider: "stripe",
          _intent_id: intentId,
          _new_status: status,
          _event_id: event.id ?? `${type}:${intentId}`,
          _event_type: type,
          _payload: { id: event.id, type },
          _failure_reason: failureReason,
          _amount: status === "succeeded" ? amount : null,
        } as never);

        if (error) return new Response("settle_failed", { status: 500 });
        return Response.json({ received: true, result: data });
      },
    },
  },
});
