import { useEffect, useRef } from "react";
import { registerPushDevice } from "@/lib/push.functions";
import { playAlertSound, fireAlert } from "@/lib/notify-alerts";

/**
 * تكامل إشعارات الهاتف الأصلية (Capacitor Push Notifications).
 * - يعمل فقط داخل غلاف الموبايل؛ على الويب لا يفعل شيئاً (الويب يعتمد التنبيه اللحظي داخل التطبيق).
 * - يسجّل رمز الجهاز ويربطه بالمستخدم الحالي (لكل جلسة/مستخدم على حدة).
 * - عند وصول إشعار والتطبيق مفتوح: نغمة + اهتزاز + toast.
 * - عند الضغط على الإشعار (بالخلفية أو بعد الإغلاق): فتح صفحة الطلب.
 *
 * ملاحظة: التسليم الفعلي للإشعار يتطلب إعداد FCM (Android) و APNs (iOS) خارجياً.
 */

export const ORDER_CHANNEL_ID = "lubabak_orders";
export const DEFAULT_CHANNEL_ID = "lubabak_default";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

function platformName(): string {
  const p =
    (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ??
    "android";
  return ["android", "ios", "web"].includes(p) ? p : "android";
}

async function vibrateOrder() {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Heavy });
    await Haptics.vibrate({ duration: 400 });
  } catch {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200, 100, 300]);
    }
  }
}

/** إنشاء قنوات أندرويد قبل أي إرسال (الـ payload يشير إلى نفس المعرفات). */
async function ensureChannels(
  PushNotifications: typeof import("@capacitor/push-notifications")["PushNotifications"],
) {
  const channels = [
    {
      id: ORDER_CHANNEL_ID,
      name: "طلبات لبابك",
      description: "تنبيه فوري عند وصول طلب جديد",
      importance: 5 as const,
      visibility: 1 as const,
      sound: "default",
      vibration: true,
    },
    {
      id: DEFAULT_CHANNEL_ID,
      name: "إشعارات لبابك",
      description: "إشعارات عامة",
      importance: 4 as const,
      visibility: 1 as const,
      sound: "default",
      vibration: true,
    },
  ];
  for (const ch of channels) {
    try {
      await PushNotifications.createChannel(ch);
    } catch {
      // القنوات مدعومة على أندرويد فقط
    }
  }
}

export function useNativePush(
  userId: string | null | undefined,
  opts?: { deepLink?: (orderId: string | null) => string | null },
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!userId || !isNativeApp()) return;
    let cancelled = false;
    const removers: Array<() => void> = [];
    // الرمز قد يصل قبل أو بعد register؛ نحتفظ به لإعادة الربط بالمستخدم الحالي
    let lastToken: string | null = null;

    const saveToken = (token: string) => {
      lastToken = token;
      void registerPushDevice({ data: { token, platform: platformName() } })
        .then((res) => {
          if (res && res.ok === false) console.error("[push] token save failed", res.reason);
        })
        .catch((err) => console.error("[push] token save error", err));
    };

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // 1) المستمعون أولاً — قبل register حتى لا يضيع حدث registration
        const regHandle = await PushNotifications.addListener("registration", (t) => {
          if (cancelled) return;
          saveToken(t.value);
        });
        removers.push(() => void regHandle.remove());

        const errHandle = await PushNotifications.addListener("registrationError", (err) => {
          console.error("[push] registration error", err);
        });
        removers.push(() => void errHandle.remove());

        // التطبيق مفتوح: أندرويد لا يعرض الإشعار تلقائياً، فننبّه داخل التطبيق
        const recvHandle = await PushNotifications.addListener("pushNotificationReceived", (n) => {
          const orderId = (n.data?.["orderId"] as string | undefined) || null;
          fireAlert({
            title: n.title ?? "إشعار جديد",
            body: n.body ?? "",
            tag: orderId,
            kind: orderId ? "order" : "default",
            url: optsRef.current?.deepLink?.(orderId) ?? null,
          });
          playAlertSound(orderId ? "order" : "default");
          void vibrateOrder();
        });
        removers.push(() => void recvHandle.remove());

        // الضغط على الإشعار (الخلفية/بعد الإغلاق): فتح الطلب
        const tapHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const orderId = (action.notification.data?.["orderId"] as string | undefined) || null;
            const url =
              optsRef.current?.deepLink?.(orderId) ?? (orderId ? `/orders/${orderId}` : null);
            if (url) window.location.assign(url);
          },
        );
        removers.push(() => void tapHandle.remove());

        // 2) الأذونات
        const perm = await PushNotifications.checkPermissions();
        let status = perm.receive;
        if (status === "prompt" || status === "prompt-with-rationale") {
          status = (await PushNotifications.requestPermissions()).receive;
        }
        if (status !== "granted" || cancelled) return;

        // 3) القنوات ثم التسجيل
        await ensureChannels(PushNotifications);
        await PushNotifications.register();

        // إن كان الرمز محفوظاً من جلسة سابقة داخل نفس التشغيل، أعد ربطه بالمستخدم الحالي
        if (lastToken && !cancelled) saveToken(lastToken);
      } catch (err) {
        console.error("[push] init failed", err);
      }
    })();

    return () => {
      cancelled = true;
      removers.forEach((remove) => {
        try {
          remove();
        } catch {
          // تجاهل
        }
      });
    };
  }, [userId]);
}
