/** بحث ذكي عربي: يتجاهل التشكيل وصيغ الألف والهاء، ويدعم جزء الكلمة وعدة كلمات وأخطاء بسيطة. */
export function normalizeArabic(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}

/** درجة التطابق: 0 يعني لا نتيجة، كلما زاد الرقم كانت النتيجة أقرب. */
export function fuzzyScore(query: string, fields: string[]): number {
  const q = normalizeArabic(query);
  if (!q) return 0;
  const terms = q.split(" ").filter(Boolean);
  const haystack = fields.map(normalizeArabic).filter(Boolean);
  let score = 0;

  for (const term of terms) {
    let best = 0;
    for (let f = 0; f < haystack.length; f++) {
      const text = haystack[f] ?? "";
      const weight = f === 0 ? 3 : 1;
      if (text.startsWith(term)) best = Math.max(best, 10 * weight);
      else if (text.includes(term)) best = Math.max(best, 7 * weight);
      else {
        for (const word of text.split(" ")) {
          if (word.startsWith(term)) best = Math.max(best, 8 * weight);
          else if (term.length >= 3 && levenshtein(word, term) <= (term.length > 5 ? 2 : 1))
            best = Math.max(best, 4 * weight);
        }
      }
    }
    if (best === 0) return 0; // كل كلمة بحث يجب أن تطابق شيئاً
    score += best;
  }
  return score;
}
