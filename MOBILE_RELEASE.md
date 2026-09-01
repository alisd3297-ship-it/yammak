# إصدار الموبايل — لبابك (Android / Capacitor)

| العنصر | القيمة |
| --- | --- |
| اسم التطبيق | لبابك |
| Package / appId | `iq.lababak.app` (ثابت — لا يتغير بعد أول رفع) |
| اللون الأساسي / Theme | `#1b3a86` |
| الاتجاه | RTL، عربي (`lang="ar"`) |
| نمط الإطلاق | Hosted Wrapper — يفتح `https://lubabak.lovable.app` |
| إعداد Capacitor | `capacitor.config.ts` (webDir = `dist/client`) |
| أصول الأيقونة/Splash | مجلد `assets/` (icon.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png) |
| مشروع أندرويد | يُولَّد آلياً بـ `cap add android` (غير مضاف إلى Git) |

## لماذا Hosted Wrapper؟

المشروع TanStack Start مع SSR و`createServerFn` ومسارات `src/routes/api/*` (الدفع، Stripe webhook،
صور الإعلانات، الصيانة، إرسال الإشعارات) — لا يمكن تصديره كموقع ثابت داخل الحزمة.
النتيجة: كل تحديث ويب يظهر فوراً داخل التطبيق بدون إصدار جديد على المتاجر،
مع بقاء كل الأدوار والصلاحيات وقاعدة البيانات كما هي.

## ما نُفّذ داخل المشروع

- `capacitor.config.ts`: appId `iq.lababak.app`، ملء الشاشة، Splash كحلي `#1b3a86`،
  StatusBar، Keyboard، PushNotifications، Geolocation، وقائمة `allowNavigation` مقيّدة.
- `src/lib/native-bridge.ts`: تهيئة الغلاف (شريط الحالة، إخفاء Splash، زر الرجوع الأصلي)،
  اعتراض الروابط الخارجية وفتحها بـ In-App Browser، وطلب صلاحية الموقع (`ensureLocationPermission`).
- ربط `initNativeShell()` في `src/routes/__root.tsx` (لا يؤثر على الويب إطلاقاً).
- طلب صلاحية الموقع قبل `navigator.geolocation` في: واجهة المندوب، خريطة المندوب، التكسي، المتاجر.
- `scripts/android-customize.mjs`: يحقن الصلاحيات و`<queries>` واسم التطبيق العربي،
  ويفعّل `google-services` تلقائياً **فقط** إذا وُجد `android/app/google-services.json`.
- `scripts/android-signing.mjs`: توقيع الإصدار من `android/keystore.properties` (بدون أي كلمات مرور في الكود).
- `.github/workflows/main.yml`: بناء APK (debug) و **AAB (release)** ورفعهما كـ artifacts.
- إضافات مثبّتة: `@capacitor/browser`, `@capacitor/geolocation`, `@capacitor/keyboard`
  إلى جانب `push-notifications`, `splash-screen`, `status-bar`, `app`, `haptics`.

## الصلاحيات المحقونة في AndroidManifest

`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`,
`POST_NOTIFICATIONS`, `VIBRATE`, `CAMERA`, `READ_MEDIA_IMAGES`
مع `<queries>` لفتح المتصفح والاتصال الهاتفي على أندرويد 11+.

## البناء محلياً

```bash
bun install
bun run build
bunx cap add android
bunx capacitor-assets generate --android
node scripts/android-customize.mjs
node scripts/android-signing.mjs
bunx cap sync android
cd android && ./gradlew bundleRelease   # المخرج: app/build/outputs/bundle/release/app-release.aab
```

## ما يجب فعله خارج Lovable

1. **google-services.json**: من Firebase Console (مشروع `lababak-834cc`) أضف تطبيق أندرويد
   بالحزمة `iq.lababak.app`، نزّل الملف وضعه في `android/app/google-services.json`
   (أو ضعه كـ GitHub Secret باسم `GOOGLE_SERVICES_JSON`). بدونه لن تصل إشعارات FCM.
2. **بصمة SHA-1/SHA-256** لمفتاح التوقيع تُضاف في Firebase إذا استخدمت خدمات تتطلبها.
3. **Keystore للإصدار**:
   ```bash
   keytool -genkey -v -keystore lubabak-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias lubabak
   ```
   ضعه في `android/lubabak-release.jks` وأنشئ `android/keystore.properties`
   (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) — أو أضفه كـ Secrets:
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
4. **Google Play Console**: إنشاء التطبيق باسم «لبابك»، رفع الـ AAB، سياسة الخصوصية،
   استبيان أمان البيانات (موقع + إشعارات + كاميرا)، تصنيف المحتوى، ولقطات الشاشة.
5. **Deep links (اختياري)**: رفع `assetlinks.json` على `lubabak.lovable.app` لتفعيل App Links.
