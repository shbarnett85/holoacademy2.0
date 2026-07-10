/* ── שלב עיגון עובדתי (fact-brief) לפני היצירה ──────────────────────────────────
   מתקן את "בעיית זרח ברנט": על נושאים אזוטריים (דמויות/אירועים לא-מפורסמים) Sonnet
   חסר את הידע וממציא פרטים בתוך העלילה. שלב זה מפיק תדריך עובדתי מאומת מ-Gemini
   (כיסוי זנב-ארוך טוב יותר) ומזריק אותו לתוכנית הלימוד — כך Sonnet כותב מעוגן.

   **כבוי כברירת מחדל.** מופעל רק כאשר GROUNDING=1 **וגם** יש GEMINI_API_KEY ב-env
   (שני התנאים) — כמו דפוס PARALLEL_GEN. best-effort: כל כשל → ממשיכים בלי עיגון,
   היצירה לא נופלת. המפתח נקרא מ-env בלבד, לעולם לא בקוד.

   מדידה (זרח ברנט): +~14ש׳ לטנציה, +~$0.006/הדמיה; ביטל את ה-confabulation. */
import { info, warn } from './log.js'
import { useGeminiForFacts, callGeminiText, hasGeminiKey } from './gemini.js'
import type { QuestGenerationParams } from '../prompts/questPrompt.js'

/* השער משותף עם "שפר עם AI" — GROUNDING=1 + GEMINI_API_KEY (ראו lib/gemini.ts). */
export const groundingEnabled = useGeminiForFacts

const BRIEF_PROMPT = (title: string, curriculum: string) =>
  `אתה חוקר עובדתי מדייק המסייע ביצירת שיעור לילדים. לפניך נושא. אם הוא כולל דמות, מקום, אירוע או נתון היסטורי/עובדתי ספציפי — ספק תדריך של 4-8 עובדות **מאומתות** (שנות חיים/תאריכים, מקומות, עיסוק/תפקיד אמיתי, תרומה היסטורית). עובדות ודאיות בלבד — אם אינך בטוח בעובדה, אל תכלול אותה, ולעולם אל תמציא. אם הנושא מופשט או מיומנות כללית (למשל שברים, דקדוק, מחזור המים) וללא עובדות ספציפיות לאמת — החזר בדיוק את המילה: NONE\n\nכותרת: ${title}\nתוכן: ${curriculum}`

/* מחזיר params עם תוכנית-לימוד מועשרת בעובדות מאומתות. כבוי / כשל / נושא-מופשט → params כמו שהם. */
export async function groundCurriculum(params: QuestGenerationParams): Promise<QuestGenerationParams> {
  if (!groundingEnabled()) {
    /* אבחון: מסביר בדיוק למה מדולג (ערך ה-flag + נוכחות המפתח) — לזיהוי בעיות env בפרוד. */
    info(`[grounding] מדולג · GROUNDING=${JSON.stringify(process.env.GROUNDING ?? null)} · מפתח Gemini=${hasGeminiKey() ? 'קיים' : 'חסר'}`)
    return params
  }
  const t0 = Date.now()
  try {
    const brief = await callGeminiText(BRIEF_PROMPT(params.title, params.curriculum))
    if (!brief || /^NONE\b/i.test(brief)) {
      info(`[grounding] אין עובדות ספציפיות לעגן (${Date.now() - t0}ms) — ממשיך כרגיל`)
      return params
    }
    info(`[grounding] ✓ תדריך עובדות הוזרק (${Date.now() - t0}ms · ${brief.length} תווים)`)
    return {
      ...params,
      curriculum: `${params.curriculum}\n\n[עובדות מאומתות לשילוב — דבק בהן במדויק, אל תסטה ואל תוסיף עובדות שאינן כאן]:\n${brief}`,
    }
  } catch (e) {
    warn('[grounding] תדריך Gemini נכשל — ממשיך בלי עיגון:', e instanceof Error ? e.message : e)
    return params
  }
}
