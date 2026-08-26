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
  appId: "iq.lubabak.app",
  appName: "لبابك",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
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
      launchShowDuration: 1200,
      backgroundColor: "#c81e2b",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
