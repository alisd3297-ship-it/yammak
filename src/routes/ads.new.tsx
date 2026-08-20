import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/lib/auth";
import { createAd } from "@/lib/ads.functions";
import { AD_IMAGES_MAX, adImageUrl, type AdCategory } from "@/lib/ads";

export const Route = createFileRoute("/ads/new")({
  head: () => ({
    meta: [
      { title: "انشر إعلان جديد | يمّك" },
      { name: "description", content: "انشر إعلانك في يمّك: عنوان، وصف، فئة، صور، سعر، رقم اتصال وعنوان — بعد مراجعة الإدارة." },
      { property: "og:title", content: "انشر إعلان جديد | يمّك" },
      { property: "og:description", content: "أضف إعلانك في يمّك ووصل لآلاف المستخدمين بعد موافقة الإدارة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewAdPage,
});

function NewAdPage() {
  const navigate = useNavigate();
  const { data: account } = useAccount();
  const submit = useServerFn(createAd);

  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [price, setPrice] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["ad-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_categories")
        .select("id, name, icon, color, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      return (data ?? []) as AdCategory[];
    },
  });

  async function onPick(files: FileList | null) {
    if (!files || !account?.userId) return;
    const room = AD_IMAGES_MAX - images.length;
    if (room <= 0) {
      toast.error(`الحد الأقصى ${AD_IMAGES_MAX} صور`);
      return;
    }
    setUploading(true);
    const added: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 5 * 1024 * 1024) {
        toast.error("حجم الصورة أكبر من 5 ميغا");
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${account.userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("ad-images").upload(path, file, { contentType: file.type });
      if (error) toast.error("تعذر رفع الصورة");
      else added.push(path);
    }
    setImages((current) => [...current, ...added].slice(0, AD_IMAGES_MAX));
    setUploading(false);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!account?.userId) {
      toast.error("سجّل الدخول أولاً لنشر إعلان");
      return;
    }
    setSaving(true);
    try {
      await submit({
        data: {
          categoryId,
          title,
          body,
          contactPhone: phone,
          addressText: address,
          images,
          price: price.trim() ? Number(price) : null,
        },
      });
      toast.success("تم إرسال الإعلان للمراجعة");
      navigate({ to: "/ads" });
    } catch (error) {
      toast.error((error as Error).message || "تعذر نشر الإعلان");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-6 pt-6 text-primary-foreground shadow-card">
        <div className="flex items-center gap-3">
          <Link to="/ads" aria-label="رجوع" className="rounded-full bg-white/15 p-2">
            <ArrowRight className="size-5" />
          </Link>
          <h1 className="text-xl font-black">إعلان جديد</h1>
        </div>
      </header>

      <form className="space-y-4 p-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label>فئة الإعلان</Label>
          <div className="flex flex-wrap gap-2">
            {(categories ?? []).map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={
                  categoryId === category.id
                    ? "rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                    : "rounded-full bg-card px-3 py-1.5 text-xs font-bold shadow-soft"
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ad-title">عنوان الإعلان</Label>
          <Input id="ad-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ad-body">وصف الإعلان</Label>
          <Textarea id="ad-body" value={body} onChange={(e) => setBody(e.target.value)} required rows={5} maxLength={2000} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ad-price">السعر (د.ع)</Label>
            <Input id="ad-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="اختياري" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-phone">رقم الاتصال</Label>
            <Input id="ad-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ad-address">العنوان</Label>
          <Input id="ad-address" value={address} onChange={(e) => setAddress(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label>الصور (1 إلى {AD_IMAGES_MAX})</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((path) => (
              <div key={path} className="relative size-20 overflow-hidden rounded-xl">
                <img src={adImageUrl(path)} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  aria-label="حذف الصورة"
                  onClick={() => setImages((current) => current.filter((item) => item !== path))}
                  className="absolute inset-inline-start-1 top-1 rounded-full bg-background/90 p-1"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {images.length < AD_IMAGES_MAX ? (
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-card text-xs shadow-soft">
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                <span>إضافة</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onPick(e.target.files)} />
              </label>
            ) : null}
          </div>
        </div>

        <Button type="submit" disabled={saving || uploading || images.length === 0 || !categoryId} className="h-12 w-full text-base font-bold">
          {saving ? <Loader2 className="size-5 animate-spin" /> : null} إرسال للمراجعة
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          يظهر الإعلان للعامة فقط بعد موافقة الإدارة.
        </p>
      </form>
    </PageShell>
  );
}
