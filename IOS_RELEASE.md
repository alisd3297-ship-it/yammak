# إصدار iOS — لبابك (Capacitor)

| العنصر | القيمة |
| --- | --- |
| اسم التطبيق | لبابك |
| Bundle ID | `iq.lababak.app` (نفس Android — ثابت بعد أول رفع) |
| نمط الإطلاق | Hosted Wrapper — يفتح `https://lubabak.lovable.app` |
| الأصول | مجلد `assets/` (icon.png, splash.png, splash-dark.png) |
| مشروع Xcode | `ios/App/App.xcodeproj` (يُولَّد بـ `cap add ios`، غير مضاف إلى Git) |

## ما نُفّذ داخل المشروع

- `@capacitor/ios` مثبّت، وإعداد `ios` جاهز في `capacitor.config.ts` (userAgent، خلفية، contentInset).
- `scripts/ios-customize.mjs`: يضبط الاسم العربي «لبابك»، لغة `ar`، نصوص أذونات
  (الموقع، الكاميرا، مكتبة الصور، الميكروفون)، وضع الخلفية `remote-notification` للإشعارات،
  `ITSAppUsesNonExemptEncryption=false`، وينشئ `App.entitlements` بـ `aps-environment`.
- `bun run ios:assets`: يولّد الأيقونة وشاشة البداية (Light/Dark) داخل `Assets.xcassets`.
- `.github/workflows/ios.yml`: بناء أرشيف iOS غير موقّع على macOS ورفعه كـ artifact.
- لا تغيير على الويب أو Android — كل جسر Capacitor الحالي (`native-bridge`, `native-push`) يعمل كما هو.

## البناء محلياً (يتطلب macOS + Xcode)

```bash
bun install
bun run build
bunx cap add ios          # أول مرة فقط
bun run ios:assets
bun run ios:customize
bun run ios:sync
bun run ios:open          # يفتح Xcode
```

## الخطوات المطلوبة منك لإصدار Release ورفعه إلى App Store Connect

1. **حساب Apple Developer** ($99/سنة) وتفعيل الوصول إلى App Store Connect.
2. في **Xcode → Target App → Signing & Capabilities**:
   - فعّل *Automatically manage signing* واختر فريقك (Team).
   - تأكد أن **Bundle Identifier = `iq.lababak.app`**.
   - أضف Capability: **Push Notifications**، واختر ملف `App.entitlements` إن لم يُربط تلقائياً.
   - أضف Capability: **Background Modes → Remote notifications**.
3. **APNs للإشعارات**: من Apple Developer → Keys أنشئ **APNs Auth Key (.p8)**،
   ثم ارفعه في Firebase Console (مشروع `lababak-834cc`) → Project Settings → Cloud Messaging → iOS،
   مع Key ID و Team ID. بدونه لن تصل إشعارات FCM على iOS.
4. في Xcode: **General** → اضبط `Version` (مثلاً 1.0.0) و`Build` (1)، والحد الأدنى iOS 14+.
5. **App Store Connect**: أنشئ تطبيقاً جديداً باسم «لبابك» بنفس Bundle ID،
   واملأ: الوصف، الكلمات المفتاحية، لقطات الشاشة (6.7" و6.5" و5.5" و iPad إن دعمته)،
   **رابط سياسة الخصوصية**: `https://lubabak.lovable.app/privacy`،
   **رابط حذف الحساب**: `https://lubabak.lovable.app/delete-account`،
   واستبيان الخصوصية (الموقع + الإشعارات + الكاميرا + بيانات الحساب).
6. **الأرشفة والرفع**: في Xcode اختر جهاز `Any iOS Device (arm64)` ثم
   **Product → Archive** → **Distribute App → App Store Connect → Upload**.
7. بعد اكتمال المعالجة: أضف البناء إلى نسخة TestFlight للاختبار، ثم **Submit for Review**.
8. ملاحظة مهمة لمراجعة Apple: التطبيق غلاف لموقع منشور — وفّر **حساب تجريبي (اسم مستخدم/كلمة مرور)**
   في حقل *App Review Information* وإلا يُرفض غالباً بالبند 2.1.
