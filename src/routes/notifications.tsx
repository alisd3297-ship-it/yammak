import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BackButton, PageShell  } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/auth";
import { requireSignedIn } from "@/lib/route-guards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "الإشعارات | لبابك" },
      { name: "description", content: "تابع إشعارات طلباتك ورحلاتك وعروض التوصيل داخل تطبيق لبابك." },
      { property: "og:title", content: "الإشعارات | لبابك" },
      { property: "og:description", content: "إشعارات الطلبات والرحلات والعروض." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const userId = account?.userId ?? null;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("notifications")
        .select("id, title, body, kind, order_id, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return rows ?? [];
    },
  });

  // وصول لحظي للإشعارات الجديدة داخل هذه الصفحة (الاستطلاع احتياطي فقط)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-page-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          void refetch();
          qc.invalidateQueries({ queryKey: ["notifications-unread", userId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc, refetch]);


  const markAllRead = async () => {
    if (!userId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) {
      toast.error("تعذر تحديث الإشعارات");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const unread = (data ?? []).filter((n) => !n.is_read).length;

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/" label="الرئيسية" />
        <h1 className="text-2xl font-black">الإشعارات</h1>
        <p className="mt-1 text-sm opacity-90">
          {unread ? `عندك ${unread} إشعار غير مقروء` : "كل الإشعارات مقروءة"}
        </p>
      </header>

      <div className="space-y-3 px-4 py-5">
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
            تعليم الكل كمقروء
          </Button>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}

        {isError && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            <p>تعذر تحميل الإشعارات.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        )}

        {!isLoading && !isError && !data?.length && (
          <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-soft">
            <BellOff className="mx-auto mb-2 size-6" />
            ماكو إشعارات لحد الآن.
          </div>
        )}

        {data?.map((n) => {
          const card = (
            <article
              className={cn(
                "rounded-2xl p-4 shadow-soft",
                n.is_read ? "bg-card" : "bg-primary/5 ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{n.title}</h2>
                <time className="text-[11px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("ar-IQ-u-nu-latn")}
                </time>
              </div>
              {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
            </article>
          );
          // عرض التوصيل يفتح لوحة المندوب على الطلب نفسه، وبقية الإشعارات تفتح تفاصيل الطلب.
          if (n.order_id && n.kind === "offer" && account?.worker) {
            return (
              <Link key={n.id} to="/driver" search={{ order: n.order_id }} className="block">
                {card}
              </Link>
            );
          }
          return n.order_id ? (
            <Link key={n.id} to="/orders/$id" params={{ id: n.order_id }} className="block">
              {card}
            </Link>
          ) : (
            <div key={n.id}>{card}</div>
          );
        })}
      </div>
    </PageShell>
  );
}
