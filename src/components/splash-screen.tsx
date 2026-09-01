import { useEffect, useState } from "react";
import logoUrl from "@/assets/lubabak-logo.png";
import { cn } from "@/lib/utils";

const SPLASH_MS = 1400;
const FADE_MS = 400;

/**
 * شاشة تحميل افتتاحية تظهر مرة واحدة عند تشغيل التطبيق،
 * تعرض شعار لبابك الرسمي على خلفية الهوية الكحلية ثم تتلاشى.
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), SPLASH_MS);
    const removeTimer = setTimeout(() => setVisible(false), SPLASH_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "brand-gradient fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity",
        fading && "pointer-events-none opacity-0",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <img
        src={logoUrl}
        alt="شعار لبابك"
        className="h-28 w-28 animate-pulse rounded-3xl object-contain shadow-soft"
      />
      <p className="mt-4 text-xl font-black text-primary-foreground">لبابك</p>
      <p className="mt-1 text-xs text-primary-foreground/80">خدماتك وطلباتك لبابك</p>
    </div>
  );
}
