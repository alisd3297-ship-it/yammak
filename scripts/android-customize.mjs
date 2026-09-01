#!/usr/bin/env node
/**
 * تهيئة مشروع أندرويد المولَّد بواسطة `cap add android` بشكل قابل للتكرار (idempotent):
 *
 * 1) إضافة الصلاحيات المطلوبة إلى AndroidManifest.xml (الموقع، الإشعارات، الكاميرا، الشبكة).
 * 2) السماح باستعلام تطبيقات الهاتف/المتصفح (<queries>) لأندرويد 11+.
 * 3) تفعيل إضافة google-services إذا كان الملف android/app/google-services.json موجوداً فعلاً
 *    (لا نخترع الملف — يُرفع من Firebase Console).
 * 4) ضبط الاسم المعروض للتطبيق «لبابك».
 *
 * الاستخدام: node scripts/android-customize.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const MANIFEST = resolve(root, "android/app/src/main/AndroidManifest.xml");
const APP_GRADLE = resolve(root, "android/app/build.gradle");
const ROOT_GRADLE = resolve(root, "android/build.gradle");
const STRINGS = resolve(root, "android/app/src/main/res/values/strings.xml");
const GOOGLE_SERVICES = resolve(root, "android/app/google-services.json");

const PERMISSIONS = [
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.VIBRATE",
  "android.permission.CAMERA",
  "android.permission.READ_MEDIA_IMAGES",
];

const QUERIES = `    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
        <intent>
            <action android:name="android.intent.action.DIAL" />
            <data android:scheme="tel" />
        </intent>
    </queries>
`;

function patchManifest() {
  if (!existsSync(MANIFEST)) return false;
  let xml = readFileSync(MANIFEST, "utf8");
  const missing = PERMISSIONS.filter((p) => !xml.includes(`android:name="${p}"`));
  if (missing.length) {
    const block = missing.map((p) => `    <uses-permission android:name="${p}" />`).join("\n");
    xml = xml.replace(/<\/manifest>/, `${block}\n</manifest>`);
  }
  if (!xml.includes("<queries>")) {
    xml = xml.replace(/<\/manifest>/, `${QUERIES}</manifest>`);
  }
  if (!xml.includes('android:usesCleartextTraffic="false"')) {
    xml = xml.replace(/(<application\b)/, '$1\n        android:usesCleartextTraffic="false"');
  }
  writeFileSync(MANIFEST, xml);
  return true;
}

function patchStrings() {
  if (!existsSync(STRINGS)) return;
  let xml = readFileSync(STRINGS, "utf8");
  xml = xml
    .replace(/(<string name="app_name">)[^<]*(<\/string>)/, "$1لبابك$2")
    .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, "$1لبابك$2");
  writeFileSync(STRINGS, xml);
}

function patchGoogleServices() {
  if (!existsSync(GOOGLE_SERVICES)) {
    console.log("google-services.json غير موجود — تخطّي تفعيل Firebase (سيُرفع لاحقاً).");
    return;
  }
  if (existsSync(ROOT_GRADLE)) {
    let g = readFileSync(ROOT_GRADLE, "utf8");
    if (!g.includes("com.google.gms:google-services")) {
      g = g.replace(
        /(dependencies\s*\{)/,
        "$1\n        classpath 'com.google.gms:google-services:4.4.2'",
      );
      writeFileSync(ROOT_GRADLE, g);
    }
  }
  if (existsSync(APP_GRADLE)) {
    let g = readFileSync(APP_GRADLE, "utf8");
    if (!g.includes("com.google.gms.google-services")) {
      g += "\napply plugin: 'com.google.gms.google-services'\n";
      writeFileSync(APP_GRADLE, g);
    }
  }
  console.log("تم تفعيل google-services (FCM) في مشروع أندرويد.");
}

function main() {
  if (!patchManifest()) {
    console.error("android/app/src/main/AndroidManifest.xml غير موجود — نفّذ `cap add android` أولاً.");
    process.exit(1);
  }
  patchStrings();
  patchGoogleServices();
  console.log("تمت تهيئة مشروع أندرويد (صلاحيات + اسم التطبيق).");
}

if (process.argv[1] && process.argv[1].endsWith("android-customize.mjs")) {
  main();
}

export { patchManifest, patchStrings, patchGoogleServices };
