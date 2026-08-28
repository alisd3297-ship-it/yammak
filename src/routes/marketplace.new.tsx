import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireSignedIn } from "@/lib/route-guards";
import { formatIQD } from "@/lib/orders";
import {
  createListing,
  listMyListings,
  updateMyListing,
  LISTING_STATUS_LABELS,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/marketplace/new")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "أضف إعلان | سوق لبابك" },
      {
        name: "description",
        content:
          "انشر إعلان بيع في سوق لبابك: العنوان والوصف والسعر ورقم التواصل، بعد مراجعة سريعة.",
      },
      { property: "og:title", content: "أضف إعلان | سوق لبابك" },
      { property: "og:description", content: "بيع أغراضك لأهل منطقتك بخطوات بسيطة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewListingPage,
});

function NewListingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createFn = useServerFn(createListing);
  const mineFn = useServerFn(listMyListings);
  const updateFn = useServerFn(updateMyListing);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: mine } = useQuery({ queryKey: ["my-listings"], queryFn: () => mineFn() });

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await createFn({
        data: { title, description, price: price ? Number(price) : null, contactPhone: phone },
      });
      toast.success("انرسل الإعلان للمراجعة");
      setTitle("");
      setDescription("");
      setPrice("");
      await qc.invalidateQueries({ queryKey: ["my-listings"] });
      void navigate({ to: "/marketplace" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر النشر");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/marketplace" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Plus className="size-6" /> أضف إعلان
        </h1>
        <p className="mt-1 text-sm opacity-90">إعلانك ينشر بعد مراجعة سريعة من فريق لبابك</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-11"
            placeholder="عنوان الإعلان"
            aria-label="عنوان الإعلان"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="وصف الغرض وحالته"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-11"
              type="number"
              min={0}
              placeholder="السعر بالدينار"
              aria-label="السعر"
            />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11"
              inputMode="tel"
              placeholder="رقم التواصل"
              aria-label="رقم التواصل"
            />
          </div>
          <Button className="h-12 w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? "جاري النشر…" : "نشر الإعلان"}
          </Button>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold">إعلاناتي</h2>
          {(mine ?? []).map((l) => (
            <div key={l.id} className="rounded-2xl bg-card p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold">{l.title}</p>
                <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold">
                  {LISTING_STATUS_LABELS[l.status] ?? l.status}
                </span>
              </div>
              {l.price != null && (
                <p className="mt-1 text-xs text-muted-foreground">{formatIQD(l.price)}</p>
              )}
              {l.status === "published" && (
                <Button
                  variant="outline"
                  className="mt-2 h-9 px-3 text-xs"
                  onClick={async () => {
                    await updateFn({ data: { id: l.id, status: "sold" } });
                    await qc.invalidateQueries({ queryKey: ["my-listings"] });
                  }}
                >
                  تم البيع
                </Button>
              )}
            </div>
          ))}
          {!mine?.length && (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              ما عندك إعلانات بعد.
            </p>
          )}
        </section>
      </div>

      <BottomNav />
    </PageShell>
  );
}
