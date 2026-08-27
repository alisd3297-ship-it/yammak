import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

function fail(message: string): never {
  if (message.includes("forbidden")) throw new Error("غير مصرح بهذا الإجراء");
  if (message.includes("order_closed")) throw new Error("الطلب منتهي");
  if (message.includes("cannot_revoke_self")) throw new Error("لا يمكنك سحب صلاحيتك بنفسك");
  if (message.includes("cannot_block_self")) throw new Error("لا يمكنك حظر حسابك");
  if (message.includes("user_not_found")) throw new Error("المستخدم غير موجود");
  throw new Error("تعذر تنفيذ العملية، حاول مرة ثانية");
}

/** تقرير إداري شامل، وبيانات الإيرادات تظهر فقط لمن يملك صلاحية مالية. */
export const getAdminReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { days: number }) => data)
  .handler(async ({ data, context }) => {
    const days = Math.min(Math.max(Math.trunc(data.days || 7), 1), 365);
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const { data: report, error } = await context.supabase.rpc("admin_orders_report", {
      _from: from.toISOString(),
      _to: to.toISOString(),
    });
    if (error) fail(error.message);
    return report as unknown as AdminReport;
  });

export type AdminReport = {
  from: string;
  to: string;
  can_finance: boolean;
  totals: {
    orders: number;
    completed: number;
    cancelled: number;
    active: number;
    gross_sales: number | null;
    delivery_fees: number | null;
    revenue: number | null;
  };
  currency: string;
  finance_by_currency:
    | {
        currency: string;
        sales: number;
        costs: number;
        commission: number;
        delivery_fees: number;
        gross_profit: number;
        platform_net: number;
        provider_net: number;
        items: number;
        cost_known_items: number;
      }[]
    | null;
  payments_by_currency:
    { currency: string; count: number; paid: number; refunded: number; net: number }[] | null;
  refunds: { pending: number; manual_required: number; failed: number; succeeded: number } | null;
  ads_by_currency: { currency: string; count: number; amount: number }[] | null;
  by_status: Record<string, number>;
  daily: { day: string; orders: number; revenue: number | null }[];
  providers: { id: string; name: string; orders: number; revenue: number | null; rating: number }[];
  drivers: { id: string; name: string; delivered: number; cancelled: number; rating: number }[];
  trips: { count: number; fare: number | null };
  service_requests: { count: number; amount: number | null };
};

/** قائمة المستخدمين وأدوارهم للإدارة. */
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { search?: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("admin_list_users", {
      ...(data.search ? { _search: data.search } : {}),
      _limit: 100,
    });
    if (error) fail(error.message);
    return (rows ?? []) as {
      user_id: string;
      full_name: string;
      phone: string | null;
      is_blocked: boolean;
      created_at: string;
      roles: string[];
    }[];
  });

/** منح أو سحب دور، مع فرض القواعد داخل قاعدة البيانات. */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; role: AppRole; grant: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_user_role", {
      _user_id: data.userId,
      _role: data.role,
      _grant: data.grant,
    });
    if (error) fail(error.message);
    return { ok: true };
  });

/** حظر أو رفع الحظر عن مستخدم. */
export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; blocked: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_user_blocked", {
      _user_id: data.userId,
      _blocked: data.blocked,
    });
    if (error) fail(error.message);
    return { ok: true };
  });
