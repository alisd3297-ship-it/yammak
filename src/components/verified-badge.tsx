import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** شارة «موثّق» لمقدمي الخدمة الذين اجتازوا تدقيق لبابك. */
export function VerifiedBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  if (status !== "verified") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-success",
        className,
      )}
      title="مقدم خدمة موثّق من لبابك"
    >
      <BadgeCheck className="size-3.5" /> موثّق
    </span>
  );
}
