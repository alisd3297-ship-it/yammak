import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useAccount } from "@/lib/auth";
import {
  SERVICE_PREF_OPTIONS,
  routeForPrefs,
  useSaveServicePreferences,
  useServicePreferences,
  type ServicePrefKey,
} from "@/lib/service-preferences";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/welcome")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "شنو تحب تستخدم من لبابك؟" },
      {
        name: "description",
        content: "اختر الخدمات التي تهمك في لبابك: مطاعم، متاجر، صيدليات، توصيل، تاكسي وخدمات.",
      },
      { property: "og:title", content: "شنو تحب تستخدم من لبابك؟" },
      { property: "og:description", content: "خدماتك وطلباتك لبابك — اختر أقسامك المفضلة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const navigate = useNavigate();
  const { data: account, isLoading: accountLoading } = useAccount();
  const { prefs, isSet, isLoading } = useServicePreferences();
  const savePrefs = useSaveServicePreferences();
  const [selected, setSelected] = useState<ServicePrefKey[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prefs.length) setSelected(prefs);
  }, [prefs.join(",")]);

  useEffect(() => {
    if (!accountLoading && !account?.userId) navigate({ to: "/auth", replace: true });
  }, [account?.userId, accountLoading, navigate]);

  function toggle(key: ServicePrefKey) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function save() {
    if (!account?.userId) return;
    if (!selected.length) {
      toast.error("اختر خدمة واحدة على الأقل");
      return;
    }
    setSaving(true);
    try {
      await savePrefs(account.userId, selected);
      toast.success("تم حفظ اختياراتك");
      navigate({ to: routeForPrefs(selected), replace: true });
    } catch {
      toast.error("تعذر حفظ الاختيارات، حاول مرة أخرى");
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    if (!account?.userId) return;
    setSaving(true);
    try {
      await savePrefs(account.userId, []);
    } catch {
      // نكمل حتى لو فشل الحفظ
    }
    setSaving(false);
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="app-shell min-h-dvh bg-background px-5 py-8" dir="rtl">
      <header className="text-center">
        <h1 className="text-3xl font-black text-primary">لبابك</h1>
        <p className="mt-1 text-sm text-muted-foreground">خدماتك وطلباتك لبابك</p>
      </header>

      <div className="mt-8">
        <h2 className="text-xl font-bold">شنو تحب تستخدم من لبابك؟</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          اختر قسم أو أكثر، نرتّبلك التطبيق حسب اهتمامك. تكدر تغيّرها لاحقاً من «حسابي».
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {SERVICE_PREF_OPTIONS.map((opt) => {
          const active = selected.includes(opt.key);
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggle(opt.key)}
              aria-pressed={active}
              className={`relative rounded-3xl border p-4 text-right transition ${
                active ? "border-primary bg-primary/10 shadow-card" : "border-border bg-card"
              }`}
            >
              {active ? (
                <span className="absolute left-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" />
                </span>
              ) : null}
              <Icon className="size-8 text-primary" aria-hidden />
              <span className="mt-2 block text-base font-bold">{opt.label}</span>
              <span className="block text-xs text-muted-foreground">{opt.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 space-y-3 pb-6">
        <Button className="h-12 w-full text-base" onClick={save} disabled={saving || isLoading}>
          {saving ? "جاري الحفظ..." : "يلا نبدأ"}
        </Button>
        <button
          type="button"
          onClick={skip}
          disabled={saving}
          className="w-full text-sm text-muted-foreground"
        >
          {isSet ? "رجوع بدون تغيير" : "تخطي الآن"}
        </button>
      </div>
    </div>
  );
}
