import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** التحقق أن المستخدم يملك المحل (أو من طاقم الإدارة). */
async function assertProviderAccess(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
  providerId: string,
): Promise<void> {
  const [owns, staff] = await Promise.all([
    supabase.rpc("owns_provider", { _user_id: userId, _provider_id: providerId }),
    supabase.rpc("is_staff", { _user_id: userId }),
  ]);
  if (owns.data !== true && staff.data !== true) throw new Error("غير مخوّل بإدارة قوائم هذا المحل");
}

/** إضافة زبون إلى «قوائم الزبائن» عبر رقم هاتفه — للتاجر فقط. */
export const openCustomerTab = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string; phone: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertProviderAccess(supabase, userId, data.providerId);

    const phone = (data.phone ?? "").replace(/[^\d+]/g, "").trim();
    if (phone.length < 7) throw new Error("اكتب رقم هاتف صحيح للزبون");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tail = phone.slice(-9);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone")
      .like("phone", `%${tail}`)
      .limit(2);

    if (!profiles?.length) throw new Error("ما لكينا زبون بهذا الرقم");
    if (profiles.length > 1) throw new Error("أكثر من زبون بنفس الرقم، راجع الإدارة");

    const { data: tabId, error } = await supabase.rpc("ensure_customer_tab", {
      _provider_id: data.providerId,
      _customer_id: profiles[0]!.id,
    });
    if (error) throw new Error("تعذر فتح قائمة الزبون");

    return { tabId: tabId as string, customerName: profiles[0]!.full_name };
  });

export type ProviderTabRow = {
  tabId: string;
  customerId: string;
  customerName: string;
  phone: string | null;
  deliveryFee: number;
  itemsTotal: number;
  paid: number;
};

/** قوائم زبائن المحل مع مجاميعها — للتاجر فقط. */
export const listProviderTabs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providerId: string }) => data)
  .handler(async ({ data, context }): Promise<ProviderTabRow[]> => {
    const { supabase, userId } = context;
    await assertProviderAccess(supabase, userId, data.providerId);

    const { data: tabs } = await supabase
      .from("customer_tabs")
      .select(
        "id, customer_id, delivery_fee, customer_tab_items(quantity, unit_price), customer_tab_payments(amount)",
      )
      .eq("provider_id", data.providerId)
      .order("created_at", { ascending: false });

    if (!tabs?.length) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", tabs.map((t) => t.customer_id));

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    return tabs.map((t) => {
      const items = (t.customer_tab_items ?? []) as { quantity: number; unit_price: number }[];
      const payments = (t.customer_tab_payments ?? []) as { amount: number }[];
      const profile = byId.get(t.customer_id);
      return {
        tabId: t.id,
        customerId: t.customer_id,
        customerName: profile?.full_name ?? "زبون",
        phone: profile?.phone ?? null,
        deliveryFee: Number(t.delivery_fee),
        itemsTotal: items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0),
        paid: payments.reduce((s, p) => s + Number(p.amount), 0),
      };
    });
  });
