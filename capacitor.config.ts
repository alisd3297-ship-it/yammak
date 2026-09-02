import type { CapacitorConfig } from "@capacitor/cli";

/**
 * إعداد إصدار الموبايل (Capacitor) لتطبيق «لبابك» — نمط Hosted Wrapper.
 *
 * التطبيق يحمّل نسخة الإنتاج المنشورة (SSR + server functions) مباشرة،
 * لذلك لا حاجة لإعادة هيكلة الباك-إند أو تصدير موقع ثابت.
 * webDir موجود فقط لأن Capacitor يتطلبه (نسخة احتياطية من dist/client).
 *
 * ملاحظة مهمة: appId ثابت بعد أول رفع للمتاجر ولا يجوز تغييره لاحقاً.
 * النطاق المعتمد للإنتاج: lubabak.lovable.app
 */
const PRODUCTION_HOST = "lubabak.lovable.app";

const config: CapacitorConfig = {
  appId: "iq.lababak.app",
  appName: "لبابك",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    // اسم مستعرض المستخدم يساعد على تمييز طلبات التطبيق في السجلات
    appendUserAgent: "LubabakApp/Android",
    backgroundColor: "#111111",
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
    appendUserAgent: "LubabakApp/iOS",
    backgroundColor: "#111111",
  },
  server: {
    // Hosted Wrapper: يفتح التطبيق نسخة الإنتاج المنشورة.
    url: `https://${PRODUCTION_HOST}`,
    androidScheme: "https",
    iosScheme: "https",
    hostname: PRODUCTION_HOST,
    cleartext: false,
    allowNavigation: [PRODUCTION_HOST, "*.lovable.app", "*.supabase.co", "*.stripe.com"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#111111",
      androidScaleType: "CENTER_CROP",
      androidSplashResourceName: "splash",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#111111",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Geolocation: {},
  },
};

export default config;
