import type { QueryClient } from "@tanstack/react-query";
import { logAppError } from "@/lib/error-log";

/**
 * مراقبة خفيفة لأداء الاستعلامات داخل المتصفح (بدون أي خدمة خارجية أو مفتاح سري).
 * الهدف: توفير أرقام حقيقية تساعد لاحقاً على Load Testing وتشخيص البطء.
 *
 * - تُجمَّع الأزمنة في الذاكرة فقط، ويمكن قراءتها من الكونسول عبر
 *   `window.__lubabakPerf()`.
 * - لا يُسجَّل في قاعدة البيانات إلا الاستعلام البطيء جداً (> 6 ثوانٍ)، ومرة
 *   واحدة لكل مفتاح خلال الجلسة، حتى لا نضيف حملاً على الشبكة.
 */

export type QueryStat = { count: number; totalMs: number; maxMs: number; errors: number };

const SLOW_LOG_MS = 6_000;
const stats = new Map<string, QueryStat>();
const loggedSlow = new Set<string>();

function keyOf(queryKey: readonly unknown[]): string {
  const head = queryKey[0];
  return typeof head === "string" ? head : JSON.stringify(queryKey).slice(0, 60);
}

export function perfSnapshot() {
  return [...stats.entries()]
    .map(([key, s]) => ({
      key,
      count: s.count,
      errors: s.errors,
      avgMs: Math.round(s.totalMs / Math.max(s.count, 1)),
      maxMs: Math.round(s.maxMs),
    }))
    .sort((a, b) => b.count * b.avgMs - a.count * a.avgMs);
}

/** يربط المراقبة بذاكرة الاستعلامات. آمن للاستدعاء على الخادم (لا يفعل شيئاً). */
export function installQueryPerfMonitor(client: QueryClient): () => void {
  if (typeof window === "undefined") return () => {};

  const started = new Map<string, number>();

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    const query = event.query;
    if (!query) return;
    const hash = query.queryHash;
    const name = keyOf(query.queryKey as readonly unknown[]);

    if (event.type === "updated" && event.action.type === "fetch") {
      started.set(hash, performance.now());
      return;
    }
    if (event.type !== "updated") return;
    const action = event.action;
    if (action.type !== "success" && action.type !== "error") return;

    const startedAt = started.get(hash);
    if (startedAt === undefined) return;
    started.delete(hash);
    const ms = performance.now() - startedAt;

    const stat = stats.get(name) ?? { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
    stat.count += 1;
    stat.totalMs += ms;
    stat.maxMs = Math.max(stat.maxMs, ms);
    if (action.type === "error") stat.errors += 1;
    stats.set(name, stat);

    if (ms > SLOW_LOG_MS && !loggedSlow.has(name)) {
      loggedSlow.add(name);
      void logAppError(`استعلام بطيء: ${name} (${Math.round(ms)}ms)`, {
        kind: "perf",
        details: { queryKey: name, ms: Math.round(ms) },
      });
    }
  });

  (window as unknown as { __lubabakPerf?: () => unknown }).__lubabakPerf = perfSnapshot;

  return () => {
    unsubscribe();
    delete (window as unknown as { __lubabakPerf?: () => unknown }).__lubabakPerf;
  };
}
