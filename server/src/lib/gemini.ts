/* ── קליינט Gemini משותף (REST, בלי SDK) לשלב ה"עובדות" ─────────────────────────
   Gemini מכסה את הזנב-הארוך (דמויות/אירועים אזוטריים) טוב יותר מ-Claude, ולכן משמש
   לשלבים העובדתיים כדי למנוע confabulation (תדריך-עובדות ביצירה + "שפר עם AI").
   המפתח נקרא מ-env בלבד (GEMINI_API_KEY), לעולם לא בקוד. */

const GEMINI_MODEL = process.env.GEMINI_FACTS_MODEL || 'gemini-2.5-flash'

export function hasGeminiKey(): boolean {
  return !!process.env.GEMINI_API_KEY?.trim()
}

/* השער המשותף: Gemini-לעובדות מופעל רק כאשר GROUNDING=1 **וגם** יש מפתח (כמו PARALLEL_GEN).
   כבוי כברירת מחדל → כל הזרימות נשארות על Claude, בלי צורך במפתח. */
export function useGeminiForFacts(): boolean {
  return process.env.GROUNDING === '1' && hasGeminiKey()
}

/* קריאת טקסט פשוטה ל-Gemini: prompt יחיד → טקסט. זורק בכשל (הקורא אחראי ל-fallback). */
export async function callGeminiText(prompt: string, maxTokens = 3000): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY חסר ב-env')
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
}
