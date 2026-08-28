import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccount, homeRouteForAccount } from "@/lib/auth";
import { useServicePreferences } from "@/lib/service-preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  // صفحة تعتمد على جلسة المتصفح: نعطّل التصيير على الخادم لتفادي اختلاف الترطيب
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | لبابك" },
      { name: "description", content: "سجّل دخولك إلى لبابك للطلب ومتابعة خدماتك." },
      { property: "og:title", content: "تسجيل الدخول | لبابك" },
      { property: "og:description", content: "حساب واحد لكل خدمات لبابك." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { data: account } = useAccount();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  // نوع الحساب عند التسجيل: زبون يتفعل مباشرة، مندوب يمر بطلب اعتماد من الإدارة
  const [accountType, setAccountType] = useState<"customer" | "driver">("customer");
  const [pendingDriverSignup, setPendingDriverSignup] = useState(false);
  const { needsOnboarding } = useServicePreferences();

  useEffect(() => {
    // لا نوجّه إلا بوجود جلسة فعلية (وليس بيانات مخزّنة قديمة بعد الخروج)
    if (account?.session && account.userId) {
      if (pendingDriverSignup && !account.worker) {
        setPendingDriverSignup(false);
        navigate({ to: "/join/driver", replace: true });
        return;
      }
      // زبون بلا اختيارات محفوظة: شاشة «شنو تحب تستخدم من لبابك؟» قبل الرئيسية
      const target = homeRouteForAccount(account);
      if (target === "/" && needsOnboarding) {
        navigate({ to: "/welcome", replace: true });
        return;
      }
      navigate({ to: target, replace: true });
    }
  }, [account, navigate, pendingDriverSignup, needsOnboarding]);

  function authErrorMessage(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("invalid login credentials"))
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
    if (m.includes("email not confirmed")) return "لم يتم تأكيد البريد بعد، راجع بريدك الإلكتروني";
    if (m.includes("weak") || m.includes("pwned"))
      return "كلمة المرور ضعيفة أو مسربة، اختر كلمة مرور أقوى (أحرف وأرقام ورموز)";
    if (m.includes("already registered") || m.includes("user already"))
      return "هذا البريد مسجّل مسبقاً، جرّب تسجيل الدخول أو استعادة كلمة المرور";
    if (m.includes("password should be at least") || m.includes("at least 6"))
      return "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    if (m.includes("rate limit") || m.includes("too many"))
      return "محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة";
    if (m.includes("invalid email") || m.includes("unable to validate email"))
      return "صيغة البريد الإلكتروني غير صحيحة";
    if (m.includes("failed to fetch") || m.includes("network"))
      return "تعذر الاتصال بالخادم، تأكد من الإنترنت";
    return message || "حدث خطأ غير متوقع، حاول مرة أخرى";
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(authErrorMessage(error.message));
      return;
    }
    toast.success("أهلاً بيك بلبابك");
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setPendingDriverSignup(accountType === "driver");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        // نوع الحساب المطلوب فقط للعرض؛ الدور الفعلي يُمنح من الخادم/الإدارة
        data: { full_name: fullName, phone, requested_account_type: accountType },
      },
    });
    setLoading(false);
    if (error) {
      setPendingDriverSignup(false);
      toast.error(authErrorMessage(error.message));
      return;
    }
    if (data.session) {
      toast.success("تم إنشاء حسابك، أهلاً بيك بلبابك");
      return;
    }
    // No session returned: sign in directly (auto-confirm) or ask to confirm email.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      toast.success("تم إنشاء الحساب، راجع بريدك لتأكيد التسجيل");
      return;
    }
    toast.success("تم إنشاء حسابك، أهلاً بيك بلبابك");
  }

  function randomString(bytes: number): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, bytes * 2);
  }

  async function createTestAccount() {
    setLoading(true);
    const testEmail = `test.${randomString(6)}@yammak-test.dev`;
    const testPassword = `Yk!${randomString(12)}Aa1`;
    const { error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: "حساب اختبار", is_test_account: true },
      },
    });
    if (error) {
      setLoading(false);
      toast.error(authErrorMessage(error.message));
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    setLoading(false);
    if (signInError) {
      toast.error(authErrorMessage(signInError.message));
      return;
    }
    toast.success(`تم إنشاء حساب اختبار مؤقت (${testEmail}) — صلاحيات زبون فقط`);
  }

  async function resetPassword() {
    if (!email) {
      toast.error("اكتب بريدك أولاً");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("أرسلنا رابط استعادة كلمة المرور إلى بريدك");
  }

  return (
    <div className="app-shell flex flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black text-primary">لبابك</h1>
        <p className="mt-1 text-sm text-muted-foreground">خدماتك وطلباتك لبابك</p>
      </div>

      <Tabs defaultValue="signin" className="rounded-3xl bg-card p-5 shadow-card">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">تسجيل الدخول</TabsTrigger>
          <TabsTrigger value="signup">حساب جديد</TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <form onSubmit={signIn} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
              دخول
            </Button>
            <button
              type="button"
              onClick={resetPassword}
              className="w-full text-sm text-muted-foreground"
            >
              نسيت كلمة المرور؟
            </button>
            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              أصحاب المطاعم والمحلات ومقدمو الخدمات: سجّلوا الدخول بالبريد وكلمة المرور المستلمة من
              إدارة لبابك، وتُفتح لوحة نشاطكم تلقائياً بعد الدخول.
            </p>
          </form>
        </TabsContent>

        <TabsContent value="signup">
          <form onSubmit={signUp} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>نوع الحساب</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "customer", label: "زبون", hint: "تفعيل فوري" },
                    { key: "driver", label: "مندوب", hint: "يحتاج موافقة الإدارة" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={accountType === opt.key}
                    onClick={() => setAccountType(opt.key)}
                    className={
                      accountType === opt.key
                        ? "rounded-xl bg-primary p-3 text-sm font-bold text-primary-foreground"
                        : "rounded-xl bg-muted p-3 text-sm font-semibold text-foreground"
                    }
                  >
                    <span className="block">{opt.label}</span>
                    <span className="block text-[11px] font-normal opacity-80">{opt.hint}</span>
                  </button>
                ))}
              </div>
              {accountType === "driver" && (
                <p className="rounded-xl bg-warning/15 p-3 text-xs">
                  راح ننشئ حسابك كزبون أولاً، وبعدها تكمل بيانات المركبة ويُرسل طلبك للإدارة. صلاحية
                  المندوب تتفعل بعد الموافقة فقط.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email2">البريد الإلكتروني</Label>
              <Input
                id="email2"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password2">كلمة المرور</Label>
              <Input
                id="password2"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
              إنشاء حساب
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {import.meta.env.DEV && (
        <div className="mt-5 rounded-2xl border border-dashed border-muted-foreground/40 p-4 text-center">
          <p className="mb-3 text-xs text-muted-foreground">
            وضع التطوير: حساب مؤقت بصلاحيات زبون فقط، بدون أي بيانات اعتماد ثابتة.
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-base"
            disabled={loading}
            onClick={createTestAccount}
          >
            إنشاء حساب اختبار
          </Button>
        </div>
      )}

      <Link to="/" className="mt-6 text-center text-sm text-muted-foreground">
        تصفح التطبيق بدون تسجيل
      </Link>
    </div>
  );
}
