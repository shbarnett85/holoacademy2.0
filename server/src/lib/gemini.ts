/* ── קליינט Gemini משותף (REST, בלי SDK) לשלב ה"עובדות" ─────────────────────────
   Gemini מכסה את הזנב-הארוך (דמויות/אירועים אזוטריים) טוב יותר מ-Claude, ולכן משמש
   לשלבים העובדתיים כדי למנוע confabulation (תדריך-עובדות ביצירה + "שפר עם AI").
   המפתח נקרא מ-env בלבד (GEMINI_API_KEY), לעולם לא בקוד. */

const FACTS_MODEL = process.env.GEMINI_FACTS_MODEL || 'gemini-2.5-flash'
/* מודל התוכן (יצירה/ולידציה/בטיחות) — ניתן להגדרה נפרדת מ-FACTS_MODEL. */
const CONTENT_MODEL = process.env.GEMINI_CONTENT_MODEL || 'gemini-2.5-flash'

export function hasGeminiKey(): boolean {
  return !!process.env.GEMINI_API_KEY?.trim()
}

/* ליבת הקריאה ל-Gemini: model + system אופציונלי + user → טקסט. retry על 429/5xx
   (עד 3, backoff לינארי), 4xx → כשל מיידי. זורק בכשל (הקורא אחראי לנסיגה/כשל-סגור). */
async function geminiCall(model: string, system: string | undefined, user: string, maxTokens: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY חסר ב-env')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  let lastErr = 'Gemini failed'
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
    }
    lastErr = `Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 120)}`
    if (res.status !== 429 && res.status < 500) break /* 4xx (מפתח/בקשה) — לא לחזור */
  }
  throw new Error(lastErr)
}

/* קריאת JSON (system+user) — ליצירה/ולידציה/בטיחות. תקציב פלט גדול (thinking של 2.5). */
export async function callGeminiJSON(system: string, user: string, maxTokens = 32000): Promise<string> {
  return geminiCall(CONTENT_MODEL, system, user, maxTokens)
}

/* השער המשותף: Gemini-לעובדות מופעל רק כאשר GROUNDING=1 **וגם** יש מפתח (כמו PARALLEL_GEN).
   כבוי כברירת מחדל → כל הזרימות נשארות על Claude, בלי צורך במפתח. */
export function useGeminiForFacts(): boolean {
  /* סובלני לערך ה-flag: "1"/"true"/"on"/"yes" (trim + case-insensitive) — מונע footgun
     של `GROUNDING=true`/רווח נסתר שלא תפס עם `=== '1'` נוקשה. */
  const flag = (process.env.GROUNDING ?? '').trim().toLowerCase()
  return (flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes') && hasGeminiKey()
}

/* קריאת טקסט פשוטה ל-Gemini: prompt יחיד → טקסט. זורק בכשל (הקורא אחראי ל-fallback).
   retry על שגיאות חולפות (429/5xx — flash נוטה ל-503 בעומס) כדי שלא ליפול לחינם
   חזרה ל-Claude הלא-מעוגן. עד 3 ניסיונות עם backoff לינארי; 4xx אחר → כשל מיידי. */
/* maxTokens נדיב כברירת מחדל: ל-Gemini 2.5 (במיוחד Pro) יש "thinking" שצורך מתוך
   maxOutputTokens לפני הפלט — תקציב קטן מדי חותך את התשובה לאמצע. */
export async function callGeminiText(prompt: string, maxTokens = 8000): Promise<string> {
  return geminiCall(FACTS_MODEL, undefined, prompt, maxTokens)
}
