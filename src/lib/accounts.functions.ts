import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GroupKind = "family" | "business";

export type GroupAccount = {
  id: string;
  name: string;
  currency: string;
  monthlyLimit: number;
  isActive: boolean;
  isOwner: boolean;
  status?: string;
  members: {
    id: string;
    userId: string;
    name: string;
    canOrder: boolean;
    monthlyLimit: number;
    role?: string;
  }[];
};

/** حساب العائلة أو حساب الأعمال الخاص بالمستخدم مع الأعضاء. */
export const getGroupAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { kind: GroupKind }) => data)
  .handler(async ({ data, context }): Promise<GroupAccount | null> => {
    const { supabase, userId } = context;
    if (data.kind === "family") {
      const { data: rows } = await supabase
        .from("family_accounts")
        .select("id, name, currency, monthly_limit, is_active, owner_id")
        .order("created_at")
        .limit(1);
      const acc = rows?.[0];
      if (!acc) return null;
      const { data: members } = await supabase
        .from("family_members")
        .select("id, user_id, member_name, can_order, monthly_limit")
        .eq("family_id", acc.id)
        .order("created_at");
      return {
        id: acc.id,
        name: acc.name,
        currency: acc.currency,
        monthlyLimit: Number(acc.monthly_limit),
        isActive: acc.is_active,
        isOwner: acc.owner_id === userId,
        members: (members ?? []).map((m) => ({
          id: m.id,
          userId: m.user_id,
          name: m.member_name,
          canOrder: m.can_order,
          monthlyLimit: Number(m.monthly_limit),
        })),
      };
    }

    const { data: rows } = await supabase
      .from("business_accounts")
      .select("id, name, currency, monthly_limit, is_active, status, owner_id")
      .order("created_at")
      .limit(1);
    const acc = rows?.[0];
    if (!acc) return null;
    const { data: members } = await supabase
      .from("business_members")
      .select("id, user_id, member_role, can_order, monthly_limit")
      .eq("business_id", acc.id)
      .order("created_at");
    return {
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      monthlyLimit: Number(acc.monthly_limit),
      isActive: acc.is_active,
      status: acc.status,
      isOwner: acc.owner_id === userId,
      members: (members ?? []).map((m) => ({
        id: m.id,
        userId: m.user_id,
        name: m.member_role,
        role: m.member_role,
        canOrder: m.can_order,
        monthlyLimit: Number(m.monthly_limit),
      })),
    };
  });

/** إنشاء حساب عائلة أو حساب أعمال (حساب واحد لكل مالك). */
export const createGroupAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      kind: GroupKind;
      name: string;
      monthlyLimit?: number | null;
      phone?: string | null;
      taxNumber?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const name = (data.name ?? "").trim();
    if (name.length < 2) throw new Error("اكتب اسم الحساب");
    const limit = Math.max(Number(data.monthlyLimit) || 0, 0);

    if (data.kind === "family") {
      const { data: row, error } = await context.supabase
        .from("family_accounts")
        .insert({ owner_id: context.userId, name: name.slice(0, 120), monthly_limit: limit })
        .select("id")
        .maybeSingle();
      if (error || !row) throw new Error("تعذر إنشاء حساب العائلة");
      return { id: row.id };
    }

    const { data: row, error } = await context.supabase
      .from("business_accounts")
      .insert({
        owner_id: context.userId,
        name: name.slice(0, 160),
        monthly_limit: limit,
        phone: data.phone?.trim() ? data.phone.trim().slice(0, 30) : null,
        tax_number: data.taxNumber?.trim() ? data.taxNumber.trim().slice(0, 60) : null,
      })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("تعذر إنشاء حساب الأعمال");
    return { id: row.id };
  });

/** إضافة عضو عبر رقم هاتفه المسجّل في لبابك. */
export const addGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      kind: GroupKind;
      accountId: string;
      phone: string;
      label: string;
      monthlyLimit?: number | null;
      canOrder?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const table = data.kind === "family" ? "family_accounts" : "business_accounts";
    const { data: acc } = await supabase
      .from(table)
      .select("id, owner_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (!acc || acc.owner_id !== userId) throw new Error("غير مصرح بهذا الإجراء");

    const phone = (data.phone ?? "").replace(/\s+/g, "");
    if (phone.length < 8) throw new Error("اكتب رقم هاتف صحيح");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("phone", phone)
      .maybeSingle();
    if (!profile) throw new Error("ماكو مستخدم بهذا الرقم في لبابك");
    if (profile.id === userId) throw new Error("أنت مالك الحساب أصلاً");

    const limit = Math.max(Number(data.monthlyLimit) || 0, 0);
    const label = (data.label ?? "").trim() || profile.full_name || "عضو";

    if (data.kind === "family") {
      const { error } = await supabase.from("family_members").insert({
        family_id: data.accountId,
        user_id: profile.id,
        member_name: label.slice(0, 120),
        monthly_limit: limit,
        can_order: data.canOrder ?? true,
      });
      if (error) throw new Error(error.message.includes("duplicate") ? "العضو مضاف مسبقاً" : "تعذر إضافة العضو");
    } else {
      const { error } = await supabase.from("business_members").insert({
        business_id: data.accountId,
        user_id: profile.id,
        member_role: label.slice(0, 60),
        monthly_limit: limit,
        can_order: data.canOrder ?? true,
      });
      if (error) throw new Error(error.message.includes("duplicate") ? "العضو مضاف مسبقاً" : "تعذر إضافة العضو");
    }
    return { ok: true, name: label };
  });

/** تعديل صلاحية الطلب أو حذف عضو. */
export const updateGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      kind: GroupKind;
      memberId: string;
      canOrder?: boolean;
      monthlyLimit?: number | null;
      remove?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const table = data.kind === "family" ? "family_members" : "business_members";
    if (data.remove) {
      const { error } = await context.supabase.from(table).delete().eq("id", data.memberId);
      if (error) throw new Error("تعذر حذف العضو");
      return { ok: true };
    }
    const patch: { can_order?: boolean; monthly_limit?: number } = {};
    if (data.canOrder != null) patch.can_order = data.canOrder;
    if (data.monthlyLimit != null) patch.monthly_limit = Math.max(Number(data.monthlyLimit), 0);
    const { error } =
      data.kind === "family"
        ? await context.supabase.from("family_members").update(patch).eq("id", data.memberId)
        : await context.supabase.from("business_members").update(patch).eq("id", data.memberId);
    if (error) throw new Error("تعذر تحديث العضو");
    return { ok: true };

  });
