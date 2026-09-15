#!/usr/bin/env node
/**
 * يضبط versionCode / versionName داخل android/app/build.gradle.
 *
 * المصدر: android-config/version.json (قابل للتجاوز بمتغيرات البيئة
 * ANDROID_VERSION_CODE و ANDROID_VERSION_NAME).
 *
 * مهم: مشروع أندرويد يُولَّد في كل بناء بـ `cap add android` وقيمته الافتراضية
 * versionCode = 1، ما يعني رفض التحديث على Google Play. هذا السكربت يمنع ذلك.
 *
 * الاستخدام: node scripts/android-version.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const APP_GRADLE = resolve(root, "android/app/build.gradle");
const VERSION_FILE = resolve(root, "android-config/version.json");

export function readVersion() {
  let versionCode = 1;
  let versionName = "1.0.0";
  if (existsSync(VERSION_FILE)) {
    const json = JSON.parse(readFileSync(VERSION_FILE, "utf8"));
    if (Number.isInteger(json.versionCode)) versionCode = json.versionCode;
    if (typeof json.versionName === "string" && json.versionName) versionName = json.versionName;
  }
  const envCode = Number.parseInt(process.env["ANDROID_VERSION_CODE"] ?? "", 10);
  if (Number.isInteger(envCode) && envCode > 0) versionCode = envCode;
  const envName = process.env["ANDROID_VERSION_NAME"];
  if (envName) versionName = envName;
  return { versionCode, versionName };
}

function main() {
  if (!existsSync(APP_GRADLE)) {
    console.error("android/app/build.gradle غير موجود — نفّذ `cap add android` أولاً.");
    process.exit(1);
  }
  const { versionCode, versionName } = readVersion();
  let g = readFileSync(APP_GRADLE, "utf8");

  if (/versionCode\s+\d+/.test(g)) {
    g = g.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  } else {
    g = g.replace(/(defaultConfig\s*\{)/, `$1\n        versionCode ${versionCode}`);
  }

  if (/versionName\s+"[^"]*"/.test(g)) {
    g = g.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  } else {
    g = g.replace(/(defaultConfig\s*\{)/, `$1\n        versionName "${versionName}"`);
  }

  writeFileSync(APP_GRADLE, g);
  console.log(`تم ضبط versionCode=${versionCode} و versionName=${versionName}`);
}

if (process.argv[1] && process.argv[1].endsWith("android-version.mjs")) {
  main();
}
