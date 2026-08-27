import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Audience = "all" | "customer" | "worker" | "provider";

/** إرسال تنبيه جماعي من الإدارة إلى فئة مستخدمين محددة. */
export const broadcastNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { audience: Audience; title: string; body: string }) => {
    const title = String(data.title ?? "").trim();
    if (title.length < 3) throw new Error("العنوان قصير جداً");
    const audience: Audience = ["all", "customer", "worker", "provider"].includes(data.audience)
      ? data.audience
      : "all";
    return {
      audience,
      title: title.slice(0, 120),
      body: String(data.body ?? "")
        .trim()
        .slice(0, 400),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: staff, error: staffError } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (staffError || !staff) throw new Error("غير مصرح بهذا الإجراء");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userIds: string[] = [];
    if (data.audience === "all") {
      const { data: rows, error } = await supabaseAdmin.from("profiles").select("id").limit(5000);
      if (error) throw new Error("تعذر جلب المستخدمين");
      userIds = (rows ?? []).map((r) => r.id);
    } else {
      const { data: rows, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", data.audience)
        .limit(5000);
      if (error) throw new Error("تعذر جلب المستخدمين");
      userIds = (rows ?? []).map((r) => r.user_id);
    }

    const unique = Array.from(new Set(userIds));
    if (!unique.length) return { sent: 0 };

    const stamp = Date.now();
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500).map((id) => ({
        user_id: id,
        title: data.title,
        body: data.body || null,
        kind: "admin",
        dedupe_key: `admin-broadcast-${stamp}-${id}`,
      }));
      const { error } = await supabaseAdmin.from("notifications").insert(chunk);
      if (error) throw new Error("تعذر إرسال التنبيهات");
    }
    return { sent: unique.length };
  });
