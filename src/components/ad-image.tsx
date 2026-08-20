import { useState } from "react";
import { ImageOff } from "lucide-react";
import { adImageUrl } from "@/lib/ads";
import { cn } from "@/lib/utils";

/** صورة إعلان مع بديل أنيق عند تعذّر التحميل بدل أيقونة الصورة المكسورة. */
export function AdImage({
  path,
  alt = "",
  className,
  lazy = true,
}: {
  path: string | undefined;
  alt?: string;
  className?: string;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!path || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)} aria-hidden>
        <ImageOff className="size-1/3 max-h-8 min-h-4" />
      </div>
    );
  }

  return (
    <img
      src={adImageUrl(path)}
      alt={alt}
      loading={lazy ? "lazy" : undefined}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
