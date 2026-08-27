import { useEffect, useRef } from "react";
import { registerPushDevice } from "@/lib/push.functions";
import { playAlertSound, fireAlert } from "@/lib/notify-alerts";

/**
 * تكامل إشعارات الهاتف الأصلية (Capacitor Push Notifications).
 * - يعمل فقط داخل غلاف الموبايل؛ على الويب لا يفعل شيئاً (الويب يعتمد التنبيه اللحظي داخل التطبيق).
 * - يسجّل رمز الجهاز ويربطه بالمستخدم الحالي.
 * - عند وصول إشعار والتطبيق مفتوح: نغمة + اهتزاز + toast.
 * - عند الضغط على الإشعار: فتح صفحة الطلب.
 *
 * ملاحظة: التسليم الفعلي للإشعار يتطلب إعداد FCM (Android) و APNs (iOS) خارجياً.
 */

let registered = false;

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
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

export function useNativePush(
  userId: string | null | undefined,
  opts?: { deepLink?: (orderId: string | null) => string | null },
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!userId || !isNativeApp() || registered) return;
    let cancelled = false;

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const perm = await PushNotifications.checkPermissions();
        let status = perm.receive;
        if (status === "prompt" || status === "prompt-with-rationale") {
          status = (await PushNotifications.requestPermissions()).receive;
        }
        if (status !== "granted" || cancelled) return;

        // قناة مخصصة للطلبات: صوت واهتزاز بأولوية عالية على أندرويد
        try {
          await PushNotifications.createChannel({
            id: "lubabak_orders",
            name: "طلبات لبابك",
            description: "تنبيه فوري عند وصول طلب جديد",
            importance: 5,
            visibility: 1,
            sound: "default",
            vibration: true,
          });
        } catch {
          // القنوات مدعومة على أندرويد فقط
        }

        await PushNotifications.addListener("registration", (t) => {
          const platform =
            (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ??
            "android";
          void registerPushDevice({ data: { token: t.value, platform } });
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.error("[push] registration error", err);
        });

        // التطبيق مفتوح: أندرويد لا يعرض الإشعار تلقائياً، فننبّه داخل التطبيق
        await PushNotifications.addListener("pushNotificationReceived", (n) => {
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

        // الضغط على الإشعار: فتح الطلب
        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const orderId = (action.notification.data?.["orderId"] as string | undefined) || null;
          const url = optsRef.current?.deepLink?.(orderId) ?? (orderId ? `/orders/${orderId}` : null);
          if (url) window.location.assign(url);
        });

        await PushNotifications.register();
        registered = true;
      } catch (err) {
        console.error("[push] init failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
