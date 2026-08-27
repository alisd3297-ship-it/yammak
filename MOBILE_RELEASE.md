# متطلبات إصدار الموبايل — لبابك

| العنصر | القيمة |
| --- | --- |
| اسم التطبيق | لبابك |
| الاسم المختصر | لبابك |
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

## نمط الإطلاق: Hosted Wrapper (Capacitor)

التطبيق الأصلي يفتح نسخة الإنتاج المنشورة مباشرة:
`server.url = https://yammak.lovable.app` في `capacitor.config.ts`.
السبب: المشروع TanStack Start مع SSR و`createServerFn` ومسارات `src/routes/api/*`
(الدفع، webhook Stripe، صور الإعلانات، الصيانة) — لا يمكن تصديره كموقع ثابت داخل الحزمة.
النتيجة: أي تحديث في الويب يظهر فوراً داخل التطبيق بدون إصدار جديد على المتاجر.

الحزم المثبتة: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`,
`@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/app`.

### ما لا يمكن إنجازه داخل Lovable
- إنشاء مجلدي `android/` و`ios/` (`npx cap add`) والبناء والتوقيع: يتطلبان Android Studio/JDK وXcode/macOS.
- توليد AAB/IPA ورفعها إلى Google Play / App Store Connect.
- تحرير `AndroidManifest.xml` و`Info.plist` للصلاحيات (الملفات غير موجودة قبل `cap add`).

### الخطوات الخارجية لإنتاج AAB/IPA
```bash
git clone <repo> && npm install
npm run build
npx cap add android && npx cap add ios
npx cap sync
```
1. Android: افتح `android/` في Android Studio، اضبط `versionCode/versionName`،
   أضف الصلاحيات في `AndroidManifest.xml` (INTERNET, ACCESS_NETWORK_STATE,
   ACCESS_FINE_LOCATION, CAMERA/READ_MEDIA_IMAGES, POST_NOTIFICATIONS)،
   ثم `Build > Generate Signed Bundle (AAB)` بمفتاح keystore خاص بك.
2. iOS: افتح `ios/App/App.xcworkspace` في Xcode على macOS، اضبط Team وBundle ID
   `iq.yammak.app`، أضف مفاتيح الاستخدام في `Info.plist`
   (`NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`,
   `NSPhotoLibraryUsageDescription`)، ثم Archive ورفع إلى App Store Connect.
3. الأيقونات والـ splash: استخدم `npx @capacitor/assets generate` مع
   `src/assets/app-icon.png` (1024×1024) ولون الخلفية `#c81e2b`.
4. Deep links (اختياري): استضف `assetlinks.json` و`apple-app-site-association`
   على الدومين النهائي ثم فعّل App Links / Universal Links.

> ملاحظة مراجعة Apple: تطبيقات wrapper بحتة قد تُرفض بموجب 4.2؛ يُنصح بإضافة
> قيمة أصلية (إشعارات Push، موقع أصلي، كاميرا) قبل التقديم.

## توقيع إصدار Android (Release signing)

- ملف الأسرار المحلي: `android/keystore.properties` (غير مضاف إلى Git — مستثنى في `.gitignore`)
  ويحتوي: `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
- بعد أي `npx cap add android` (الذي يعيد توليد `android/app/build.gradle`) نفّذ:

```bash
npm run android:signing   # أو: node scripts/android-signing.mjs
```

السكربت idempotent: يحقن قراءة `keystore.properties` + `signingConfigs.release`
ويستخدمها في `buildTypes.release`، بدون المساس بـ `applicationId iq.yammak.app`
أو `versionCode 1` / `versionName "1.0"` أو أي إعداد آخر. إذا لم يوجد ملف
`keystore.properties` يبقى البناء كما كان (بدون توقيع إصدار)، لذلك لا ينكسر CI.

- التحقق: `cd android && ./gradlew signingReport` ثم `./gradlew bundleRelease`.
- لا تُرفع الـkeystore ولا كلمات المرور إلى المستودع إطلاقاً.

## بناء نسخة الإصدار محلياً خطوة بخطوة (Android)

المتطلبات: JDK 17، Android SDK (Android Studio)، Node 20+.

```bash
# 1) تجهيز المشروع
git clone <repo> && cd <repo>
npm install
npm run build

# 2) توليد مشروع الأندرويد ومزامنته
npx cap add android      # مرة واحدة فقط
npx cap sync android

# 3) إنشاء keystore للإصدار (مرة واحدة فقط، واحفظه بأمان خارج المستودع)
keytool -genkey -v -keystore ~/yammak-release.jks \
  -alias yammak -keyalg RSA -keysize 2048 -validity 10000

# 4) ملف الأسرار المحلي android/keystore.properties
cat > android/keystore.properties <<'PROPS'
storeFile=/absolute/path/to/yammak-release.jks
storePassword=********
keyAlias=yammak
keyPassword=********
PROPS

# 5) حقن إعدادات التوقيع في build.gradle (idempotent)
npm run android:signing

# 6) التحقق من التوقيع
cd android && ./gradlew signingReport

# 7) بناء AAB للنشر على Google Play
./gradlew bundleRelease      # android/app/build/outputs/bundle/release/app-release.aab
# أو APK للتجربة المباشرة
./gradlew assembleRelease    # android/app/build/outputs/apk/release/app-release.apk
```

### الناتج المتوقع من `./gradlew signingReport`

يجب أن تظهر كتلة variant `release` بمفتاحك الخاص (وليس `debug.keystore`):

```text
Variant: release
Config: release
Store: /absolute/path/to/yammak-release.jks
Alias: yammak
MD5: 1A:2B:3C:...
SHA1: AA:BB:CC:...
SHA-256: 11:22:33:...
Valid until: <تاريخ بعد ~27 سنة>
```

علامات الخطأ وكيف تُصلح:

| ما تراه | المعنى | الإصلاح |
| --- | --- | --- |
| `Variant: release ... Store: ~/.android/debug.keystore` | لم يُقرأ `keystore.properties` | تأكد من مكان الملف `android/keystore.properties` وأعد `npm run android:signing` |
| `Config: null` في variant release | `signingConfigs.release` غير مربوط | أعد تشغيل `npm run android:signing` وتحقق من وجود `signingConfig signingConfigs.release` داخل `buildTypes.release` |
| `Keystore was tampered with, or password was incorrect` | كلمة مرور خاطئة | صحّح `storePassword` / `keyPassword` |
| `storeFile ... (No such file or directory)` | مسار غير صحيح | استخدم مساراً مطلقاً في `storeFile` |

### تحقق نهائي قبل الرفع

```bash
# التأكد أن الـAAB موقّع بمفتاح الإصدار
$ANDROID_HOME/build-tools/34.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
# أو للـ AAB
jarsigner -verify -verbose -certs android/app/build/outputs/bundle/release/app-release.aab | head -20
```

يجب أن تتطابق بصمة `SHA-256` مع ما ظهر في `signingReport`، وأن تكون النتيجة
`jar verified` / `Verifies`. لا تُرفع أبداً ملفات `*.jks` أو `keystore.properties` إلى Git.

## إشعارات الهاتف (Push) — ما هو منجز وما ينقص

منجز داخل المشروع:
- تسجيل رمز الجهاز لكل مستخدم (`push_devices`) مع إعادة الربط عند تبدّل المستخدم.
- قنوات أندرويد `lubabak_orders` (طلبات: صوت + اهتزاز، أولوية قصوى) و`lubabak_default`، تُنشأ قبل التسجيل ويستخدمها الـ payload.
- فتح صفحة الطلب عند الضغط على الإشعار (بالخلفية أو بعد الإغلاق).
- مرسل `/api/public/push-dispatch` مع محاولات إعادة: لا يُعلَّم الإشعار مُرسلاً إلا بعد نجاح فعلي، وتُعطَّل الرموز غير الصالحة.

ينقص (خارج المشروع — لا يمكن توليده هنا):
1. أسرار: `FCM_PROJECT_ID`، `FCM_SERVICE_ACCOUNT_JSON`، `PUSH_DISPATCH_SECRET` في Project Settings → Secrets.
2. جدولة استدعاء `/api/public/push-dispatch` كل دقيقة بترويسة `Authorization: Bearer <PUSH_DISPATCH_SECRET>`.
3. بناء native: `npx cap add android` / `npx cap add ios` (مجلدا android/ و ios/ غير موجودين حالياً).
4. أندرويد: `google-services.json` داخل `android/app/`. iOS: `GoogleService-Info.plist` + مفتاح APNs في Firebase + تفعيل Push Notifications capability.

حتى تكتمل هذه الخطوات لا يصل إشعار إلى جهاز حقيقي؛ التنبيه داخل التطبيق (صوت/اهتزاز/toast) يعمل بدونها.
