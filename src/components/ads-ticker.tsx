import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { Settings2 } from "lucide-react";
import { adTone, formatAdPrice, type AdCategory, type AdRow } from "@/lib/ads";
import { AdImage } from "@/components/ad-image";
import { AdDetailsDialog } from "@/components/ad-details-dialog";
import { useAdPreferences } from "@/lib/ad-preferences";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function categoryIcon(name: string): Icons.LucideIcon {
  return (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Megaphone;
}

/**
 * شريط إعلانات أفقي مضغوط: إعلان وراء إعلان في سطر واحد بارتفاع صغير.
 * الحركة من اليمين إلى اليسار وتتوقف عند اللمس أو مرور المؤشر.
 */
export function AdsTicker({
  ads,
  categories,
  onSelect,
  className,
}: {
  ads: AdRow[];
  categories: AdCategory[];
  onSelect?: (ad: AdRow) => void;
  className?: string;
}) {
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
  }, []);
  const hold = useCallback(() => {
    clearTimer();
    setPaused(true);
  }, [clearTimer]);
  const release = useCallback(
    (delayMs: number) => {
      clearTimer();
      resumeTimer.current = setTimeout(() => setPaused(false), delayMs);
    },
    [clearTimer],
  );
  useEffect(() => clearTimer, [clearTimer]);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  if (ads.length === 0) return null;

  // سرعة ثابتة ومقروءة، ونكرر القائمة حتى لا تظهر فراغات في الشريط
  const duration = Math.max(20, ads.length * 6);
  const repeats = ads.length < 4 ? 6 : 2;
  const items = Array.from({ length: repeats }, () => ads).flat();

  return (
    <div
      className={cn("relative min-w-0 flex-1 overflow-hidden", className)}
      onMouseEnter={hold}
      onMouseLeave={() => release(0)}
      onFocusCapture={hold}
      onBlurCapture={() => release(0)}
      onPointerDown={hold}
      onPointerUp={() => release(4000)}
      onPointerCancel={() => release(1500)}
      onTouchStart={hold}
      onTouchEnd={() => release(4000)}
      onTouchCancel={() => release(1500)}
    >
      <div
        className="ad-ticker-track flex w-max items-center gap-1.5 py-1"
        style={{ animationDuration: `${duration}s`, animationPlayState: paused ? "paused" : "running" }}
      >
        {items.map((ad, index) => {
          const category = byId.get(ad.category_id);
          const Icon = categoryIcon(category?.icon ?? "Megaphone");
          return (
            <button
              key={`${ad.id}-${index}`}
              type="button"
              onClick={() => onSelect?.(ad)}
              className={cn(
                "ad-ticker-item flex h-7 items-center gap-1.5 rounded-full px-2",
                `ad-tone-${adTone(category?.color)}`,
              )}
              aria-hidden={index >= ads.length}
              tabIndex={index >= ads.length ? -1 : 0}
            >
              {ad.images[0] ? (
                <AdImage path={ad.images[0]} alt="" className="size-5 shrink-0 rounded-full object-cover" />
              ) : (
                <Icon className="size-3.5 shrink-0 opacity-90" />
              )}
              <span className="whitespace-nowrap text-[11px] font-bold">{ad.title}</span>
              <span className="ad-ticker-price whitespace-nowrap rounded-full px-1.5 text-[10px] font-bold">
                {formatAdPrice(ad.price, ad.currency)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** إعدادات الإعلانات: أي فئات يريد المستخدم رؤيتها. */
function AdsPrefsSheet({ categories }: { categories: AdCategory[] }) {
  const { prefs, isVisible, toggle, showAll } = useAdPreferences();
  const allIds = categories.map((c) => c.id);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="إعدادات الإعلانات"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-95"
        >
          <Settings2 className="size-3.5" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-start">
          <SheetTitle>إعلانات تهمّك</SheetTitle>
          <SheetDescription>اختر الفئات التي تحب ظهورها في شريط الإعلانات.</SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-2 pb-6">
          <label className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
            <Switch checked={prefs === null} onCheckedChange={() => showAll()} aria-label="كل الإعلانات" />
            <span className="text-sm font-bold">كل الإعلانات</span>
          </label>

          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            return (
              <label key={c.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
                <Switch
                  checked={isVisible(c.id)}
                  onCheckedChange={() => toggle(c.id, allIds)}
                  aria-label={c.name}
                />
                <Icon className="size-4 text-muted-foreground" />
                <span className="text-sm font-bold">{c.name}</span>
              </label>
            );
          })}

          {categories.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">ما توجد فئات إعلانات حالياً.</p>
          ) : null}

          <Button variant="outline" className="w-full" onClick={() => showAll()}>
            إعادة الافتراضي (كل الإعلانات)
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * لوحة الإعلانات المضغوطة: شريط واحد بارتفاع ثابت + زر إعدادات الفئات.
 * الارتفاع ثابت دائماً فلا يحدث layout shift عند تحميل الإعلانات.
 */
export function AdsTickerBoard({
  categories,
  ads,
  className,
}: {
  categories: AdCategory[];
  ads: AdRow[];
  className?: string;
}) {
  const { isVisible } = useAdPreferences();
  const visibleAds = ads.filter((ad) => isVisible(ad.category_id));

  return (
    <section
      className={cn("flex h-10 items-center gap-2 overflow-hidden rounded-xl bg-card px-2 shadow-soft", className)}
      aria-label="شريط الإعلانات"
    >
      {visibleAds.length > 0 ? (
        <AdsTicker ads={visibleAds} categories={categories} />
      ) : (
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          ما توجد إعلانات للفئات المختارة.
        </p>
      )}
      <AdsPrefsSheet categories={categories} />
    </section>
  );
}
