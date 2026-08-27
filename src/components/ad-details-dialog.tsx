import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, MapPin, Phone } from "lucide-react";
import * as Icons from "lucide-react";
import { adTone, formatAdPrice, type AdCategory, type AdRow } from "@/lib/ads";
import { AdImage } from "@/components/ad-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function categoryIcon(name: string): Icons.LucideIcon {
  return (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Megaphone;
}

/**
 * نافذة تفاصيل الإعلان: تفتح عند النقر على أي إعلان (شريط أو قائمة)
 * وتعرض النص والصور مع زر لفتح الصفحة الكاملة وزر اتصال مباشر.
 */
export function AdDetailsDialog({
  ad,
  categories,
  open,
  onOpenChange,
}: {
  ad: AdRow | null;
  categories: AdCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [ad?.id]);

  const category = ad ? categories.find((c) => c.id === ad.category_id) : undefined;
  const Icon = categoryIcon(category?.icon ?? "Megaphone");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl p-0">
        {ad ? (
          <div className="space-y-3 p-4">
            <DialogHeader className="text-start">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                    `ad-tone-${adTone(category?.color)}`,
                  )}
                >
                  <Icon className="size-3.5" />
                  {category?.name ?? "إعلان"}
                </span>
                <span className="ms-auto text-sm font-black text-primary">
                  {formatAdPrice(ad.price, ad.currency)}
                </span>
              </div>
              <DialogTitle className="text-start text-lg font-black">{ad.title}</DialogTitle>
              <DialogDescription className="sr-only">تفاصيل الإعلان</DialogDescription>
            </DialogHeader>

            {ad.images.length > 0 ? (
              <div className="space-y-2">
                <AdImage
                  path={ad.images[active] ?? ad.images[0]}
                  alt={ad.title}
                  lazy={false}
                  className="aspect-[4/3] w-full rounded-2xl object-cover"
                />
                {ad.images.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto">
                    {ad.images.map((path, index) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setActive(index)}
                        aria-label={`صورة ${index + 1}`}
                        className={cn(
                          "size-14 shrink-0 overflow-hidden rounded-xl border-2",
                          index === active ? "border-primary" : "border-transparent",
                        )}
                      >
                        <AdImage path={path} className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="whitespace-pre-line text-sm leading-6 text-foreground/90">{ad.body}</p>

            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              {ad.governorate ? <span className="font-bold text-foreground">{ad.governorate}</span> : null}
              <span className="truncate">{ad.address_text}</span>
            </p>

            <div className="flex gap-2 pt-1">
              <Button asChild className="h-11 flex-1 font-bold">
                <a href={`tel:${ad.contact_phone}`}>
                  <Phone className="size-4" /> اتصال
                </a>
              </Button>
              <Button asChild variant="outline" className="h-11 flex-1 font-bold">
                <Link to="/ads/$id" params={{ id: ad.id }}>
                  <ExternalLink className="size-4" /> الصفحة الكاملة
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
