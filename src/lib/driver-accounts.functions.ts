import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VehicleType } from "@/lib/vehicles";

const STAFF_ROLES = ["super_admin", "admin", "supervisor"] as const;

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const ok = (data ?? []).some((r: { role: string }) =>
    (STAFF_ROLES as readonly string[]).includes(r.role),
  );
  if (!ok) throw new Error("هذا الإجراء مخصص للإدارة فقط");
}

function friendly(message: string): string {
  if (/already registered|already been registered/i.test(message))
    return "هذا البريد مسجل مسبقاً — سيتم تحديث الحساب الحالي";
  return message || "تعذر تنفيذ العملية";
}

type CreateDriverInput = {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  kind: "delivery" | "taxi";
  vehicleType: VehicleType;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  plateNumber?: string;
};

/** إنشاء حساب سائق/مندوب معتمد مباشرة من لوحة الإدارة. */
export const createDriverAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateDriverInput) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context);

    const fullName = (data.fullName ?? "").trim();
    const email = (data.email ?? "").trim().toLowerCase();
    if (fullName.length < 2) throw new Error("أدخل اسم السائق الكامل");
    if (!email.includes("@")) throw new Error("صيغة البريد الإلكتروني غير صحيحة");
    if ((data.password ?? "").length < 8)
      throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (!["delivery", "taxi"].includes(data.kind)) throw new Error("نوع السائق غير صحيح");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // إنشاء الحساب أو تحديث كلمة المرور إن كان البريد موجوداً
    let userId: string | null = null;
    let created = false;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(friendly(error.message));
      userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
      if (list.users.length < 200) break;
    }

    if (userId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        email_confirm: true,
      });
      if (error) throw new Error(friendly(error.message));
    } else {
      const { data: createdUser, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: fullName, account_type: "worker" },
      });
      if (error || !createdUser.user) throw new Error(friendly(error?.message ?? ""));
      userId = createdUser.user.id;
      created = true;
    }

    // المدينة الافتراضية (كربلاء) إن وُجدت
    const { data: city } = await supabaseAdmin
      .from("cities")
      .select("id")
      .ilike("name", "%كربلاء%")
      .limit(1)
      .maybeSingle();

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName,
        phone: (data.phone ?? "").trim() || null,
        city_id: city?.id ?? null,
        is_blocked: false,
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(friendly(profileError.message));

    for (const role of ["customer", "worker"] as const) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
      if (error) throw new Error(friendly(error.message));
    }

    const { error: workerError } = await supabaseAdmin.from("worker_profiles").upsert(
      {
        user_id: userId,
        worker_kind: data.kind,
        requested_kind: data.kind,
        vehicle_type: data.vehicleType,
        vehicle_make: (data.vehicleMake ?? "").trim() || null,
        vehicle_model: (data.vehicleModel ?? "").trim() || null,
        vehicle_color: (data.vehicleColor ?? "").trim() || null,
        plate_number: (data.plateNumber ?? "").trim() || null,
        application_status: "approved",
        is_approved: true,
        is_available: false,
        city_id: city?.id ?? null,
      },
      { onConflict: "user_id" },
    );
    if (workerError) throw new Error(friendly(workerError.message));

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: created ? "driver_account_created" : "driver_account_updated",
      entity: "worker_profiles",
      entity_id: userId,
      after_data: { email, kind: data.kind },
    });

    return { ok: true as const, userId, email, created };
  });
