import { Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import {
  Home,
  ClipboardList,
  ShoppingCart,
  User,
  WifiOff,
  ShieldCheck,
  Bell,
  LogOut,
  ArrowRight,
  Bike,
  Wallet,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { superAdminExists } from "@/lib/admin-setup.functions";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useOnline } from "@/lib/offline-cache";
import { cn } from "@/lib/utils";
import { useAccount, homeRouteForAccount, isWorkerOnlyAccount } from "@/lib/auth";
import { useSignOut } from "@/lib/sign-out";


export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground shadow-card">
      <div className="relative flex min-h-11 flex-col items-center justify-center text-center">
        <div className="absolute inset-y-0 start-0 flex items-center gap-1">
          <AccountButton />
          <SignOutButton />
        </div>

        <div className="absolute inset-y-0 end-0 flex items-center">
          <NotificationsButton />
        </div>
        <h1 className="text-3xl font-black leading-none tracking-tight">يمّك</h1>
        <p className="mt-1 max-w-[62%] text-sm/6 opacity-90">{subtitle ?? "ويّانه كلشي صار يمّك"}</p>
      </div>
    </header>
  );
}


function SignOutButton() {
  const { data: account } = useAccount();
  const signOut = useSignOut();
  if (!account?.userId) return null;
  return (
    <button
      onClick={() => void signOut()}
      className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25"
      aria-label="تسجيل الخروج"
      title="تسجيل الخروج"
    >
      <LogOut className="size-5" />
    </button>
  );
}

function AccountButton() {
  const { data: account } = useAccount();
  const navigate = useNavigate();
  return (
    <button
      onClick={() =>
        navigate({ to: account?.userId ? homeRouteForAccount(account) : "/auth" })
      }
      className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25"
      aria-label="الحساب"
    >
      <User className="size-5" />
    </button>
  );
}


function NotificationsButton() {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const userId = account?.userId ?? null;
  const { data: unread } = useQuery({
    queryKey: ["notifications-unread", userId],
    enabled: !!userId,
    // realtime هو المصدر الأساسي، والاستطلاع البطيء احتياطي فقط
    refetchInterval: 120_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      return count ?? 0;
    },
  });

  // اشتراك لحظي واحد فقط على إشعارات المستخدم الحالي
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications-unread", userId] });
          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  if (!userId) return null;

  return (
    <Link
      to="/notifications"
      aria-label="الإشعارات"
      className="relative flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25"
    >
      <Bell className="size-5" />
      {unread ? (
        <span className="absolute -top-1 -end-1 min-w-5 rounded-full bg-destructive px-1 text-[10px] font-bold leading-5 text-destructive-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

export function OfflineBanner({ stale }: { stale?: boolean }) {
  const online = useOnline();
  if (online && !stale) return null;
  return (
    <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-warning/15 px-3 py-2 text-xs font-medium text-warning-foreground">
      <WifiOff className="size-4" />
      {online
        ? "تعرض بيانات مخزنة، قد لا تكون محدثة بالكامل."
        : "لا يوجد اتصال — تعرض آخر البيانات المخزنة على جهازك."}
    </div>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="app-shell bg-background pb-24">{children}</div>;
}

/**
 * زر رجوع موحّد للصفحات الداخلية: يستخدم سجل التنقل عندما يكون متاحاً،
 * وإلا ينتقل إلى صفحة أب واضحة حتى لا يخرج المستخدم من التطبيق بالخطأ.
 */
export function BackButton({ fallback = "/", label = "رجوع" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (
    <button
      type="button"
      onClick={() => {
        if (canGoBack) router.history.back();
        else void router.navigate({ to: fallback as never, replace: true });
      }}
      className="mb-3 inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-sm opacity-95 transition hover:bg-primary-foreground/25"
      aria-label="رجوع"
    >
      <ArrowRight className="size-4" /> {label}
    </button>
  );
}

export function BottomNav() {
  const { count } = useCart();
  const { data: account } = useAccount();
  const driverOnly = isWorkerOnlyAccount(account);

  // المندوب يرى تنقل لوحة المندوب فقط، بلا وظائف طلب كزبون.
  const items = driverOnly
    ? ([
        { to: "/driver", label: "لوحة المندوب", icon: Bike },
        { to: "/driver-earnings", label: "أرباحي", icon: Wallet },
        { to: "/notifications", label: "الإشعارات", icon: Bell },
      ] as const)
    : ([
        { to: "/", label: "الرئيسية", icon: Home },
        { to: "/orders", label: "طلباتي", icon: ClipboardList },
        { to: "/checkout", label: "السلة", icon: ShoppingCart, badge: count },
      ] as const);


  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[34rem] border-t border-border bg-card/95 backdrop-blur">
      <ul className="flex items-stretch justify-around">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <Link
              to={item.to}
              className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground"
              activeProps={{ className: "text-primary font-semibold" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              <span className="relative">
                <item.icon className="size-5" />
                {"badge" in item && item.badge ? (
                  <span className="absolute -end-2 -top-2 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function StatusDot({ tone }: { tone: "success" | "danger" | "muted" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 rounded-full",
        tone === "success" && "bg-success",
        tone === "danger" && "bg-destructive",
        tone === "warning" && "bg-warning",
        tone === "muted" && "bg-muted-foreground",
      )}
    />
  );
}

export function AdminEntry() {
  const { data: account } = useAccount();
  const check = useServerFn(superAdminExists);
  const isAdmin = !!account?.roles.some((r) =>
    r === "super_admin" || r === "admin" || r === "supervisor",
  );
  const { data: status } = useQuery({
    queryKey: ["super-admin-exists"],
    queryFn: () => check({}),
    enabled: !!account?.userId && !isAdmin,
    staleTime: 5 * 60_000,
  });

  if (!account?.userId) return null;

  if (isAdmin) {
    return (
      <div className="mx-4 mt-3">
        <Link
          to="/admin/providers"
          className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-semibold text-primary shadow-card"
        >
          <ShieldCheck className="size-5" />
          الدخول إلى لوحة المدير
        </Link>
      </div>
    );
  }

  if (status && !status.exists) {
    return (
      <div className="mx-4 mt-3">
        <Link
          to="/setup-admin"
          className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-semibold text-primary shadow-card"
        >
          <ShieldCheck className="size-5" />
          إعداد المدير العام
        </Link>
      </div>
    );
  }

  return null;
}

const ADMIN_LINKS = [
  { to: "/admin/orders", label: "موافقات الطلبات" },
  { to: "/admin/providers", label: "المزوّدون" },
  { to: "/admin/drivers", label: "المندوبون" },
  { to: "/admin/courier", label: "الطلبات" },
  { to: "/admin/payments", label: "المدفوعات" },
  { to: "/admin/settlements", label: "التسويات" },
  { to: "/admin/refunds", label: "الاسترجاعات" },
  { to: "/admin/reports", label: "التقارير" },
  { to: "/admin/users", label: "المستخدمون" },
  { to: "/admin/ads", label: "الإعلانات" },
  { to: "/admin/services", label: "كتالوج الخدمات" },
  { to: "/admin/audit", label: "سجل التدقيق" },
  { to: "/admin/features", label: "مفاتيح الميزات" },

] as const;

/** شريط تنقل موحّد بين صفحات الإدارة. */
export function AdminNav() {
  return (
    <nav className="mt-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {ADMIN_LINKS.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="block whitespace-nowrap rounded-full bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground"
              activeProps={{ className: "bg-primary text-primary-foreground" }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
