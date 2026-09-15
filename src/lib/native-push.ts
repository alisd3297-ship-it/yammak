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

/**
 * معرّفات القنوات: لاحقة v2 مقصودة — أندرويد يحتفظ بإعدادات أي قناة أُنشئت سابقاً
 * (حتى لو كانت صامتة)، فلا ينفع تعديلها؛ الحل قناة بمعرّف جديد بصوت وأهمية قصوى.
 */
export const ORDER_CHANNEL_ID = "lubabak_orders_v2";
export const TAXI_CHANNEL_ID = "lubabak_taxi_v2";
export const DEFAULT_CHANNEL_ID = "lubabak_default_v2";
/** قنوات قديمة قد تكون صامتة على أجهزة المستخدمين: نحذفها بعد إنشاء البدائل. */
const LEGACY_CHANNEL_IDS = ["lubabak_orders", "lubabak_default"];

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

function platformName(): string {
  const p =
    (
      window as unknown as { Capacitor?: { getPlatform?: () => string } }
    ).Capacitor?.getPlatform?.() ?? "android";
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
  PushNotifications: (typeof import("@capacitor/push-notifications"))["PushNotifications"],
) {
  // مهم: لا نمرر sound نهائياً. Capacitor يحوّل قيمة sound إلى ملف داخل res/raw،
  // وإذا لم يوجد الملف تُنشأ القناة بصوت غير صالح = إشعار صامت.
  // بترك sound فارغاً يستخدم أندرويد نغمة الإشعار الافتراضية للنظام.
  const channels = [
    {
      id: ORDER_CHANNEL_ID,
      name: "طلبات لبابك",
      description: "تنبيه فوري عند وصول طلب جديد",
      importance: 5 as const,
      visibility: 1 as const,
      vibration: true,
      lights: true,
    },
    {
      id: TAXI_CHANNEL_ID,
      name: "رحلات التكسي",
      description: "تنبيه صوتي فوري عند وصول عرض رحلة تكسي",
      importance: 5 as const,
      visibility: 1 as const,
      vibration: true,
      lights: true,
    },
    {
      id: DEFAULT_CHANNEL_ID,
      name: "إشعارات لبابك",
      description: "إشعارات عامة",
      importance: 4 as const,
      visibility: 1 as const,
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
  // تحقق فعلي أن القنوات أُنشئت بأهمية عالية (وليس قناة قديمة صامتة)
  try {
    const { channels: existing } = await PushNotifications.listChannels();
    const orders = existing.find((c) => c.id === ORDER_CHANNEL_ID);
    const taxi = existing.find((c) => c.id === TAXI_CHANNEL_ID);
    for (const [label, ch] of [
      ["orders", orders],
      ["taxi", taxi],
    ] as const) {
      if (!ch) console.error(`[push] channel missing: ${label}`);
      else if ((ch.importance ?? 0) < 4 || ch.vibration === false)
        console.error(`[push] channel ${label} is quiet`, ch.importance, ch.vibration);
    }
  } catch {
    // listChannels متاح على أندرويد فقط
  }

  for (const id of LEGACY_CHANNEL_IDS) {
    try {
      await PushNotifications.deleteChannel({ id });
    } catch {
      // القناة القديمة غير موجودة أو المنصة ليست أندرويد
    }
  }
}

export type PushPermissionState = "granted" | "denied" | "prompt" | "unsupported";

/** حالة إذن الإشعارات على الجهاز (داخل الغلاف الأصلي فقط). */
export async function getPushPermission(): Promise<PushPermissionState> {
  if (!isNativeApp()) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

/**
 * طلب إذن الإشعارات ثم إنشاء القنوات والتسجيل لدى FCM.
 * يُستدعى من زر يضغطه المندوب (أندرويد 13+ يتطلب طلباً صريحاً).
 */
export async function enablePushNotifications(): Promise<PushPermissionState> {
  if (!isNativeApp()) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let status = (await PushNotifications.checkPermissions()).receive;
    if (status === "prompt" || status === "prompt-with-rationale") {
      status = (await PushNotifications.requestPermissions()).receive;
    }
    if (status !== "granted") return status === "denied" ? "denied" : "prompt";
    await ensureChannels(PushNotifications);
    await PushNotifications.register();
    return "granted";
  } catch {
    return "unsupported";
  }
}

/** فتح شاشة إعدادات إشعارات التطبيق في النظام (بعد رفض الإذن). */
export async function openNotificationSettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const mod = await import("capacitor-native-settings");
    if (
      (
        window as unknown as { Capacitor?: { getPlatform?: () => string } }
      ).Capacitor?.getPlatform?.() === "ios"
    ) {
      await mod.NativeSettings.openIOS({ option: mod.IOSSettings.App });
    } else {
      await mod.NativeSettings.openAndroid({ option: mod.AndroidSettings.AppNotification });
    }
    return true;
  } catch {
    return false;
  }
}

/** آخر رمز جهاز وصل خلال هذا التشغيل (يبقى بعد تبديل الحساب لإعادة الربط). */
let lastToken: string | null = null;

export function useNativePush(
  userId: string | null | undefined,
  opts?: { deepLink?: (orderId: string | null, kind: string) => string | null },
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /**
   * (1) المستمعون يُسجَّلون فور إقلاع التطبيق ودون انتظار جلسة المستخدم.
   * سبب مهم: عند فتح التطبيق من إشعار والتطبيق مغلق تماماً، يطلق Capacitor حدث
   * pushNotificationActionPerformed مبكراً جداً؛ لو انتظرنا تحميل الحساب يضيع الحدث
   * ويفتح التطبيق على الصفحة الرئيسية بدل الطلب.
   */
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    const removers: Array<() => void> = [];

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // التطبيق مفتوح: أندرويد لا يعرض الإشعار تلقائياً، فننبّه داخل التطبيق
        const recvHandle = await PushNotifications.addListener("pushNotificationReceived", (n) => {
          const orderId = (n.data?.["orderId"] as string | undefined) || null;
          const dataKind = (n.data?.["kind"] as string | undefined) || "";
          const urgent =
            (n.data?.["urgent"] as string | undefined) === "1" ||
            Boolean(orderId) ||
            dataKind.startsWith("trip");
          fireAlert({
            title: n.title ?? "إشعار جديد",
            body: n.body ?? "",
            tag: orderId,
            kind: urgent ? "order" : "default",
            url:
              optsRef.current?.deepLink?.(orderId, dataKind) ??
              (dataKind.startsWith("trip") ? "/driver" : null),
          });
          playAlertSound(urgent ? "order" : "default");
          void vibrateOrder();
        });
        removers.push(() => void recvHandle.remove());

        // الضغط على الإشعار (الخلفية/بعد الإغلاق): فتح الشاشة الصحيحة
        const tapHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const data = action.notification.data as Record<string, string> | undefined;
            const orderId = data?.["orderId"] || null;
            const kind = data?.["kind"] || "";
            const url =
              optsRef.current?.deepLink?.(orderId, kind) ?? (orderId ? `/orders/${orderId}` : null);
            console.info("[push] notification tapped", { kind, hasOrder: Boolean(orderId), url });
            if (url) window.location.assign(url);
          },
        );
        removers.push(() => void tapHandle.remove());

        // القنوات تُنشأ مبكراً: إن وصل إشعار قبل فتح لوحة المندوب يجب أن تكون القناة موجودة
        if (!cancelled) await ensureChannels(PushNotifications);
      } catch (err) {
        console.error("[push] listeners init failed", err);
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
  }, []);

  /** (2) ربط رمز الجهاز بالحساب الحالي بعد توفر الجلسة. */
  useEffect(() => {
    if (!userId || !isNativeApp()) return;
    let cancelled = false;
    const removers: Array<() => void> = [];

    const saveToken = (token: string) => {
      lastToken = token;
      void registerPushDevice({ data: { token, platform: platformName() } })
        .then((res) => {
          if (res && res.ok === false) console.error("[push] token save failed", res.reason);
          else console.info("[push] device token registered", token.slice(0, 8) + "…");
        })
        .catch((err) => console.error("[push] token save error", err));
    };

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        const regHandle = await PushNotifications.addListener("registration", (t) => {
          if (cancelled) return;
          saveToken(t.value);
        });
        removers.push(() => void regHandle.remove());

        const errHandle = await PushNotifications.addListener("registrationError", (err) => {
          console.error("[push] registration error", err);
        });
        removers.push(() => void errHandle.remove());

        const perm = await PushNotifications.checkPermissions();
        let status = perm.receive;
        if (status === "prompt" || status === "prompt-with-rationale") {
          status = (await PushNotifications.requestPermissions()).receive;
        }
        if (status !== "granted" || cancelled) {
          console.warn("[push] notifications permission not granted", status);
          return;
        }

        await ensureChannels(PushNotifications);
        await PushNotifications.register();

        // رمز محفوظ من جلسة سابقة داخل نفس التشغيل: أعد ربطه بالحساب الحالي
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
