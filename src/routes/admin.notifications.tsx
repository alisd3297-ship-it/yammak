import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { requireStaff } from "@/lib/route-guards";
import { broadcastNotification } from "@/lib/admin-notify.functions";

export const Route = createFileRoute("/admin/notifications")({
  ssr: false,
  beforeLoad: requireStaff,
  head: () => ({
    meta: [
      { title: "الإشعارات الإدارية | لبابك" },
      {
        name: "description",
        content: "إرسال تنبيهات للزبائن والمندوبين والتجار ومتابعة آخر الإشعارات المرسلة في لبابك.",
      },
      { property: "og:title", content: "الإشعارات الإدارية | لبابك" },
      { property: "og:description", content: "إدارة وإرسال تنبيهات المنصة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminNotificationsPage,
});

const AUDIENCES = [
  { key: "all", label: "الجميع" },
  { key: "customer", label: "الزبائن" },
  { key: "worker", label: "المندوبون" },
  { key: "provider", label: "التجار" },
] as const;

function AdminNotificationsPage() {
  const send = useServerFn(broadcastNotification);
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]["key"]>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: recent, refetch } = useQuery({
    queryKey: ["admin-recent-notifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, kind, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  async function submit() {
    if (title.trim().length < 3) {
      toast.error("اكتب عنوان التنبيه");
      return;
    }
    setBusy(true);
    try {
      const res = await send({ data: { audience, title, body } });
      toast.success(`تم إرسال التنبيه إلى ${res.sent} مستخدم`);
      setTitle("");
      setBody("");
      void refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال التنبيه");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <h1 className="text-2xl font-black">الإشعارات</h1>
        <p className="mt-1 text-sm opacity-90">أرسل تنبيهاً لفئة محددة من مستخدمي لبابك.</p>
      </header>

      <AdminNav />

      <section className="space-y-3 px-4 pt-5">
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAudience(a.key)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold",
                audience === a.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <Input
          className="h-11"
          placeholder="عنوان التنبيه"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          placeholder="نص التنبيه (اختياري)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button className="h-11 w-full" disabled={busy} onClick={() => void submit()}>
          {busy ? "جاري الإرسال…" : "إرسال التنبيه"}
        </Button>
      </section>

      <section className="px-4 py-5">
        <h2 className="mb-3 text-base font-black">آخر الإشعارات</h2>
        <div className="space-y-2">
          {(recent ?? []).map((n) => (
            <article key={n.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <p className="font-bold">{n.title}</p>
              {n.body ? <p className="mt-1 text-sm text-muted-foreground">{n.body}</p> : null}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {n.kind} · {new Date(n.created_at).toLocaleString("ar-IQ-u-nu-latn")}
              </p>
            </article>
          ))}
          {!recent?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو إشعارات بعد.</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
