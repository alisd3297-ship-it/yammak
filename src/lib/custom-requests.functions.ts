import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ParsedItem = { name: string; quantity: number; note?: string | null };

function friendly(message: string): string {
  if (message.includes("row-level security")) return "غير مصرح بهذا الإجراء";
  if (message.includes("empty")) return "اكتب تفاصيل طلبك أولاً";
  return "تعذر إرسال الطلب، حاول مرة ثانية";
}

/** إرسال طلب «اطلب أي شي» بعد أن يؤكده المستخدم بصيغته المنظمة. */
export const submitCustomRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      rawText: string;
      items: ParsedItem[];
      address: string;
      lat?: number | null;
      lng?: number | null;
      notes?: string | null;
      budget?: number | null;
      currency?: string;
      sourcePlace?: string | null;
      sourceLat?: number | null;
      sourceLng?: number | null;
      imageUrl?: string | null;
      inputKind?: "text" | "voice" | "image" | "errand";
      recipientName?: string | null;
      recipientPhone?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const raw = (data.rawText ?? "").trim();
    if (!raw) throw new Error("اكتب تفاصيل طلبك أولاً");
    const address = (data.address ?? "").trim();
    if (!address) throw new Error("حدد عنوان التسليم");

    const items = (data.items ?? [])
      .filter((i) => i && i.name.trim())
      .slice(0, 30)
      .map((i) => ({
        name: i.name.trim().slice(0, 120),
        quantity: Math.min(Math.max(Math.trunc(Number(i.quantity) || 1), 1), 99),
        note: i.note?.trim() || null,
      }));

    const kind = data.inputKind ?? "text";

    const { data: row, error } = await context.supabase
      .from("custom_requests")
      .insert({
        customer_id: context.userId,
        raw_text: raw.slice(0, 2000),
        items,
        address_text: address.slice(0, 300),
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        notes: data.notes?.trim() ? data.notes.trim().slice(0, 500) : null,
        budget: data.budget != null && data.budget > 0 ? data.budget : null,
        currency: data.currency === "USD" ? "USD" : "IQD",
        source_place_text: data.sourcePlace?.trim() ? data.sourcePlace.trim().slice(0, 300) : null,
        source_lat: data.sourceLat ?? null,
        source_lng: data.sourceLng ?? null,
        image_url: data.imageUrl?.trim() ? data.imageUrl.trim().slice(0, 500) : null,
        input_kind: ["text", "voice", "image", "errand"].includes(kind) ? kind : "text",
        recipient_name: data.recipientName?.trim() ? data.recipientName.trim().slice(0, 120) : null,
        recipient_phone: data.recipientPhone?.trim()
          ? data.recipientPhone.trim().slice(0, 30)
          : null,
      })
      .select("id, status, created_at")
      .maybeSingle();

    if (error || !row) throw new Error(friendly(error?.message ?? ""));

    // تنبيه الإدارة ليحوّل الطلب إلى طلب منظم
    try {
      const { data: staff } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin", "supervisor"]);
      for (const s of staff ?? []) {
        await context.supabase.rpc("push_notification", {
          _user_id: s.user_id,
          _title: "طلب «اطلب أي شي» جديد",
          _body: raw.slice(0, 120),
          _kind: "custom_request",
          _key: `custom_request:${row.id}`,
        });
      }
    } catch {
      /* الإشعار ليس شرطاً لنجاح الطلب */
    }

    return { id: row.id, status: row.status, createdAt: row.created_at };
  });

/** طلبات «اطلب أي شي» الخاصة بالمستخدم. */
export const listMyCustomRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("custom_requests")
      .select("id, raw_text, items, status, address_text, budget, currency, order_id, created_at")
      .eq("customer_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    return (data ?? []).map((r) => ({
      id: r.id,
      rawText: r.raw_text,
      items: (r.items ?? []) as ParsedItem[],
      status: r.status as "submitted" | "reviewing" | "converted" | "rejected",
      address: r.address_text,
      budget: r.budget == null ? null : Number(r.budget),
      currency: r.currency,
      orderId: r.order_id,
      createdAt: r.created_at,
    }));
  });
