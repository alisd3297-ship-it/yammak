import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, ClipboardList, LogOut, MapPin, Megaphone, Plus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/auth";
import { useSignOut } from "@/lib/sign-out";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "حسابي | لبابك" },
      { name: "description", content: "إدارة بياناتك الشخصية وعناوين التوصيل المحفوظة في تطبيق لبابك." },
      { property: "og:title", content: "حسابي | لبابك" },
      { property: "og:description", content: "بياناتك الشخصية وعناوينك المحفوظة وطلباتك في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

type AddressRow = {
  id: string;
  label: string;
  address_text: string;
  is_default: boolean;
};

function AccountPage() {
  const { data: account, isLoading } = useAccount();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const userId = account?.userId ?? null;

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [label, setLabel] = useState("");
  const [addressText, setAddressText] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    if (!account?.profile) return;
    setFullName(account.profile.full_name ?? "");
    setPhone(account.profile.phone ?? "");
  }, [account?.profile]);

  const addresses = useQuery({
    queryKey: ["my-addresses", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("id, label, address_text, is_default")
        .eq("user_id", userId!)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AddressRow[];
    },
  });

  async function saveProfile() {
    if (!userId) return;
    if (fullName.trim().length < 3) {
      toast.error("اكتب الاسم الكامل");
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq("id", userId);
    setSavingProfile(false);
    if (error) {
      toast.error("تعذر حفظ البيانات");
      return;
    }
    toast.success("تم حفظ البيانات");
    void qc.invalidateQueries({ queryKey: ["account"] });
  }

  async function addAddress() {
    if (!userId) return;
    if (addressText.trim().length < 5) {
      toast.error("اكتب عنواناً واضحاً");
      return;
    }
    setSavingAddress(true);
    const { error } = await supabase.from("addresses").insert({
      user_id: userId,
      label: label.trim() || "عنواني",
      address_text: addressText.trim(),
      is_default: (addresses.data ?? []).length === 0,
    });
    setSavingAddress(false);
    if (error) {
      toast.error("تعذر حفظ العنوان");
      return;
    }
    setLabel("");
    setAddressText("");
    toast.success("تمت إضافة العنوان");
    void addresses.refetch();
  }

  async function makeDefault(id: string) {
    if (!userId) return;
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId);
    const { error } = await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    if (error) toast.error("تعذر التحديث");
    void addresses.refetch();
  }

  async function removeAddress(id: string) {
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (error) toast.error("تعذر حذف العنوان");
    else void addresses.refetch();
  }

  if (!isLoading && !userId) {
    return (
      <PageShell>
        <header className="bg-primary px-4 pb-6 pt-5 text-primary-foreground">
          <BackButton fallback="/" />
          <h1 className="text-xl font-black">حسابي</h1>
        </header>
        <div className="mx-4 mt-6 rounded-2xl bg-card p-5 text-sm shadow-card">
          سجّل الدخول للوصول إلى بياناتك وعناوينك المحفوظة.
          <Link to="/auth" className="mt-3 block font-semibold text-primary">
            الذهاب لتسجيل الدخول
          </Link>
        </div>
        <BottomNav />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="bg-primary px-4 pb-6 pt-5 text-primary-foreground">
        <BackButton fallback="/" />
        <h1 className="text-xl font-black">حسابي</h1>
        <p className="mt-1 text-sm opacity-90" dir="ltr">
          {account?.session?.user.email ?? ""}
        </p>
      </header>

      <section className="mx-4 mt-4 space-y-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="font-bold">البيانات الشخصية</h2>
        <div className="space-y-2">
          <Label htmlFor="full_name">الاسم الكامل</Label>
          <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">رقم الهاتف</Label>
          <Input id="phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXXX" />
        </div>
        <Button className="h-11 w-full" onClick={() => void saveProfile()} disabled={savingProfile}>
          حفظ التعديلات
        </Button>
      </section>

      <section className="mx-4 mt-4 space-y-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-bold">
          <MapPin className="size-4 text-primary" /> عناويني المحفوظة
        </h2>
        {(addresses.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد عناوين محفوظة بعد.</p>
        ) : (
          <ul className="space-y-2">
            {(addresses.data ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {a.label}
                      {a.is_default ? <span className="ms-2 text-xs text-success">(الافتراضي)</span> : null}
                    </p>
                    <p className="text-muted-foreground">{a.address_text}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!a.is_default ? (
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-primary"
                        onClick={() => void makeDefault(a.id)}
                      >
                        تعيين افتراضي
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label="حذف العنوان"
                      className="rounded-lg p-2 text-destructive"
                      onClick={() => void removeAddress(a.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 border-t border-border pt-3">
          <Input placeholder="اسم العنوان (البيت، العمل)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input
            placeholder="العنوان بالتفصيل"
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
          />
          <Button variant="secondary" className="h-11 w-full" onClick={() => void addAddress()} disabled={savingAddress}>
            <Plus className="size-4" /> إضافة عنوان
          </Button>
        </div>
      </section>

      <section className="mx-4 mt-4 divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-card">
        <Link to="/orders" className="flex items-center gap-3 px-5 py-4 text-sm font-semibold">
          <ClipboardList className="size-5 text-primary" /> طلباتي
        </Link>
        <Link to="/notifications" className="flex items-center gap-3 px-5 py-4 text-sm font-semibold">
          <Bell className="size-5 text-primary" /> الإشعارات
        </Link>
        <Link to="/wallet" className="flex items-center gap-3 px-5 py-4 text-sm font-semibold">
          <Wallet className="size-5 text-primary" /> محفظتي
        </Link>
        <Link to="/ads" className="flex items-center gap-3 px-5 py-4 text-sm font-semibold">
          <Megaphone className="size-5 text-primary" /> إعلاناتي
        </Link>
      </section>

      <div className="mx-4 mt-4">
        <Button variant="outline" className="h-11 w-full text-destructive" onClick={() => void signOut()}>
          <LogOut className="size-4" /> تسجيل الخروج
        </Button>
      </div>

      <BottomNav />
    </PageShell>
  );
}
