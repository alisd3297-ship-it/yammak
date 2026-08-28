import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ProductImage } from "@/components/product-image";
import { formatIQD } from "@/lib/orders";

type Props = { providerId: string; isStore: boolean };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** رفع صورة منتج إلى مجلد النشاط، ويُعاد مسار عام آمن لعرضه. */
async function uploadProductImage(providerId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("الملف لازم يكون صورة");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("حجم الصورة كبير، الحد 5 ميغابايت");
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `providers/${providerId}/prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "jpg"}`;
  const { error } = await supabase.storage
    .from("provider-images")
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw new Error(error.message);
  return `/api/public/provider-image/${path}`;
}

/** إدارة الكتالوج للمزوّد — كل الكتابات محكومة بسياسات RLS على المالك فقط. */
export function ProviderCatalog({ providerId, isStore }: Props) {
  const qc = useQueryClient();
  const [catName, setCatName] = useState("");
  const [form, setForm] = useState({ name: "", price: "", cost: "", stock: "", categoryId: "" });
  const [newImage, setNewImage] = useState<{ url: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const newImageRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["provider-catalog", providerId],
    queryFn: async () => {
      const [categories, products] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("id, name, sort_order")
          .eq("provider_id", providerId)
          .order("sort_order"),
        supabase
          .from("products")
          .select("id, name, price, cost_price, stock, is_available, category_id, image_url")
          .eq("provider_id", providerId)
          .order("sort_order"),
      ]);
      return { categories: categories.data ?? [], products: products.data ?? [] };
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["provider-catalog", providerId] });
  }

  async function addCategory() {
    if (!catName.trim()) return;
    const { error } = await supabase.from("menu_categories").insert({
      provider_id: providerId,
      name: catName.trim(),
      sort_order: (data?.categories.length ?? 0) + 1,
    });
    if (error) {
      toast.error("تعذر إضافة القسم");
      return;
    }
    setCatName("");
    refresh();
  }

  async function addProduct() {
    const price = Number(form.price);
    if (!form.name.trim() || !Number.isFinite(price) || price <= 0) {
      toast.error("اكتب اسم المنتج وسعراً صحيحاً");
      return;
    }
    const stock = isStore && form.stock !== "" ? Math.max(0, Math.trunc(Number(form.stock))) : null;
    const { error } = await supabase.from("products").insert({
      provider_id: providerId,
      category_id: form.categoryId || null,
      name: form.name.trim(),
      price,
      cost_price: form.cost !== "" && Number.isFinite(Number(form.cost)) ? Number(form.cost) : null,
      stock,
      image_url: newImage?.url ?? null,
      sort_order: (data?.products.length ?? 0) + 1,
    });
    if (error) {
      toast.error("تعذر إضافة المنتج");
      return;
    }
    setForm({ name: "", price: "", cost: "", stock: "", categoryId: "" });
    setNewImage(null);
    if (newImageRef.current) newImageRef.current.value = "";
    refresh();
  }

  /** رفع صورة للمنتج الجديد قبل الحفظ. */
  async function pickNewImage(file: File | undefined) {
    if (!file) return;
    setUploading("new");
    try {
      const url = await uploadProductImage(providerId, file);
      setNewImage({ url, preview: URL.createObjectURL(file) });
      toast.success("تم رفع الصورة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setUploading(null);
    }
  }

  /** تغيير أو إضافة صورة لمنتج محفوظ. */
  async function changeProductImage(id: string, file: File | undefined) {
    if (!file) return;
    setUploading(id);
    try {
      const url = await uploadProductImage(providerId, file);
      await patchProduct(id, { image_url: url });
      toast.success("تم تحديث صورة المنتج");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setUploading(null);
    }
  }

  type ProductPatch = {
    price?: number;
    cost_price?: number | null;
    stock?: number | null;
    is_available?: boolean;
    image_url?: string | null;
  };

  async function patchProduct(id: string, patch: ProductPatch) {
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) {
      toast.error("تعذر حفظ التعديل");
      return;
    }
    refresh();
  }

  async function removeProduct(id: string) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast.error("تعذر حذف المنتج");
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-card p-4 shadow-soft">
        <h3 className="mb-3 text-sm font-bold">الأقسام</h3>
        <div className="flex flex-wrap gap-2">
          {(data?.categories ?? []).map((c) => (
            <span key={c.id} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">
              {c.name}
            </span>
          ))}
          {!data?.categories.length && (
            <p className="text-xs text-muted-foreground">ماكو أقسام بعد.</p>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="اسم القسم الجديد"
            className="h-11"
          />
          <Button className="h-11" onClick={addCategory}>
            <Plus className="size-4" /> إضافة
          </Button>
        </div>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-soft">
        <h3 className="mb-3 text-sm font-bold">إضافة منتج</h3>
        <div className="space-y-2">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="اسم المنتج"
            className="h-11"
          />
          <div className="flex gap-2">
            <Input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="السعر بالدينار"
              inputMode="numeric"
              className="h-11"
            />
            <Input
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              placeholder="التكلفة (اختياري)"
              inputMode="numeric"
              className="h-11"
            />
            {isStore && (
              <Input
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="المخزون"
                inputMode="numeric"
                className="h-11"
              />
            )}
          </div>
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            aria-label="القسم"
          >
            <option value="">بدون قسم</option>
            {(data?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <ProductImage src={newImage?.preview} alt="صورة المنتج الجديد" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">صورة المنتج (اختيارية)</p>
              <p className="text-[11px] text-muted-foreground">JPG أو PNG، حد أقصى 5 ميغابايت</p>
            </div>
            <input
              ref={newImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickNewImage(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={uploading === "new"}
              onClick={() => newImageRef.current?.click()}
            >
              {uploading === "new" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {newImage ? "تغيير" : "رفع صورة"}
            </Button>
          </div>
          <Button className="h-11 w-full" onClick={addProduct}>
            حفظ المنتج
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        {(data?.products ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <ProductImage src={p.image_url} alt={p.name} className="size-14" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.name}</p>
                <span className="text-sm font-bold text-primary">{formatIQD(Number(p.price))}</span>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => changeProductImage(p.id, e.target.files?.[0])}
                />
                <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-semibold">
                  {uploading === p.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="size-4" />
                  )}
                  {p.image_url ? "تغيير الصورة" : "إضافة صورة"}
                </span>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold">
                <Switch
                  checked={p.is_available}
                  onCheckedChange={(v) => patchProduct(p.id, { is_available: v })}
                />
                {p.is_available ? "متوفر" : "غير متوفر"}
              </label>
              {isStore && (
                <label className="flex items-center gap-2 text-xs font-semibold">
                  المخزون
                  <Input
                    defaultValue={p.stock ?? ""}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const value = raw === "" ? null : Math.max(0, Math.trunc(Number(raw)));
                      if (value !== null && !Number.isFinite(value)) return;
                      if (value !== (p.stock ?? null)) patchProduct(p.id, { stock: value });
                    }}
                    inputMode="numeric"
                    className="h-9 w-24"
                  />
                </label>
              )}
              <Input
                defaultValue={p.price}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value > 0 && value !== Number(p.price))
                    patchProduct(p.id, { price: value });
                }}
                inputMode="numeric"
                className="h-9 w-28"
                aria-label="تعديل السعر"
              />
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => removeProduct(p.id)}
                aria-label="حذف المنتج"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        {!data?.products.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">ماكو منتجات بعد.</p>
        )}
      </section>
    </div>
  );
}
