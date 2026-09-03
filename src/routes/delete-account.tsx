import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "حذف الحساب | لبابك" },
      {
        name: "description",
        content:
          "اطلب حذف حسابك وبياناتك الشخصية في تطبيق لبابك نهائياً، من داخل التطبيق أو عبر هذه الصفحة.",
      },
      { property: "og:title", content: "حذف الحساب | لبابك" },
      {
        property: "og:description",
        content: "خطوات حذف حساب لبابك والبيانات التي تُحذف والتي يتم الاحتفاظ بها.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const [contact, setContact] = useState("");
  const [fullName, setFullName] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (contact.trim().length < 5) {
      toast.error("اكتب بريدك الإلكتروني أو رقم هاتفك المسجل");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("account_deletion_requests").insert({
      contact: contact.trim(),
      full_name: fullName.trim() || null,
      reason: reason.trim() || null,
    });
    setSending(false);
    if (error) {
      toast.error("تعذر إرسال الطلب، حاول مرة أخرى");
      return;
    }
    setSent(true);
    toast.success("تم استلام طلب حذف الحساب");
  }

  return (
    <main dir="rtl" className="mx-auto min-h-screen w-full max-w-2xl bg-background px-4 py-8">
      <h1 className="text-2xl font-black text-foreground">حذف حساب لبابك</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        تطبيق لبابك — منصة الطلبات والتوصيل والخدمات المحلية. هذه الصفحة توضّح كيفية حذف حسابك
        وبياناتك الشخصية نهائياً.
      </p>

      <section className="mt-6 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="font-bold">الطريقة الأولى: من داخل التطبيق (الأسرع)</h2>
        <ol className="mt-2 list-decimal space-y-1 pe-5 text-sm text-muted-foreground">
          <li>افتح تطبيق لبابك وسجّل الدخول.</li>
          <li>اذهب إلى «حسابي».</li>
          <li>انزل إلى قسم «إعدادات الحساب».</li>
          <li>اضغط «حذف الحساب نهائياً».</li>
          <li>أكّد العملية في نافذة التأكيد — الحذف فوري ونهائي.</li>
        </ol>
        <Link to="/account" className="mt-3 inline-block text-sm font-semibold text-primary">
          الذهاب إلى صفحة حسابي
        </Link>
      </section>

      <section className="mt-4 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="font-bold">الطريقة الثانية: طلب الحذف من هنا</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          إذا لم تعد تستطيع الدخول إلى التطبيق، أرسل طلباً وسنقوم بالتحقق من هويتك ثم حذف الحساب
          خلال مدة أقصاها 30 يوماً.
        </p>
        {sent ? (
          <p className="mt-4 rounded-xl bg-success/10 p-4 text-sm font-semibold text-success">
            تم استلام طلبك. سنتواصل معك على وسيلة التواصل التي أدخلتها لتأكيد الحذف.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="contact">البريد الإلكتروني أو رقم الهاتف المسجل</Label>
              <Input
                id="contact"
                dir="ltr"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">الاسم (اختياري)</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">سبب الحذف (اختياري)</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button className="h-11 w-full" disabled={sending} onClick={() => void submit()}>
              إرسال طلب حذف الحساب
            </Button>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-2xl bg-card p-5 text-sm shadow-card">
        <h2 className="font-bold">ما الذي يُحذف؟</h2>
        <ul className="mt-2 list-disc space-y-1 pe-5 text-muted-foreground">
          <li>حساب الدخول (لن يعود بالإمكان تسجيل الدخول به).</li>
          <li>الاسم ورقم الهاتف والملف الشخصي.</li>
          <li>العناوين المحفوظة والخدمات المفضلة.</li>
          <li>الإشعارات والأجهزة ورموز الإشعارات المرتبطة بالحساب.</li>
          <li>الإعلانات وإعلانات السوق وملف السائق والاشتراكات والعضويات.</li>
        </ul>
        <h2 className="mt-4 font-bold">ما الذي يتم الاحتفاظ به؟</h2>
        <ul className="mt-2 list-disc space-y-1 pe-5 text-muted-foreground">
          <li>
            سجلات الطلبات والرحلات والمدفوعات والفواتير وسجلات التدقيق، للأغراض المالية والقانونية
            والأمنية فقط — ويتم فصلها عن هويتك الشخصية بعد الحذف.
          </li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          مدة الاحتفاظ بالسجلات المالية تخضع للمتطلبات القانونية المعمول بها. لمزيد من التفاصيل راجع{" "}
          <Link to="/privacy" className="font-semibold text-primary underline underline-offset-4">
            سياسة الخصوصية
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
