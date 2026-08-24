import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { provisionTestAdmin } from "@/lib/admin-setup.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/setup-test-admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تجهيز حساب مدير تجريبي | لبابك" },
      { name: "description", content: "مسار محمي برمز سري لتجهيز حساب مدير تجريبي لاختبار التطبيق." },
      { property: "og:title", content: "تجهيز حساب مدير تجريبي | لبابك" },
      { property: "og:description", content: "إنشاء أو تحديث كلمة مرور حساب مدير الاختبار برمز إعداد سري." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupTestAdminPage,
});

function SetupTestAdminPage() {
  const provision = useServerFn(provisionTestAdmin);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("qa.admin@yammak.test");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await provision({ data: { token: token.trim(), email: email.trim(), password } });
      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_token: "رمز الإعداد غير صحيح",
          server_token_missing: "رمز الإعداد غير مضبوط على الخادم — أضِف ADMIN_SETUP_TOKEN في إعدادات المشروع",
          invalid_email: "استخدم بريداً بنطاق yammak.test فقط",
          weak_password: "كلمة المرور قصيرة، استخدم 10 أحرف على الأقل",
        };
        toast.error(
          messages[res.reason] ??
            `تعذر تجهيز الحساب${"detail" in res && res.detail ? `: ${res.detail}` : ""}`,
        );
        return;
      }
      setToken("");
      setPassword("");
      setDone(res.email);
      toast.success(res.created ? "تم إنشاء حساب المدير التجريبي" : "تم تحديث كلمة مرور حساب المدير التجريبي");
    } catch (err) {
      toast.error(`تعذر الاتصال بالخادم${err instanceof Error && err.message ? `: ${err.message}` : ""}`);
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="app-shell flex flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-black text-primary">تجهيز حساب مدير تجريبي</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        هذا المسار محمي برمز الإعداد السري المخزّن في إعدادات المشروع. يُنشئ حساب مدير اختبار (أو يعيد ضبط
        كلمة مروره) بنطاق <span dir="ltr">@yammak.test</span> فقط، ولا تُخزَّن أي بيانات اعتماد داخل الكود.
      </p>

      {done ? (
        <div className="mt-6 space-y-3 rounded-2xl bg-card p-5 text-sm shadow-card">
          <p>
            الحساب جاهز: <span dir="ltr" className="font-semibold">{done}</span> بصلاحية «admin».
          </p>
          <p className="text-muted-foreground">
            سجّل الدخول من أي جهاز بنفس البريد وكلمة المرور التي أدخلتها الآن.
          </p>
          <Link to="/auth" className="block font-semibold text-primary">
            الذهاب لتسجيل الدخول
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl bg-card p-5 shadow-card">
          <div className="space-y-2">
            <Label htmlFor="token">رمز الإعداد</Label>
            <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">بريد حساب الاختبار</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة مرور جديدة (10 أحرف على الأقل)</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>
          <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
            تجهيز الحساب
          </Button>
        </form>
      )}
    </div>
  );
}
