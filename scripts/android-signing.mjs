#!/usr/bin/env node
/**
 * يحقن إعداد التوقيع (Release signing) داخل android/app/build.gradle
 * بشكل آمن وقابل للتكرار (idempotent).
 *
 * - لا ينشئ أي keystore ولا يقرأ/يطبع أي كلمة مرور.
 * - القيم تُقرأ وقت البناء من android/keystore.properties (غير مضاف إلى Git).
 * - إذا لم يوجد keystore.properties يتم البناء بدون توقيع كما كان (debug signing).
 *
 * الاستخدام:  node scripts/android-signing.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const GRADLE_PATH = resolve(process.cwd(), "android/app/build.gradle");
const MARKER = "// yammak-release-signing";

const LOADER = `${MARKER} (start)
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
}
${MARKER} (end)
`;

const SIGNING_BLOCK = `    ${MARKER} configs
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
`;

function patch(source) {
  let out = source;

  if (!out.includes(`${MARKER} (start)`)) {
    out = out.replace(
      /^(apply plugin: 'com\.android\.application'\s*\n)/m,
      `$1\n${LOADER}`,
    );
  }

  if (!out.includes(`${MARKER} configs`)) {
    out = out.replace(/^(\s*)buildTypes \{/m, `${SIGNING_BLOCK}$1buildTypes {`);
  }

  if (!/release \{[\s\S]*?signingConfig signingConfigs\.release/.test(out)) {
    out = out.replace(
      /(buildTypes \{\s*\n\s*release \{\n)/m,
      `$1            if (keystorePropertiesFile.exists()) {\n                signingConfig signingConfigs.release\n            }\n`,
    );
  }

  return out;
}

function main() {
  if (!existsSync(GRADLE_PATH)) {
    console.error(
      "android/app/build.gradle غير موجود — نفّذ `npx cap add android` أولاً.",
    );
    process.exit(1);
  }
  const source = readFileSync(GRADLE_PATH, "utf8");
  const patched = patch(source);
  if (patched === source) {
    console.log("إعداد التوقيع موجود مسبقاً — لا تغيير.");
    return;
  }
  writeFileSync(GRADLE_PATH, patched);
  console.log("تم تفعيل signingConfigs.release في android/app/build.gradle.");
}

export { patch, MARKER };

if (process.argv[1] && process.argv[1].endsWith("android-signing.mjs")) {
  main();
}
