import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تعيين كلمة مرور جديدة | لبابك" },
      {
        name: "description",
        content: "أكمل استعادة حسابك في لبابك بتعيين كلمة مرور جديدة بشكل آمن.",
      },
      { property: "og:title", content: "تعيين كلمة مرور جديدة | لبابك" },
      { property: "og:description", content: "استعادة الوصول إلى حسابك في تطبيق لبابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("كلمة المرور لازم تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("تعذر تحديث كلمة المرور، جرّب رابط الاستعادة من جديد");
      return;
    }
    toast.success("تم تحديث كلمة المرور");
    navigate({ to: "/", replace: true });
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-md px-5 py-10">
        <h1 className="text-xl font-bold">تعيين كلمة مرور جديدة</h1>
        {!ready ? (
          <p className="mt-3 text-sm text-muted-foreground">
            افتح رابط الاستعادة من بريدك الإلكتروني لتغيير كلمة المرور.{" "}
            <Link to="/auth" className="font-semibold text-primary">
              رجوع لتسجيل الدخول
            </Link>
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جاري الحفظ..." : "حفظ كلمة المرور"}
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
