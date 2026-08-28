import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  images: string[];
  contactPhone: string;
  status: string;
  sellerId: string;
  createdAt: string;
};

export const LISTING_STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار المراجعة",
  published: "منشور",
  rejected: "مرفوض",
  sold: "تم البيع",
  archived: "مؤرشف",
};

function mapListing(row: {
  id: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  images: string[] | null;
  contact_phone: string;
  status: string;
  seller_id: string;
  created_at: string;
}): Listing {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price == null ? null : Number(row.price),
    currency: row.currency,
    images: row.images ?? [],
    contactPhone: row.contact_phone,
    status: row.status,
    sellerId: row.seller_id,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, title, description, price, currency, images, contact_phone, status, seller_id, created_at";

/** إعلانات السوق المنشورة (قراءة عامة). */
export const listPublishedListings = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await client
    .from("marketplace_listings")
    .select(SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []).map(mapListing);
});

/** إعلانات المستخدم الحالي بكل حالاتها. */
export const listMyListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("marketplace_listings")
      .select(SELECT)
      .eq("seller_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []).map(mapListing);
  });

/** نشر إعلان جديد في سوق لبابك (يمر بمراجعة الإدارة). */
export const createListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      description: string;
      price?: number | null;
      currency?: string;
      contactPhone: string;
      images?: string[];
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const title = (data.title ?? "").trim();
    const description = (data.description ?? "").trim();
    const phone = (data.contactPhone ?? "").trim();
    if (title.length < 3) throw new Error("اكتب عنوان الإعلان");
    if (description.length < 10) throw new Error("اكتب وصفاً أوضح للإعلان");
    if (phone.length < 8) throw new Error("اكتب رقم تواصل صحيح");

    const { data: row, error } = await context.supabase
      .from("marketplace_listings")
      .insert({
        seller_id: context.userId,
        title: title.slice(0, 160),
        description: description.slice(0, 2000),
        price: data.price != null && data.price > 0 ? data.price : null,
        currency: data.currency === "USD" ? "USD" : "IQD",
        contact_phone: phone.slice(0, 30),
        images: (data.images ?? []).slice(0, 4),
      })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("تعذر نشر الإعلان");
    return { id: row.id };
  });

/** تحديث حالة الإعلان من صاحبه (تم البيع / أرشفة). */
export const updateMyListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "sold" | "archived" | "pending" }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("marketplace_listings")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("seller_id", context.userId);
    if (error) throw new Error("تعذر تحديث الإعلان");
    return { ok: true };
  });

/** مراجعة الإدارة لإعلانات السوق. */
export const reviewListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { id: string; status: "published" | "rejected"; reason?: string | null }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("غير مصرح");
    const { error } = await context.supabase
      .from("marketplace_listings")
      .update({
        status: data.status,
        rejection_reason: data.reason?.trim() ? data.reason.trim().slice(0, 300) : null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error("تعذر تحديث الإعلان");
    return { ok: true };
  });

/** قائمة الإدارة: كل الإعلانات لمراجعتها. */
export const listAllListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("غير مصرح");
    const { data } = await context.supabase
      .from("marketplace_listings")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []).map(mapListing);
  });
