import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccount, homeRouteForAccount } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | يمّك" },
      { name: "description", content: "سجّل دخولك إلى يمّك للطلب ومتابعة خدماتك." },
      { property: "og:title", content: "تسجيل الدخول | يمّك" },
      { property: "og:description", content: "حساب واحد لكل خدمات يمّك." },
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

  useEffect(() => {
    if (account?.userId) navigate({ to: homeRouteForAccount(account), replace: true });
  }, [account, navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error("تعذر تسجيل الدخول: تأكد من البريد وكلمة المرور");
    toast.success("أهلاً بيك بيمّك");
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, phone },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (!data.session) toast.success("تم إنشاء الحساب، راجع بريدك لتأكيد التسجيل");
  }

  async function resetPassword() {
    if (!email) return toast.error("اكتب بريدك أولاً");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("أرسلنا رابط استعادة كلمة المرور إلى بريدك");
  }

  return (
    <div className="app-shell flex flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black text-primary">يمّك</h1>
        <p className="mt-1 text-sm text-muted-foreground">ويّانه كلشي صار يمّك</p>
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
            <button type="button" onClick={resetPassword} className="w-full text-sm text-muted-foreground">
              نسيت كلمة المرور؟
            </button>
          </form>
        </TabsContent>

        <TabsContent value="signup">
          <form onSubmit={signUp} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email2">البريد الإلكتروني</Label>
              <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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

      <Link to="/" className="mt-6 text-center text-sm text-muted-foreground">
        تصفح التطبيق بدون تسجيل
      </Link>
    </div>
  );
}
