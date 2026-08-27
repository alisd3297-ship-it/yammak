import { supabase } from "@/integrations/supabase/client";

/**
 * تسجيل أخطاء التطبيق في قاعدة البيانات لعرضها في لوحة مراقبة الإدارة.
 * مصمّم ليكون صامتاً تماماً: أي فشل هنا لا يجب أن يؤثر على تجربة المستخدم.
 */

type LogKind = "error" | "unhandled_rejection" | "network" | "boundary";

const recent = new Map<string, number>();
const DEDUPE_MS = 60_000;
const MAX_PER_SESSION = 25;
let sent = 0;

function shouldSend(key: string) {
  if (sent >= MAX_PER_SESSION) return false;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return false;
  recent.set(key, now);
  if (recent.size > 100) recent.clear();
  return true;
}

export async function logAppError(
  error: unknown,
  options: { kind?: LogKind; details?: Record<string, unknown> } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  const err = error as { message?: string; stack?: string } | null;
  const message = String(err?.message ?? error ?? "خطأ غير معروف").slice(0, 500);
  if (!message || message === "undefined") return;

  const kind = options.kind ?? "error";
  if (!shouldSend(`${kind}:${message}`)) return;
  sent += 1;

  try {
    const { data } = await supabase.auth.getSession();
    await supabase.from("app_error_logs").insert({
      user_id: data.session?.user.id ?? null,
      source: "client",
      kind,
      message,
      path: window.location.pathname,
      user_agent: navigator.userAgent.slice(0, 300),
      details: {
        stack: typeof err?.stack === "string" ? err.stack.slice(0, 2000) : null,
        online: navigator.onLine,
        ...(options.details ?? {}),
      },
    });
  } catch {
    // لا نُظهر أي شيء للمستخدم
  }
}

/** تركيب مستمعات الأخطاء العامة مرة واحدة. يُرجع دالة إزالة. */
export function installGlobalErrorLogging(): () => void {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent) => {
    void logAppError(event.error ?? event.message, {
      kind: "error",
      details: { file: event.filename, line: event.lineno },
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    void logAppError(event.reason, { kind: "unhandled_rejection" });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
