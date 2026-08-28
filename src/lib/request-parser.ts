export type ParsedLine = { name: string; quantity: number; note: string | null };

const AR_DIGITS = /[٠-٩]/g;

/** تحويل الأرقام العربية إلى إنجليزية حتى يعمل التحليل مع الكتابة المحلية. */
function normalizeDigits(text: string): string {
  return text.replace(AR_DIGITS, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

const WORD_NUMBERS: Record<string, number> = {
  واحد: 1,
  وحدة: 1,
  اثنين: 2,
  اثنان: 2,
  ثنين: 2,
  ثلاثة: 3,
  ثلاث: 3,
  اربعة: 4,
  أربعة: 4,
  خمسة: 5,
  ستة: 6,
  سبعة: 7,
  ثمانية: 8,
  تسعة: 9,
  عشرة: 10,
};

/**
 * تحويل نص حر إلى عناصر منظمة (اسم + كمية + ملاحظة).
 * التحليل محلي وبسيط ومقصود أن يكون قابلاً للتعديل من المستخدم قبل الإرسال.
 */
export function parseRequestText(text: string): ParsedLine[] {
  const raw = normalizeDigits(text ?? "");
  const lines = raw
    .split(/\n|،|,|\+|\bو\s(?=\S)/g)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const out: ParsedLine[] = [];
  for (const line of lines) {
    const [main, ...rest] = line.split(/[-–:(]/);
    let body = (main ?? line).trim();
    const note = rest.join(" ").replace(/\)/g, "").trim() || null;

    let quantity = 1;
    const leading = body.match(/^(\d{1,3})\s*(x|\*)?\s*(.+)$/);
    const trailing = body.match(/^(.+?)\s*(x|\*)?\s*(\d{1,3})$/);
    if (leading) {
      quantity = Number(leading[1]);
      body = (leading[3] ?? "").trim();
    } else if (trailing) {
      quantity = Number(trailing[3]);
      body = (trailing[1] ?? "").trim();
    } else {
      const first = body.split(/\s+/)[0] ?? "";
      const asWord = WORD_NUMBERS[first];
      if (asWord) {
        quantity = asWord;
        body = body.slice(first.length).trim();
      }
    }

    if (!body) continue;
    out.push({
      name: body.slice(0, 120),
      quantity: Math.min(Math.max(quantity || 1, 1), 99),
      note,
    });
  }
  return out.slice(0, 30);
}
