import { Link, useNavigate } from "@tanstack/react-router";
import { Home, ClipboardList, ShoppingCart, User, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { useCart } from "@/lib/cart";
import { useOnline } from "@/lib/offline-cache";
import { cn } from "@/lib/utils";
import { useAccount, homeRouteForAccount } from "@/lib/auth";

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground shadow-card">
      <div className="relative flex min-h-11 flex-col items-center justify-center text-center">
        <div className="absolute inset-y-0 start-0 flex items-center">
          <AccountButton />
        </div>
        <h1 className="text-3xl font-black leading-none tracking-tight">يمّك</h1>
        <p className="mt-1 max-w-[62%] text-sm/6 opacity-90">{subtitle ?? "ويّانه كلشي صار يمّك"}</p>
      </div>
    </header>
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

export function BottomNav() {
  const { count } = useCart();
  const items = [
    { to: "/", label: "الرئيسية", icon: Home },
    { to: "/orders", label: "طلباتي", icon: ClipboardList },
    { to: "/checkout", label: "السلة", icon: ShoppingCart, badge: count },
  ] as const;

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
