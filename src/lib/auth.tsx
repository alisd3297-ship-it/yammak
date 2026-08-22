import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "supervisor" | "customer" | "worker" | "provider";

export type AccountContext = {
  session: Session | null;
  userId: string | null;
  roles: AppRole[];
  profile: { id: string; full_name: string; phone: string | null } | null;
  worker: {
    user_id: string;
    worker_kind: "delivery" | "taxi" | null;
    requested_kind: "delivery" | "taxi" | null;
    is_approved: boolean;
    is_available: boolean;
  } | null;
  provider: { id: string; name: string; kind: string; status: string; is_open: boolean } | null;
};

async function loadAccount(): Promise<AccountContext> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session ?? null;
  if (!session) {
    return { session: null, userId: null, roles: [], profile: null, worker: null, provider: null };
  }
  const userId = session.user.id;
  const [rolesRes, profileRes, workerRes, providerRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("profiles").select("id, full_name, phone").eq("id", userId).maybeSingle(),
    supabase
      .from("worker_profiles")
      .select("user_id, worker_kind, requested_kind, is_approved, is_available")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("providers")
      .select("id, name, kind, status, is_open")
      .eq("owner_id", userId)
      .maybeSingle(),
  ]);

  return {
    session,
    userId,
    roles: (rolesRes.data ?? []).map((r) => r.role as AppRole),
    profile: profileRes.data ?? null,
    worker: workerRes.data ?? null,
    provider: providerRes.data ?? null,
  };
}

export function useAccount() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      queryClient.invalidateQueries({ queryKey: ["account"] });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({ queryKey: ["account"], queryFn: loadAccount, staleTime: 30_000 });
}

export function isStaffAccount(account: AccountContext | undefined): boolean {
  const roles = account?.roles ?? [];
  return roles.includes("super_admin") || roles.includes("admin") || roles.includes("supervisor");
}

/** الواجهة الافتراضية لكل دور: إدارة، مقدم خدمة، مندوب، أو زبون. */
export function homeRouteForAccount(account: AccountContext | undefined): string {
  if (!account?.userId) return "/";
  const roles = account.roles;
  if (isStaffAccount(account)) return "/admin/providers";
  if (account.provider || roles.includes("provider")) return "/provider";
  if (account.worker || roles.includes("worker")) return "/driver";
  return "/";
}

/**
 * توجيه تلقائي لأصحاب الأدوار الخاصة عند فتح واجهة الزبون،
 * مرة واحدة فقط لكل تشغيل للتطبيق حتى يبقى بإمكانهم التصفح كزبائن.
 */
export function useRoleHomeRedirect() {
  const { data: account } = useAccount();
  const navigate = useNavigate();

  useEffect(() => {
    if (!account?.userId) return;
    const target = homeRouteForAccount(account);
    if (target === "/") return;
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem("yammak:role-routed") === account.userId) return;
    sessionStorage.setItem("yammak:role-routed", account.userId);
    navigate({ to: target, replace: true });
  }, [account, navigate]);
}

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "مدير عام",
  admin: "مدير",
  supervisor: "مشرف",
  customer: "زبون",
  worker: "عامل",
  provider: "مقدم خدمة",
};
