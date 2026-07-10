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
  `אתה חוקר עובדתי מדייק המסייע ביצירת שיעור לילדים. לפניך נושא. אם הוא כולל דמות, מקום, אירוע או נתון היסטורי/עובדתי ספציפי — ספק תדריך של 4-8 עובדות **מאומתות**:
- שנת לידה ושנת פטירה, **וגיל בפטירה** אם ניתן לחשב.
- מקומות — **הבחן בין מקום לידה, מקומות שאליהם עבר במהלך חייו, ומקום פטירה** (אנשים עוברים דירה; אל תניח שחיו כל חייהם במקום אחד).
- עיסוק/תפקיד אמיתי ותרומה היסטורית.
עובדות ודאיות בלבד. אם אינך בטוח בפרט מסוים — **במיוחד מקום לידה מדויק של דמות אזוטרית** — אל תכלול אותו או ציין "אינו ודאי", ולעולם אל תנחש/תמציא. אם הנושא מופשט או מיומנות כללית (שברים, דקדוק, מחזור המים) וללא עובדות ספציפיות לאמת — החזר בדיוק את המילה: NONE\n\nכותרת: ${title}\nתוכן: ${curriculum}`

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
      curriculum: `${params.curriculum}\n\n[עובדות מאומתות — מקור האמת היחיד על הנושא הזה]:\n${brief}\n\n⚠ חוקי ברזל (מחייבים בכל הסצנות, כולל הסיום): השתמש אך ורק בעובדות מהרשימה למעלה. **אסור בהחלט להמציא** תאריכים, שנים, גילאים, מקום לידה, מקומות מגורים, או כל פרט ביוגרפי שאינו מופיע ברשימה. אם פרט חסר — כתוב סביבו בלי להמציא אותו (אל תנקוב בגיל/שנה/מקום שאינם למעלה). אל תניח שהדמות חיה כל חייה במקום אחד או הגיעה לגיל מסוים — אלא אם כן זה כתוב מפורשות.`,
    }
  } catch (e) {
    warn('[grounding] תדריך Gemini נכשל — ממשיך בלי עיגון:', e instanceof Error ? e.message : e)
    return params
  }
}
