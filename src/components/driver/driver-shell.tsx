import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, LogOut, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { useAccount } from "@/lib/auth";
import { useSignOut } from "@/lib/sign-out";
import { OPERATING_LOCATION_COORDS } from "@/lib/location";
import { cn } from "@/lib/utils";

/** بث موقع المندوب أثناء التوفر + تنبيهه لحظياً بالعروض الجديدة. */
export function useDriverPresence(isAvailable: boolean) {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const userId = account?.userId ?? null;

  useEffect(() => {
    if (!userId || !isAvailable) return;

    let warned = false;
    let lastSent = 0;
    let watchId: number | null = null;

    const send = async (lat: number, lng: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastSent < 20_000) return;
      lastSent = now;
      const { error } = await supabase.from("worker_locations").upsert({
        user_id: userId,
        lat,
        lng,
        is_online: true,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        lastSent = 0;
        if (!warned) {
          warned = true;
          toast.error("تعذر تحديث حالتك كمتصل، حدّث الصفحة أو تأكد من الاتصال");
        }
      }
    };

    const sendFallback = () =>
      void send(OPERATING_LOCATION_COORDS.lat, OPERATING_LOCATION_COORDS.lng, true);

    const onError = () => {
      sendFallback();
      if (warned) return;
      warned = true;
      toast.error("تعذر قراءة موقعك، فعّل صلاحية الموقع حتى تصلك العروض القريبة");
    };

    const hasGeo = typeof navigator !== "undefined" && !!navigator.geolocation;

    const pushOnce = (force = false) => {
      if (!hasGeo) return sendFallback();
      return navigator.geolocation.getCurrentPosition(
        (pos) => void send(pos.coords.latitude, pos.coords.longitude, force),
        onError,
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    };

    pushOnce(true);
    if (hasGeo) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => void send(pos.coords.latitude, pos.coords.longitude),
        onError,
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 15_000 },
      );
    }

    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") pushOnce();
    }, 45_000);

    const onResume = () => {
      if (document.visibilityState === "visible") pushOnce(true);
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);

    return () => {
      if (watchId !== null && hasGeo) navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
    };
  }, [userId, isAvailable]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    const alert = (title: string, body: string, orderId: string | null) => {
      toast.info(title, { description: body || undefined });
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const n = new Notification(title, {
            body: body || title,
            icon: "/icon-192.png",
            ...(orderId ? { tag: orderId } : {}),
          });
          n.onclick = () => {
            window.focus();
            if (orderId) window.location.assign(`/driver?order=${orderId}`);
          };
        }
      } catch {
        // بعض المتصفحات تمنع الإشعارات، والتنبيه داخل التطبيق يكفي
      }
    };

    const channel = supabase
      .channel(`driver-alerts-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { title: string; body: string | null; order_id: string | null };
          alert(row.title, row.body ?? "", row.order_id ?? null);
          qc.invalidateQueries({ queryKey: ["driver-offers"] });
          qc.invalidateQueries({ queryKey: ["driver-trip-offers"] });
          qc.invalidateQueries({ queryKey: ["notifications-unread", userId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "delivery_offers", filter: `driver_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["driver-offers"] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

/** هيدر موحّد لصفحات المندوب بهوية «لبابك». */
export function DriverShell({
  title,
  online,
  canToggle,
  onToggle,
  children,
}: {
  title: string;
  online?: boolean;
  canToggle?: boolean;
  onToggle?: (v: boolean) => void;
  children: ReactNode;
}) {
  const signOut = useSignOut();
  const showStatus = typeof online === "boolean";

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-7 text-primary-foreground shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black leading-tight">لبابك · {title}</h1>
            <p className="mt-1 text-xs opacity-90">خدماتك وطلباتك لبابك</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/notifications"
              aria-label="الإشعارات"
              className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25"
            >
              <Bell className="size-5" />
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="تسجيل الخروج"
              className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15 backdrop-blur transition hover:bg-primary-foreground/25"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>

        {showStatus && (
          <button
            type="button"
            onClick={() => canToggle && onToggle?.(!online)}
            disabled={!canToggle}
            className={cn(
              "mt-4 flex w-full items-center justify-between rounded-3xl px-5 py-4 text-start transition",
              online ? "bg-primary-foreground text-primary" : "bg-primary-foreground/15",
              !canToggle && "opacity-60",
            )}
          >
            <span className="flex items-center gap-3">
              <Power className="size-6" />
              <span>
                <span className="block text-lg font-black">{online ? "متصل" : "غير متصل"}</span>
                <span className="block text-xs opacity-80">
                  {online ? "تستلم عروض التوصيل القريبة" : "اضغط للاتصال واستلام الطلبات"}
                </span>
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "flex h-8 w-14 items-center rounded-full p-1 transition",
                online ? "justify-end bg-primary" : "justify-start bg-primary-foreground/40",
              )}
            >
              <span className={cn("size-6 rounded-full", online ? "bg-primary-foreground" : "bg-primary-foreground")} />
            </span>
          </button>
        )}
      </header>
      {children}
    </PageShell>
  );
}
