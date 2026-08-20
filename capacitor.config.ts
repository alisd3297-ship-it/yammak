import type { CapacitorConfig } from "@capacitor/cli";

/**
 * إعداد إصدار الموبايل (Capacitor) لتطبيق «يمّك».
 * هذا الملف مرجع الإطلاق: المعرفات، الاسم الظاهر، شاشة البداية، والصلاحيات.
 * الخطوات الفعلية للبناء ورفع المتاجر تتم خارج Lovable:
 *   npm i @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
 *   npx cap add android && npx cap add ios && npx cap sync
 * الأيقونة المصدر: src/assets/app-icon.png (1024×1024)، وشعار الويب: public/icon-512.png
 */
const config: CapacitorConfig = {
  appId: "iq.yammak.app",
  appName: "يمّك",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
  },
  server: {
    androidScheme: "https",
    // روابط عميقة: yammak.iq و project--729acaeb-a297-44ff-bcda-163988b47b73.lovable.app
    // تُضبط عبر App Links / Universal Links بعد ربط الدومين النهائي.
    cleartext: false,
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
