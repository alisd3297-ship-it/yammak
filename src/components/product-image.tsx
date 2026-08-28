import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** صورة المنتج مع بديل أنيق عند عدم وجود صورة. */
export function ProductImage({
  src,
  alt,
  className,
}: {
  src?: string | null | undefined;
  alt: string;
  className?: string | undefined;
}) {
  if (!src)
    return (
      <div
        className={cn(
          "flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground",
          className,
        )}
        aria-hidden
      >
        <ImageIcon className="size-5" />
      </div>
    );

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn("size-16 shrink-0 rounded-xl object-cover", className)}
    />
  );
}
