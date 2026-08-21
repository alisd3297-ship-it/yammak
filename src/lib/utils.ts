import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** معرّف عشوائي متوافق مع بيئات الإنتاج والويب-فيو القديمة (بدون crypto.randomUUID). */
export function randomId(): string {
  const g = globalThis.crypto as Crypto | undefined;
  if (g?.randomUUID) return g.randomUUID();
  if (g?.getRandomValues) {
    const bytes = new Uint8Array(16);
    g.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 12)}`;
}
