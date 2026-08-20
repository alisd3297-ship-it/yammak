import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { adImageUrl, adTone, formatAdPrice, type AdCategory, type AdRow } from "@/lib/ads";
import { cn } from "@/lib/utils";

/**
 * شريط إعلانات أفقي لكل فئة على حدة.
 * الحركة من اليمين إلى اليسار، بطيئة وقابلة للقراءة، وتتوقف عند اللمس أو مرور المؤشر.
 */
export function AdsTicker({ category, ads }: { category: AdCategory; ads: AdRow[] }) {
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

  if (ads.length === 0) return null;


  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[category.icon] ?? Icons.Megaphone;
  // سرعة ثابتة ومقروءة: نحو 10 ثوانٍ لكل إعلان مع حد أدنى 24 ثانية للدورة الكاملة
  const duration = Math.max(24, ads.length * 10);
  // نكرر القائمة أكثر عند قلة الإعلانات حتى لا تظهر فراغات في الشريط
  const repeats = ads.length < 3 ? 6 : 2;
  const items = Array.from({ length: repeats }, () => ads).flat();

  return (
    <section
      className={cn("ad-ticker overflow-hidden rounded-2xl shadow-card", `ad-tone-${adTone(category.color)}`)}
      aria-label={`إعلانات ${category.name}`}
    >
      <div className="flex items-stretch">
        <div className="ad-ticker-label flex shrink-0 items-center gap-1.5 px-3 py-2">
          <Icon className="size-4" />
          <span className="text-xs font-black">{category.name}</span>
        </div>

        <div
          className="relative min-w-0 flex-1 overflow-hidden"
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
            className="ad-ticker-track flex w-max items-center gap-2 py-2"
            style={{ animationDuration: `${duration}s`, animationPlayState: paused ? "paused" : "running" }}
          >
            {items.map((ad, index) => (
              <Link
                key={`${ad.id}-${index}`}
                to="/ads/$id"
                params={{ id: ad.id }}
                className="ad-ticker-item flex items-center gap-2 rounded-xl px-3 py-1.5"
                aria-hidden={index >= ads.length}
                tabIndex={index >= ads.length ? -1 : 0}
              >
                {ad.images[0] ? (
                  <img
                    src={adImageUrl(ad.images[0])}
                    alt={ad.title}
                    loading="lazy"
                    className="size-8 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <span className="whitespace-nowrap text-sm font-bold">{ad.title}</span>
                <span className="ad-ticker-price whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-bold">
                  {formatAdPrice(ad.price)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** كل الأشرطة مجمّعة حسب الفئة — لا تختلط إعلانات فئة بأخرى. */
export function AdsTickerBoard({
  categories,
  ads,
  className,
}: {
  categories: AdCategory[];
  ads: AdRow[];
  className?: string;
}) {
  const visible = categories
    .map((category) => ({ category, list: ads.filter((ad) => ad.category_id === category.id) }))
    .filter((group) => group.list.length > 0);

  if (visible.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {visible.map(({ category, list }) => (
        <AdsTicker key={category.id} category={category} ads={list} />
      ))}
    </div>
  );
}
