import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminUpsertProvider } from "@/lib/provider.functions";
import { createProviderAccount } from "@/lib/provider-accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * نموذج إدارة نشاط تجاري (إضافة/تعديل) مرتبط فعلياً بقاعدة البيانات
 * عبر الدالة الآمنة admin_upsert_provider (تتحقق من صلاحية الإدارة داخل القاعدة).
 */

/** أنواع النشاط المعروضة للإدارة، مربوطة بنوع القاعدة + كلمات مفتاحية للتصنيف. */
const BUSINESS_TYPES = [
  { key: "restaurant", label: "مطعم", kind: "restaurant" as const, keywords: [] as string[] },
  { key: "store", label: "متجر", kind: "store" as const, keywords: [] as string[] },
  {
    key: "supermarket",
    label: "سوبرماركت",
    kind: "store" as const,
    keywords: ["سوبرماركت", "بقالة", "supermarket"],
  },
  {
    key: "service",
    label: "مقدم خدمة",
    kind: "profession" as const,
    keywords: ["خدمة", "خدمات"],
  },
  { key: "profession", label: "مهنة", kind: "profession" as const, keywords: [] as string[] },
] as const;

type BusinessTypeKey = (typeof BUSINESS_TYPES)[number]["key"];

const STATUS_OPTIONS = [
  { key: "approved", label: "معتمد" },
  { key: "pending", label: "قيد المراجعة" },
  { key: "suspended", label: "معلّق" },
  { key: "rejected", label: "مرفوض" },
] as const;

export type ProviderFormValue = {
  id: string;
  name: string;
  kind: string;
  status: string;
  description: string | null;
  phone: string | null;
  address_text: string | null;
  city_id: string | null;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
  opening_time: string | null;
  closing_time: string | null;
  delivery_fee_override: number | null;
  min_order_amount: number | null;
  is_open: boolean;
  keywords: string[] | null;
  profession_category_id: string | null;
};

/** كلمة مرور أولية قوية يسلّمها المسؤول لصاحب النشاط. */
function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

function typeKeyOf(p: ProviderFormValue | null): BusinessTypeKey {
  if (!p) return "restaurant";
  const kw = (p.keywords ?? []).join(" ");
  if (p.kind === "store" && /سوبرماركت|supermarket|بقالة/i.test(kw)) return "supermarket";
  if (p.kind === "profession") return "profession";
  if (p.kind === "restaurant") return "restaurant";
  return "store";
}

/** رفع الشعار إلى المخزن الخاص، ويُعاد مسار عام آمن لعرضه. */
async function uploadLogo(providerKey: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `providers/${providerKey}/logo-${Date.now()}.${ext || "jpg"}`;
  const { error } = await supabase.storage
    .from("provider-images")
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw new Error(error.message);
  return `/api/public/provider-image/${path}`;
}

export function ProviderFormDialog({
  open,
  onOpenChange,
  provider,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  provider: ProviderFormValue | null;
  onSaved: (providerId: string | null, status: string) => void;
}) {
  const upsert = useServerFn(adminUpsertProvider);
  const createAccount = useServerFn(createProviderAccount);
  const fileRef = useRef<HTMLInputElement>(null);

  const [typeKey, setTypeKey] = useState<BusinessTypeKey>("restaurant");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [addressText, setAddressText] = useState("");
  const [cityId, setCityId] = useState("");
  const [professionCategoryId, setProfessionCategoryId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [openingTime, setOpeningTime] = useState("");
  const [closingTime, setClosingTime] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["key"]>("approved");
  const [isOpen, setIsOpen] = useState(true);
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // حساب دخول صاحب النشاط (يُنشأ مع النشاط في نفس الخطوة)
  const [withAccount, setWithAccount] = useState(true);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  const { data: cities } = useQuery({
    queryKey: ["cities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cities")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order");
      return data ?? [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["profession-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profession_categories")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order");
      return data ?? [];
    },
  });

  // تعبئة النموذج عند الفتح (إضافة جديدة أو تعديل نشاط قائم)
  useEffect(() => {
    if (!open) return;
    setTypeKey(typeKeyOf(provider));
    setName(provider?.name ?? "");
    setDescription(provider?.description ?? "");
    setPhone(provider?.phone ?? "");
    setAddressText(provider?.address_text ?? "");
    setCityId(provider?.city_id ?? "");
    setProfessionCategoryId(provider?.profession_category_id ?? "");
    setLat(provider?.lat != null ? String(provider.lat) : "");
    setLng(provider?.lng != null ? String(provider.lng) : "");
    setOpeningTime((provider?.opening_time ?? "").slice(0, 5));
    setClosingTime((provider?.closing_time ?? "").slice(0, 5));
    setDeliveryFee(
      provider?.delivery_fee_override != null ? String(provider.delivery_fee_override) : "",
    );
    setMinOrder(provider?.min_order_amount != null ? String(provider.min_order_amount) : "");
    setStatus((provider?.status as (typeof STATUS_OPTIONS)[number]["key"]) ?? "approved");
    setIsOpen(provider?.is_open ?? true);
    setLogoUrl(provider?.logo_url ?? "");
    setWithAccount(!provider);
    setOwnerName("");
    setOwnerEmail("");
    setOwnerPassword(provider ? "" : randomPassword());
  }, [open, provider]);

  const typeDef = BUSINESS_TYPES.find((t) => t.key === typeKey) ?? BUSINESS_TYPES[0];
  const needsCategory = typeDef.kind === "profession";

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة كبير — الحد الأقصى 5 ميغابايت");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadLogo(provider?.id ?? crypto.randomUUID(), file);
      setLogoUrl(url);
      toast.success("تم رفع الشعار");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      toast.error("اكتب اسم النشاط");
      return;
    }
    if (needsCategory && !professionCategoryId) {
      toast.error("اختر تصنيف المهنة/الخدمة");
      return;
    }
    const creatingAccount = !provider && withAccount;
    if (creatingAccount) {
      if (!ownerEmail.trim().includes("@")) {
        toast.error("اكتب بريد صاحب النشاط أو ألغِ إنشاء الحساب");
        return;
      }
      if (ownerPassword.length < 8) {
        toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
        return;
      }
    }
    setSaving(true);
    try {
      const keywords = typeDef.keywords.length
        ? Array.from(new Set([...(provider?.keywords ?? []), ...typeDef.keywords]))
        : (provider?.keywords ?? null);
      const saved = await upsert({
        data: {
          providerId: provider?.id ?? null,
          name: name.trim(),
          kind: typeDef.kind,
          description: description.trim() || null,
          phone: phone.trim() || null,
          addressText: addressText.trim() || null,
          cityId: cityId || null,
          lat: lat.trim() ? Number(lat) : null,
          lng: lng.trim() ? Number(lng) : null,
          logoUrl: logoUrl || null,
          openingTime: openingTime || null,
          closingTime: closingTime || null,
          deliveryFeeOverride: deliveryFee.trim() ? Number(deliveryFee) : null,
          minOrderAmount: minOrder.trim() ? Number(minOrder) : 0,
          status,
          isOpen,
          keywords,
          professionCategoryId: needsCategory ? professionCategoryId : null,
        },
      });
      if (creatingAccount && saved?.id) {
        await createAccount({
          data: {
            providerId: saved.id,
            email: ownerEmail.trim(),
            password: ownerPassword,
            fullName: ownerName.trim() || name.trim(),
            mode: "password",
            redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth` : null,
          },
        });
        toast.success(`تمت إضافة النشاط وإنشاء حساب الدخول: ${ownerEmail.trim()}`);
      } else {
        toast.success(provider ? "تم تحديث النشاط" : "تمت إضافة النشاط");
      }
      onOpenChange(false);
      onSaved(saved?.id ?? null, status);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-2xl"
      >
        <DialogHeader className="text-start">
          <DialogTitle>{provider ? "تعديل النشاط" : "إضافة نشاط جديد"}</DialogTitle>
          <DialogDescription>
            مطعم أو محل أو مقدم خدمة — يُحفظ مباشرة ويظهر في قائمة مقدمي الخدمة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>نوع النشاط</Label>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTypeKey(t.key)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    typeKey === t.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-name">اسم النشاط *</Label>
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {needsCategory && (
            <div className="space-y-1.5">
              <Label htmlFor="pf-cat">تصنيف المهنة/الخدمة *</Label>
              <select
                id="pf-cat"
                value={professionCategoryId}
                onChange={(e) => setProfessionCategoryId(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">اختر التصنيف</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pf-desc">الوصف</Label>
            <Textarea
              id="pf-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>الشعار / الصورة</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`شعار ${name || "النشاط"}`}
                  className="size-14 rounded-xl object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid size-14 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <ImagePlus className="size-5" />
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void pickLogo(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : "رفع صورة"}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10"
                  onClick={() => setLogoUrl("")}
                >
                  إزالة
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-phone">الهاتف</Label>
              <Input
                id="pf-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-city">المحافظة</Label>
              <select
                id="pf-city"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">بدون تحديد</option>
                {(cities ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-addr">العنوان</Label>
            <Input
              id="pf-addr"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-lat">خط العرض (lat)</Label>
              <Input
                id="pf-lat"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-lng">خط الطول (lng)</Label>
              <Input
                id="pf-lng"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-open">وقت الفتح</Label>
              <Input
                id="pf-open"
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-close">وقت الإغلاق</Label>
              <Input
                id="pf-close"
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-fee">رسوم التوصيل (اختياري)</Label>
              <Input
                id="pf-fee"
                inputMode="numeric"
                placeholder="حسب التسعيرة العامة"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-min">الحد الأدنى للطلب</Label>
              <Input
                id="pf-min"
                inputMode="numeric"
                placeholder="0"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
              />
            </div>
          </div>

          {!provider && (
            <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <UserPlus className="size-4 text-primary" />
                    حساب دخول صاحب النشاط
                  </p>
                  <p className="text-xs text-muted-foreground">
                    حساب مستقل يدخل منه لوحته فقط، ولا يرى أي نشاط آخر.
                  </p>
                </div>
                <Switch checked={withAccount} onCheckedChange={setWithAccount} />
              </div>

              {withAccount && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-owner-name">اسم صاحب الحساب</Label>
                    <Input
                      id="pf-owner-name"
                      value={ownerName}
                      placeholder={name || "اسم صاحب المطعم/المحل"}
                      onChange={(e) => setOwnerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-owner-email">البريد الإلكتروني *</Label>
                    <Input
                      id="pf-owner-email"
                      type="email"
                      dir="ltr"
                      autoComplete="off"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-owner-pass">كلمة المرور *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="pf-owner-pass"
                        type="text"
                        dir="ltr"
                        autoComplete="off"
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0"
                        onClick={() => setOwnerPassword(randomPassword())}
                      >
                        توليد
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      انسخ البريد وكلمة المرور وسلّمها لصاحب النشاط — يسجّل الدخول من شاشة الدخول
                      العادية ويُوجَّه تلقائياً للوحة نشاطه.
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    رقم هاتف الحساب يُؤخذ من حقل هاتف النشاط أعلاه.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>حالة النشاط</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    status === s.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
            <div>
              <p className="text-sm font-semibold">مفتوح الآن</p>
              <p className="text-xs text-muted-foreground">يظهر للزبائن كمتاح لاستقبال الطلبات</p>
            </div>
            <Switch
              checked={isOpen && status === "approved"}
              disabled={status !== "approved"}
              onCheckedChange={setIsOpen}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            className="h-11 flex-1"
            disabled={saving || uploading}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : !provider && withAccount ? (
              "حفظ وإنشاء حساب الدخول"
            ) : (
              "حفظ"
            )}
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
