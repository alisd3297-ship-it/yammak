import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { adImageUrl } from "@/lib/ads";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * صورة إعلان مع بديل أنيق عند تعذّر التحميل.
 * صور الإعلانات غير المنشورة محمية على الخادم، لذلك عند فشل التحميل العام
 * نعيد المحاولة بجلسة المستخدم (صاحب الإعلان أو الإدارة) قبل عرض البديل.
 */
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
  const [authedUrl, setAuthedUrl] = useState<string | null>(null);
  const triedAuth = useRef(false);

  useEffect(() => {
    setFailed(false);
    setAuthedUrl(null);
    triedAuth.current = false;
  }, [path]);

  useEffect(() => {
    return () => {
      if (authedUrl) URL.revokeObjectURL(authedUrl);
    };
  }, [authedUrl]);

  async function retryWithSession() {
    if (!path || triedAuth.current) {
      setFailed(true);
      return;
    }
    triedAuth.current = true;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setFailed(true);
        return;
      }
      const res = await fetch(adImageUrl(path), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setAuthedUrl(URL.createObjectURL(await res.blob()));
    } catch {
      setFailed(true);
    }
  }

  if (!path || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)} aria-hidden>
        <ImageOff className="size-1/3 max-h-8 min-h-4" />
      </div>
    );
  }

  return (
    <img
      src={authedUrl ?? adImageUrl(path)}
      alt={alt}
      loading={lazy ? "lazy" : undefined}
      className={className}
      onError={() => void retryWithSession()}
    />
  );
}
