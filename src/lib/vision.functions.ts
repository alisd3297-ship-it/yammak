import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VisionItem = { name: string; quantity: number; note: string | null };

/**
 * «اطلب من صورة»: يقرأ صورة قائمة مشتريات أو وصفة أو رفّ منتجات
 * ويحوّلها إلى عناصر منظمة يعدّلها المستخدم قبل الإرسال.
 */
export const extractItemsFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string }) => data)
  .handler(async ({ data }): Promise<{ items: VisionItem[]; text: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("خدمة قراءة الصور غير مفعّلة حالياً");

    const image = (data.imageDataUrl ?? "").trim();
    if (!image.startsWith("data:image/")) throw new Error("الصورة غير صالحة");
    // حد أعلى تقريبي (~4MB بعد base64) حتى لا نُثقل الطلب
    if (image.length > 5_600_000) throw new Error("حجم الصورة كبير، جرّب صورة أصغر");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد عراقي يقرأ صور قوائم المشتريات والوصفات ورفوف المنتجات. " +
              'أعد JSON فقط بالشكل: {"items":[{"name":"...","quantity":1,"note":null}]} ' +
              "بأسماء عربية مختصرة وكميات صحيحة. لا تكتب أي شرح خارج JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "استخرج العناصر المطلوبة من هذه الصورة." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
    });

    if (response.status === 429) throw new Error("ضغط عالي على الخدمة، جرّب بعد قليل");
    if (response.status === 402) throw new Error("رصيد خدمة الذكاء الاصطناعي غير كافٍ");
    if (!response.ok) throw new Error("تعذر قراءة الصورة، جرّب مرة ثانية");

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);

    let items: VisionItem[] = [];
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as { items?: VisionItem[] };
        items = (parsed.items ?? [])
          .filter((i) => i && typeof i.name === "string" && i.name.trim())
          .slice(0, 30)
          .map((i) => ({
            name: String(i.name).trim().slice(0, 120),
            quantity: Math.min(Math.max(Math.trunc(Number(i.quantity) || 1), 1), 99),
            note: i.note ? String(i.note).slice(0, 200) : null,
          }));
      } catch {
        items = [];
      }
    }

    if (!items.length) throw new Error("ما كدرنا نقرأ عناصر واضحة من الصورة");
    return { items, text: items.map((i) => `${i.quantity} ${i.name}`).join("\n") };
  });
