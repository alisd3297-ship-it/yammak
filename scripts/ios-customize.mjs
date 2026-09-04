#!/usr/bin/env node
/**
 * تهيئة مشروع iOS المولَّد بواسطة `cap add ios` بشكل قابل للتكرار (idempotent):
 *
 * 1) ضبط الاسم المعروض «لبابك» ولغة التطبيق العربية (RTL).
 * 2) حقن نصوص أذونات iOS (الموقع، الكاميرا، مكتبة الصور، الميكروفون).
 * 3) تفعيل وضع الخلفية remote-notification للإشعارات (FCM/APNs).
 * 4) ITSAppUsesNonExemptEncryption = false لتفادي أسئلة التصدير في App Store Connect.
 * 5) إنشاء ملف App.entitlements بـ aps-environment (يُربط من Xcode عبر Signing & Capabilities).
 *
 * الاستخدام: node scripts/ios-customize.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const INFO_PLIST = resolve(root, "ios/App/App/Info.plist");
const ENTITLEMENTS = resolve(root, "ios/App/App/App.entitlements");

const APP_NAME = "لبابك";

/** مفاتيح نصية بسيطة (string) تُحقن إن لم تكن موجودة. */
const STRING_KEYS = {
  CFBundleDisplayName: APP_NAME,
  CFBundleName: APP_NAME,
  CFBundleDevelopmentRegion: "ar",
  NSLocationWhenInUseUsageDescription:
    "نحتاج موقعك لتحديد عنوان التوصيل وعرض المطاعم والمحلات القريبة منك.",
  NSLocationAlwaysAndWhenInUseUsageDescription:
    "نحتاج موقعك أثناء الرحلة لمتابعة حالة الطلب وتوجيه المندوب إليك.",
  NSCameraUsageDescription: "نحتاج الكاميرا لالتقاط صور المنتجات أو إثبات التسليم.",
  NSPhotoLibraryUsageDescription: "نحتاج مكتبة الصور لاختيار صور المنتجات والإعلانات.",
  NSPhotoLibraryAddUsageDescription: "لحفظ صور الفواتير أو إثبات التسليم في مكتبة الصور.",
  NSMicrophoneUsageDescription: "نحتاج الميكروفون للبحث الصوتي داخل التطبيق.",
};

const ENTITLEMENTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>production</string>
</dict>
</plist>
`;

function setStringKey(xml, key, value) {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (re.test(xml)) return xml.replace(re, `$1${value}$2`);
  return xml.replace(/<dict>/, `<dict>\n\t<key>${key}</key>\n\t<string>${value}</string>`);
}

function ensureBoolFalse(xml, key) {
  if (xml.includes(`<key>${key}</key>`)) return xml;
  return xml.replace(/<dict>/, `<dict>\n\t<key>${key}</key>\n\t<false/>`);
}

function ensureBackgroundModes(xml) {
  if (xml.includes("<key>UIBackgroundModes</key>")) {
    if (xml.includes("<string>remote-notification</string>")) return xml;
    return xml.replace(
      /(<key>UIBackgroundModes<\/key>\s*<array>)/,
      "$1\n\t\t<string>remote-notification</string>",
    );
  }
  return xml.replace(
    /<dict>/,
    "<dict>\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>\n\t</array>",
  );
}

function patchInfoPlist() {
  if (!existsSync(INFO_PLIST)) return false;
  let xml = readFileSync(INFO_PLIST, "utf8");
  for (const [key, value] of Object.entries(STRING_KEYS)) xml = setStringKey(xml, key, value);
  xml = ensureBoolFalse(xml, "ITSAppUsesNonExemptEncryption");
  xml = ensureBackgroundModes(xml);
  writeFileSync(INFO_PLIST, xml);
  return true;
}

function writeEntitlements() {
  if (existsSync(ENTITLEMENTS)) return;
  writeFileSync(ENTITLEMENTS, ENTITLEMENTS_XML);
}

function main() {
  if (!patchInfoPlist()) {
    console.error("ios/App/App/Info.plist غير موجود — نفّذ `bunx cap add ios` أولاً.");
    process.exit(1);
  }
  writeEntitlements();
  console.log("تمت تهيئة مشروع iOS (اسم التطبيق + الأذونات + الإشعارات).");
}

if (process.argv[1] && process.argv[1].endsWith("ios-customize.mjs")) {
  main();
}

export { patchInfoPlist, writeEntitlements };
