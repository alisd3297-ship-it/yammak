import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { provisionTestAccount, setupToolsStatus } from "@/lib/admin-setup.functions";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/setup-test-accounts")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تجهيز حسابات الاختبار | لبابك" },
      {
        name: "description",
        content: "مسار محمي برمز سري لتجهيز حسابات اختبار: زبون، مندوب توصيل، وتاجر، بالأدوار الفعلية للمشروع.",
      },
      { property: "og:title", content: "تجهيز حسابات الاختبار | لبابك" },
      { property: "og:description", content: "إنشاء أو تحديث كلمات مرور حسابات الاختبار برمز إعداد سري." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupTestAccountsPage,
});

const KINDS = [
  { kind: "customer", email: "qa.customer@lubabak.test", label: "زبون اختبار", role: "customer" },
  { kind: "driver", email: "qa.driver@lubabak.test", label: "مندوب توصيل اختبار", role: "worker + delivery" },
  { kind: "vendor", email: "qa.vendor@lubabak.test", label: "تاجر اختبار", role: "provider + متجر" },
  {
    kind: "service_provider",
    email: "qa.service@lubabak.test",
    label: "مقدم خدمة اختبار",
    role: "provider + مهنة (profession)",
  },
] as const;

function SetupTestAccountsPage() {
  const provision = useServerFn(provisionTestAccount);
  const statusFn = useServerFn(setupToolsStatus);
  const { data: tools } = useQuery({ queryKey: ["setup-tools-status"], queryFn: () => statusFn({}) });
  const [token, setToken] = useState("");
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  async function submit(kind: string, email: string) {
    const password = passwords[kind] ?? "";
    setBusy(kind);
    try {
      const res = await provision({ data: { token, kind, email, password } });
      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_token: "رمز الإعداد غير صحيح",
          server_token_missing: "رمز الإعداد غير مضبوط على الخادم — أضِف ADMIN_SETUP_TOKEN ثم أعد النشر",
          invalid_email: "استخدم بريداً بنطاق lubabak.test أو yammak.test فقط",
          weak_password: "كلمة المرور قصيرة، استخدم 10 أحرف على الأقل",
          setup_disabled: "أدوات حسابات الاختبار معطّلة على هذه البيئة",
        };
        toast.error(messages[res.reason] ?? "نوع الحساب غير معروف");
        return;
      }
      setPasswords((p) => ({ ...p, [kind]: "" }));
      setDone((d) => ({ ...d, [kind]: true }));
      toast.success(res.created ? "تم إنشاء الحساب" : "تم تحديث كلمة مرور الحساب");
    } catch {
      toast.error("تعذر إكمال التجهيز");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-shell px-5 py-10">
      <h1 className="text-2xl font-black text-primary">تجهيز حسابات الاختبار</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        محمي برمز الإعداد السري المخزّن في إعدادات المشروع. الأدوار المستخدمة هي الأدوار الموجودة فعلاً:
        زبون <span dir="ltr">customer</span>، مندوب <span dir="ltr">worker</span> بنوع{" "}
        <span dir="ltr">delivery</span>، وتاجر <span dir="ltr">provider</span>. لا صلاحيات إدارية لأي منها.
      </p>

      {tools && !tools.enabled ? (
        <div className="mt-6 rounded-2xl bg-card p-5 text-sm shadow-card">
          أدوات حسابات الاختبار معطّلة على هذه البيئة (الإنتاج). لتفعيلها في بيئة اختبار اضبط
          <span dir="ltr"> ENABLE_SETUP_TOOLS=true </span> في إعدادات المشروع.
        </div>
      ) : (
      <>
      <div className="mt-6 space-y-2 rounded-2xl bg-card p-5 shadow-card">
        <Label htmlFor="token">رمز الإعداد</Label>
        <Input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      </div>

      <div className="mt-4 space-y-4">
        {KINDS.map((k) => (
          <form
            key={k.kind}
            onSubmit={(e) => {
              e.preventDefault();
              void submit(k.kind, k.email);
            }}
            className="space-y-3 rounded-2xl bg-card p-5 shadow-card"
          >
            <div>
              <p className="font-bold">{k.label}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">
                {k.email} — {k.role}
              </p>
            </div>
            <Input
              type="password"
              placeholder="كلمة مرور (10 أحرف على الأقل)"
              value={passwords[k.kind] ?? ""}
              onChange={(e) => setPasswords((p) => ({ ...p, [k.kind]: e.target.value }))}
              autoComplete="new-password"
              minLength={10}
              required
            />
            <Button type="submit" className="h-11 w-full" disabled={busy === k.kind}>
              {done[k.kind] ? "تم — تجهيز مرة أخرى" : "تجهيز الحساب"}
            </Button>
          </form>
        ))}
      </div>
      </>
      )}

      <Link to="/auth" className="mt-6 block text-center font-semibold text-primary">
        الذهاب لتسجيل الدخول
      </Link>
    </div>
  );
}
