import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Copy, ImagePlus, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ProductImage } from "@/components/product-image";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/orders";
import { normalizeArabic } from "@/lib/search";

type Props = { providerId: string; isStore: boolean };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  is_available: boolean;
  category_id: string | null;
  image_url: string | null;
  sort_order?: number | null;
};

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

/**
 * كتالوج المزوّد: إضافة سريعة بخطوة واحدة + تعديل/نسخ/حذف داخل نفس الصفحة.
 * لا يوجد أي حقل تكلفة — سعر البيع فقط.
 */
export function ProviderCatalog({ providerId, isStore }: Props) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", price: "", stock: "" });
  const [newImage, setNewImage] = useState<{ url: string; preview: string } | null>(null);
  const newImageRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["provider-catalog", providerId],
    queryFn: async () => {
      const products = await supabase
        .from("products")
        .select(
          "id, name, description, price, stock, is_available, category_id, image_url, sort_order",
        )
        .eq("provider_id", providerId)
        .order("sort_order");
      return { products: (products.data ?? []) as ProductRow[] };
    },
  });

  const products = data?.products ?? [];

  const visible = useMemo(() => {
    const q = normalizeArabic(term);
    if (!q) return products;
    return products.filter((p) => normalizeArabic(`${p.name} ${p.description ?? ""}`).includes(q));
  }, [products, term]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["provider-catalog", providerId] });
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
      name: form.name.trim(),
      price,
      stock,
      image_url: newImage?.url ?? null,
      sort_order: products.length + 1,
    });
    if (error) {
      toast.error(`تعذر إضافة المنتج: ${error.message}`);
      return;
    }
    toast.success("تمت إضافة المنتج");
    setForm({ name: "", price: "", stock: "" });
    setNewImage(null);
    if (newImageRef.current) newImageRef.current.value = "";
    refresh();
  }

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
    name?: string;
    description?: string | null;
    price?: number;
    stock?: number | null;
    is_available?: boolean;
    image_url?: string | null;
    category_id?: string | null;
  };

  async function patchProduct(id: string, patch: ProductPatch) {
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) {
      toast.error(`تعذر حفظ التعديل: ${error.message}`);
      return false;
    }
    refresh();
    return true;
  }

  async function duplicateProduct(p: ProductRow) {
    const { error } = await supabase.from("products").insert({
      provider_id: providerId,
      category_id: p.category_id,
      name: `${p.name} (نسخة)`,
      description: p.description,
      price: p.price,
      stock: p.stock,
      image_url: p.image_url,
      is_available: p.is_available,
      sort_order: products.length + 1,
    });
    if (error) {
      toast.error(`تعذر نسخ المنتج: ${error.message}`);
      return;
    }
    toast.success("تم نسخ المنتج");
    refresh();
  }

  async function removeProduct(id: string) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast.error(`تعذر حذف المنتج: ${error.message}`);
      return;
    }
    toast.success("تم حذف المنتج");
    refresh();
  }

  return (
    <div className="space-y-4">
      {/* إضافة سريعة: كل الحقول بخطوة واحدة */}
      <section className="rounded-2xl bg-card p-4 shadow-soft">
        <h3 className="mb-3 text-sm font-black">إضافة منتج بسرعة</h3>
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
              placeholder="سعر البيع بالدينار"
              inputMode="numeric"
              className="h-11 flex-1"
            />
            {isStore && (
              <Input
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="المخزون"
                inputMode="numeric"
                className="h-11 w-28"
                aria-label="المخزون"
              />
            )}
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <ProductImage src={newImage?.preview} alt="صورة المنتج الجديد" className="size-12" />
            <p className="min-w-0 flex-1 text-xs font-semibold">
              صورة اختيارية
              <span className="block text-[11px] font-normal text-muted-foreground">
                JPG أو PNG، حد 5 ميغابايت
              </span>
            </p>
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
              {newImage ? "تغيير" : "رفع"}
            </Button>
          </div>
          <Button className="h-12 w-full text-base font-black" onClick={addProduct}>
            <Plus className="size-5" /> إضافة المنتج
          </Button>
        </div>
      </section>

      {/* بحث */}
      <section className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ابحث عن منتج"
            className="h-11 pe-10"
            aria-label="بحث في المنتجات"
          />
        </div>
      </section>

      {/* قائمة المنتجات */}
      <section className="space-y-2">
        {visible.map((p) => (
          <div key={p.id} className="rounded-2xl bg-card p-3 shadow-soft">
            <div className="flex items-center gap-3">
              <ProductImage src={p.image_url} alt={p.name} className="size-14" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.name}</p>
                <p className="text-sm font-bold text-primary">{formatIQD(Number(p.price))}</p>
                {isStore && p.stock != null ? (
                  <p className="truncate text-[11px] text-muted-foreground">مخزون {p.stock}</p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Switch
                  checked={p.is_available}
                  onCheckedChange={(v) => void patchProduct(p.id, { is_available: v })}
                  aria-label="توفر المنتج"
                />
                <span className="text-[10px] text-muted-foreground">
                  {p.is_available ? "متوفر" : "موقوف"}
                </span>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-9 flex-1"
                onClick={() => setEditing(editing === p.id ? null : p.id)}
              >
                <Pencil className="size-4" /> {editing === p.id ? "إغلاق" : "تعديل"}
              </Button>
              <Button
                variant="outline"
                className="h-9"
                onClick={() => void duplicateProduct(p)}
                aria-label="نسخ المنتج"
              >
                <Copy className="size-4" /> نسخ
              </Button>
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
                  صورة
                </span>
              </label>
              <Button
                variant="outline"
                size="icon"
                className="size-9 text-destructive"
                onClick={() => void removeProduct(p.id)}
                aria-label="حذف المنتج"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            {editing === p.id && (
              <EditProduct
                product={p}
                isStore={isStore}
                onSave={async (patch) => {
                  const ok = await patchProduct(p.id, patch);
                  if (ok) {
                    toast.success("تم حفظ التعديلات");
                    setEditing(null);
                  }
                }}
              />
            )}
          </div>
        ))}
        {!visible.length && (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            {products.length ? "ماكو نتائج للبحث." : "ماكو منتجات بعد — أضف أول منتج من فوق."}
          </p>
        )}
      </section>
    </div>
  );
}

/** تعديل سريع داخل البطاقة نفسها بدل فتح صفحة أو نافذة جديدة. */
function EditProduct({
  product,
  isStore,
  onSave,
}: {
  product: ProductRow;
  isStore: boolean;
  onSave: (patch: {
    name?: string;
    description?: string | null;
    price?: number;
    stock?: number | null;
  }) => void;
}) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(Number(product.price)));
  const [stock, setStock] = useState(product.stock == null ? "" : String(product.stock));

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="اسم المنتج"
        className="h-10"
        aria-label="اسم المنتج"
      />
      <div className="flex gap-2">
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="numeric"
          className="h-10 flex-1"
          aria-label="سعر البيع"
        />
        {isStore && (
          <Input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            inputMode="numeric"
            placeholder="المخزون"
            className="h-10 w-28"
            aria-label="المخزون"
          />
        )}
      </div>
      <Button
        className="h-10 w-full"
        onClick={() => {
          const p = Number(price);
          if (!name.trim() || !Number.isFinite(p) || p <= 0) {
            toast.error("تأكد من الاسم والسعر");
            return;
          }
          onSave({
            name: name.trim(),
            price: p,
            stock: isStore
              ? stock.trim() === ""
                ? null
                : Math.max(0, Math.trunc(Number(stock)))
              : product.stock,
          });
        }}
      >
        حفظ التعديلات
      </Button>
    </div>
  );
}
