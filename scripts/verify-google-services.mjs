#!/usr/bin/env node
/**
 * يتحقق أن ملف google-services.json يطابق مشروع فايربيس ومعرّف الحزمة المعتمدين.
 * لا يطبع أي مفاتيح أو قيم حساسة — فقط نتيجة المطابقة.
 *
 * الاستخدام: node scripts/verify-google-services.mjs [path]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_PROJECT_ID = "lababak-834cc";
const EXPECTED_PACKAGE = "iq.lababak.app";

const path = resolve(process.cwd(), process.argv[2] ?? "android-config/google-services.json");

if (!existsSync(path)) {
  console.error(`google-services.json غير موجود: ${path}`);
  process.exit(1);
}

const json = JSON.parse(readFileSync(path, "utf8"));
const projectId = json?.project_info?.project_id;
const packages = (json?.client ?? []).map((c) => c?.client_info?.android_client_info?.package_name);

const errors = [];
if (projectId !== EXPECTED_PROJECT_ID) {
  errors.push(`مشروع فايربيس غير متطابق: ${projectId} (المتوقع ${EXPECTED_PROJECT_ID})`);
}
if (!packages.includes(EXPECTED_PACKAGE)) {
  errors.push(`معرّف الحزمة ${EXPECTED_PACKAGE} غير موجود في الملف (${packages.join(", ")})`);
}

if (errors.length) {
  errors.forEach((e) => console.error(e));
  process.exit(1);
}

console.log(`google-services.json صحيح: ${EXPECTED_PROJECT_ID} / ${EXPECTED_PACKAGE}`);
