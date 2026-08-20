# متطلبات إصدار الموبايل — يمّك

| العنصر | القيمة |
| --- | --- |
| اسم التطبيق | يمّك |
| الاسم المختصر | يمّك |
| Bundle / Package ID | `iq.yammak.app` (Android + iOS) |
| اللون الأساسي / Theme | `#c81e2b` |
| الاتجاه | RTL، عربي (`lang="ar"`) |
| الأيقونة المصدر | `src/assets/app-icon.png` (1024×1024) |
| أيقونات الويب/PWA | `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `public/favicon.png` |
| Manifest | `public/manifest.webmanifest` (standalone, portrait) |
| Splash | لون `#c81e2b` + الأيقونة، معرّف في `capacitor.config.ts` |
| إعداد Capacitor | `capacitor.config.ts` (webDir = `dist/client`) |

## الصلاحيات المطلوبة

| الصلاحية | السبب | إلزامية |
| --- | --- | --- |
| `ACCESS_FINE_LOCATION` / `NSLocationWhenInUseUsageDescription` | تحديد موقع الاستلام/التسليم وتوزيع المهام على السائقين | نعم |
| `INTERNET` / `ACCESS_NETWORK_STATE` | الاتصال بالخدمات | نعم |
| `CALL_PHONE` (اختياري) أو فتح `tel:` مباشرة | زر «اتصل الآن» في الإعلانات وتواصل السائق | لا (يكفي `tel:`) |
| `CAMERA` / `READ_MEDIA_IMAGES` | رفع صور الإعلانات والمنتجات | نعم لصفحة الإعلانات |
| `POST_NOTIFICATIONS` (Android 13+) | إشعارات حالة الطلب مستقبلاً | اختيارية |

## الروابط العميقة (Deep links)

المسارات المرشحة: `/orders/:id`, `/ads/:id`, `/restaurants/:id`, `/stores/:id`, `/services/:id`.
تُفعَّل عبر Android App Links و iOS Universal Links بعد ربط الدومين النهائي (يتطلب
`assetlinks.json` و `apple-app-site-association` على الدومين).

## متغيرات البيئة

- عميل: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (مُدارة تلقائياً).
- خادم: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (مُدارة).
- تكاملات خارجية اختيارية تُضاف من Project Settings → Secrets:
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (أو `TWILIO_VERIFY_SERVICE_SID`),
  `LOVABLE_CRON_SECRET` (اختياري لتأمين نقطة الصيانة).

## خطوات البناء (خارج Lovable)

```bash
npm i @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
npm run build
npx cap add android && npx cap add ios
npx cap sync
```
