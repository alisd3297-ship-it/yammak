import type { CapacitorConfig } from "@capacitor/cli";

/**
 * إعداد إصدار الموبايل (Capacitor) لتطبيق «لبابك» — نمط Hosted Wrapper.
 *
 * التطبيق يحمّل نسخة الإنتاج المنشورة (SSR + server functions) مباشرة،
 * لذلك لا حاجة لإعادة هيكلة الباك-إند أو تصدير موقع ثابت.
 * webDir موجود فقط لأن Capacitor يتطلبه (نسخة احتياطية من dist/client).
 *
 * الخطوات الفعلية للبناء ورفع المتاجر تتم خارج Lovable:
 *   npm run build
 *   npx cap add android && npx cap add ios && npx cap sync
 * الأيقونة المصدر: src/assets/app-icon.png (1024×1024)، وشعار الويب: public/icon-512.png
 */
const config: CapacitorConfig = {
  appId: "iq.yammak.app",
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
    url: "https://yammak.lovable.app",
    androidScheme: "https",
    iosScheme: "https",
    hostname: "yammak.lovable.app",
    cleartext: false,
    allowNavigation: ["yammak.lovable.app", "*.supabase.co", "*.stripe.com"],
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
