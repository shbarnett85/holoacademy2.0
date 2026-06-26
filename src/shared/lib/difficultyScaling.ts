/* ──────────────────────────────────────────────────────────────────────────
   כיול קושי מרכזי ל-HoloAcademy — **סקאלת 1–20 מאוחדת** (מפרט scale_20).

   מנעד ענק על 20 רמות: רמה 1 = תחתית מוחלטת (טריוויאלי), רמה 20 = תקרה מוחלטת
   (גם תלמיד חזק מאוד לא עובר בקלות). שכבות הגיל ממופות גן=4 … י"ג=17 (ראו
   difficultyCalibration). שני פרופילי עקומה:
   - **חידות — ליניארי**: כל הפרמטרים נעים במרווחים שווים על פני 1–20.
   - **כתיבה/קריאה — לא-ליניארי**: מרווחים גדולים בנמוך, צפופים בגבוה (התפתחות
     קריאה — קפיצה גדולה בהתחלה, רוויה בהמשך). ראו narrativeStyleSpec.

   הקובץ pure (ללא DOM/Node), משמש את הקליינט (פאזל/חיפוש מילים/השלמה) ואת
   questPrompt.ts בשרת.
   ────────────────────────────────────────────────────────────────────────── */

export const SCALE_MIN = 1
export const SCALE_MAX = 20

export function clampLevel(level: number | undefined): number {
  const n = Math.round(Number(level))
  if (!Number.isFinite(n)) return 10
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, n))
}

/* פריסה ליניארית של ערך על פני 1–20 → [from..to] (לפרמטרי חידות) */
function lerp20(level: number, from: number, to: number): number {
  const l = clampLevel(level)
  return from + ((l - 1) / (SCALE_MAX - 1)) * (to - from)
}

/* תווית לכותרת הפרומפט */
export function difficultyLabel(level: number): string {
  const l = clampLevel(level)
  const band = l <= 4 ? 'קל מאוד' : l <= 8 ? 'קל' : l <= 12 ? 'בינוני' : l <= 16 ? 'קשה' : 'קשה מאוד'
  return `${l}/20 (${band})`
}

/* ── תקציב פסילות/ניסיונות — **קבוע בכל הרמות** (לא תלוי-רמה) ──
   הרמה משנה רק את גודל/מורכבות האתגר (זוגות/חלקים/אורך רצף/קושי המילה), לא את
   מספר הפסילות — הוגנות נתפסת. הפסילות עדיין נספרות לכיול 60/80; רק התקרה קבועה.
   קבועים מרוכזים כאן לכיוונון קל. */
export const FAIL_BUDGET = {
  memoryMistakes: 10,
  tileSwapBadSwaps: 5,
  wordCompletionAttempts: 3,
  sequenceOrderAttempts: 3,
  hangmanWrong: 6,
} as const

/* אורך משפט מרבי מומלץ (מילים) — **לוולידציה תוכנתית רכה בלבד**, לא מוזרק לפרומפט.
   לא-ליניארי: עולה מהר בנמוך, מתרווח בגבוה. */
export function maxSentenceWords(level: number): number {
  const l = clampLevel(level)
  if (l <= 4) return 8
  if (l <= 8) return 12
  if (l <= 12) return 18
  if (l <= 16) return 26
  return 40
}

/* ── קצב אפקט ההקלדה (typewriter) לפי רמת הקריאה (1–20) ──
   נמוך = איטי, גבוה = מהיר. רצפה/תקרה כדי שאף קצה לא יהיה קיצוני. */
export const TYPING_MS_SLOW = 45 /* רמה 1 — האיטי ביותר */
export const TYPING_MS_FAST = 12 /* רמה 20 — המהיר ביותר */
export function typingDelayMs(scale: number): number {
  return Math.round(lerp20(scale, TYPING_MS_SLOW, TYPING_MS_FAST))
}

/* ── רמת ניסוח הנרטיב (1–20) — לא-ליניארי, הוראת-מטרה ──
   מרווחים גדולים בנמוך (גן→א'→ב' שינוי גדול), צפופים בגבוה (י'→י"א→י"ב עדין).
   מתואר כמטרה (עברית תקנית וברורה לשכבה X) ולא כטכניקה — מפיק עברית טבעית יותר.
   תקניות היא דרישת-על בכל הרמות. */
export function narrativeStyleSpec(level: number): string {
  const l = clampLevel(level)
  if (l <= 3)
    return `כתוב עברית **פשוטה מאוד, תקנית וברורה** לגיל הרך. משפטים קצרים ושלמים (לא טלגרפיים), מילים יומיומיות בלבד, רעיון אחד בכל משפט, מוחשי וישיר. דוגמת טון: "הזקן קם. הוא הראה לכם כד ישן. בתוך הכד יש סוד."`
  if (l <= 5)
    return `כתוב עברית **פשוטה, תקנית וברורה** שילד בגן/כיתה א' יבין בקלות. משפטים קצרים אך שלמים וזורמים, מילים מוכרות, רעיון אחד בכל פעם, בהיר וקונקרטי. דוגמת טון: "הזקן קם והוביל אתכם אל כד חרס ישן מאחורי הספסל. הוא לחש שבתוכו מסתתרת תוכנית סודית."`
  if (l <= 7)
    return `כתוב עברית **תקנית וזורמת** לכיתות ב'–ג'. משפטים קצרים-בינוניים, אוצר מילים יסודי, מותר מונח אחד עם הסבר קצר. טבעי וברור. דוגמת טון: "הזקן קם וניגש אל כד חרס עתיק שהסתתר מאחורי הספסל. בקול נרגש הוא סיפר שבתוכו טמונה תוכנית סודית."`
  if (l <= 10)
    return `כתוב עברית **תקנית וזורמת** לכיתות ד'–ו'. משפטים בינוניים, אוצר מילים סטנדרטי, מותרים מונחי תוכן עם הקשר. קריא וטבעי. דוגמת טון: "הזקן ניגש אל כד החרס שמאחורי הספסל, ובקול נרגש סיפר שבתוכו טמונה תוכנית סודית שתכריע את גורל המערכה."`
  if (l <= 13)
    return `כתוב עברית **תקנית, עשירה אך עכשווית וחיה** לחטיבת הביניים. משפטים מורכבים יותר ואוצר מילים רחב, מותרים מונחים מקצועיים בהקשר — אבל **שפה של היום, לא רגיסטר ספרותי-ארכאי או מליצי**. דוגמת טון (מורכב אך עכשווי): "במרכז הזירה עמד הנאשם, ושלוש עדויות סותרות ריחפו באוויר. השופט ידע שכל החלטה כאן תשנה את חייו של מישהו."`
  return `כתוב עברית **עשירה, מדויקת, בהירה — ועכשווית** לתיכון ומעלה. הקושי חי ב**עומק הרעיון**, לא במילון ולא בקישוט לשוני.
**אסור רגיסטר ארכאי-מליצי** — לא "קופאות אתכם", לא "חייה תלויים בשיער דק", לא "בהדר עתיק", לא "לבה דופקת מתוך טקס עגום". כתוב כך שבן נוער ב-2026 ירצה לקרוא: בהיר, חד, מדויק.
**עמק ברעיון אחד — אל תדחוס אירועים רבים בפסקה אחת.** אם אפשר לפשט את הניסוח בלי לאבד את האתגר המחשבתי, פשט.
דוגמת טון (מורכב אך עכשווי): "מי שמחזיק בכתר מחזיק בכוח — אבל גם בסכנה. כל בעל ברית באולם הזה יכול להפוך ליריב ברגע שהמאזן זז, ואליזבת מבינה את זה טוב מכולם."`
}

/* ── רב-ברירה / מבחן סיכום (ליניארי על 1–20) ── */
export interface ChoiceScale {
  optionCount: number
  guidance: string
}

export function scaleMultipleChoice(level: number): ChoiceScale {
  const l = clampLevel(level)
  const optionCount = l <= 4 ? 3 : l <= 8 ? 4 : l <= 16 ? 5 : 6
  const guidance =
    l <= 4
      ? 'עומק רעיון מינימלי — עובדה/הגדרה בסיסית אחת. המסיחים שגויים בעליל (אבסורדיים כמעט) וקל לפסול אותם בלי ידע.'
      : l <= 8
        ? 'רעיון ברמת הבנה בסיסית (סיבה-תוצאה פשוטה). מסיח אחד נשמע סביר אך נפסל בידע בסיסי.'
        : l <= 12
          ? 'רעיון בעל כמה שכבות — דורש הבנה אמיתית וקישור. המסיחים סבירים ודורשים ידע מדויק כדי לפסול.'
          : l <= 16
            ? 'רעיון מופשט הדורש ניתוח/יישום/השוואה בין מושגים. מסיחים מתעתעים הקרובים לתשובה (טעויות תפיסה נפוצות).'
            : 'הרעיון בשיא עומקו — מתח/ניואנס/חשיבה ביקורתית בין מושגים קרובים. מסיחים שכמעט נכונים, הבחנה דקה מאוד שגם תלמיד חזק עלול לפספס.'
  return { optionCount, guidance }
}

export function scaleFinalQuiz(level: number): ChoiceScale {
  const base = scaleMultipleChoice(level)
  return { optionCount: base.optionCount, guidance: base.guidance + ' השאלות אינטגרטיביות ומחברות בין נושאים שונים בהדמיה.' }
}

/* ── נכון / לא נכון ── */
export function scaleTrueFalse(level: number): { guidance: string } {
  const l = clampLevel(level)
  const guidance =
    l <= 4
      ? 'הצהרה על עובדה בסיסית אחת, ברורה לחלוטין — קל מאוד לשפוט.'
      : l <= 8
        ? 'הצהרה הנשענת על עובדה מוכרת, עם שיפוט פשוט.'
        : l <= 12
          ? 'הצהרה הדורשת ידע מדויק והבנת הקשר כדי לשפוט.'
          : l <= 16
            ? 'הצהרה רב-שכבתית עם ניואנס — חלקה נכון וחלקה לא, דורשת הבחנה מושגית.'
            : 'ניואנס עדין מאוד: טעות תפיסה נפוצה שנשמעת נכונה לחלוטין, או דיוק מושגי שגם תלמיד חזק עלול לפספס.'
  return { guidance }
}

/* ── פאזל הזזה — ליניארי: 2x2 (רמה 1) → 6x6 (רמה 20). תקציב "החלפות גרועות" יורד. */
export function scaleTileSwap(level: number): { gridSize: number; maxBadSwaps: number } {
  const l = clampLevel(level)
  const gridSize = Math.round(lerp20(l, 2, 6)) /* 2 → 6 — הרמה משנה רק את גודל הרשת */
  return { gridSize, maxBadSwaps: FAIL_BUDGET.tileSwapBadSwaps } /* פסילות קבועות */
}

/* ── חיפוש מילים (ליניארי) ── */
export type WordSearchDir = 'horizontal' | 'vertical' | 'reverse' | 'diagonal'
export interface WordSearchScale {
  gridSize: number
  wordCount: number
  directions: WordSearchDir[]
  timeSec: number
  decoyBias: number
  guidance: string
}

export function scaleWordSearch(level: number): WordSearchScale {
  const l = clampLevel(level)
  const gridSize = Math.round(lerp20(l, 6, 18)) /* 6 → 18 */
  const wordCount = Math.round(lerp20(l, 3, 14)) /* 3 → 14 */
  const timeSec = Math.round(lerp20(l, 300, 45)) /* 300 → 45 */
  const decoyBias = Math.round(lerp20(l, 0, 0.85) * 100) / 100 /* 0 → 0.85 */
  const directions: WordSearchDir[] =
    l <= 4
      ? ['horizontal']
      : l <= 8
        ? ['horizontal', 'vertical']
        : l <= 12
          ? ['horizontal', 'vertical', 'reverse']
          : ['horizontal', 'vertical', 'reverse', 'diagonal']
  const guidance =
    l <= 6
      ? 'מילות מפתח בסיסיות, קצרות ובולטות מחומר הלימוד.'
      : l <= 12
        ? 'מילים מרכזיות מחומר הלימוד, חלקן ארוכות יותר.'
        : 'מילים ארוכות/נדירות ומדויקות מחומר הלימוד — מושגי ליבה, לא מילות קישור.'
  return { gridSize, wordCount, directions, timeSec, decoyBias, guidance }
}

/* ── זיכרון (ליניארי): 2 זוגות + 12 פסילות → 14 זוגות + פסילה 1 ── */
export function scaleMemory(level: number): { pairCount: number; maxMistakes: number; guidance: string } {
  const l = clampLevel(level)
  const pairCount = Math.round(lerp20(l, 2, 14)) /* 2 → 14 — הרמה משנה רק את מספר הזוגות */
  const maxMistakes = FAIL_BUDGET.memoryMistakes /* פסילות קבועות */
  const guidance =
    l <= 6
      ? 'התאמת מושג↔הגדרה קצרה וברורה מאוד; הזוגות שונים זה מזה בעליל.'
      : l <= 12
        ? 'התאמת מושג↔הגדרה מדויקת הדורשת הבנה (לא חזרה מילולית).'
        : 'התאמת מושג↔הגדרה הדורשת ידע אמיתי — לא זיכרון מיקום בלבד. כלול מושגים קרובים/דומים מאוד כך שצריך להבין לעומק את ההגדרה כדי להתאים נכון.'
  return { pairCount, maxMistakes, guidance }
}

/* ── השלמת מילים (ליניארי): חלל אחד + בנק 8 → 3 חללים + ללא בנק ── */
export function scaleWordCompletion(level: number): { wordBankSize: number; blankCount: number; maxAttempts: number; guidance: string } {
  const l = clampLevel(level)
  const wordBankSize = l <= 4 ? 8 : l <= 8 ? 6 : l <= 10 ? 5 : l <= 12 ? 4 : l <= 16 ? 3 : 0
  const blankCount = l <= 8 ? 1 : l <= 14 ? 2 : 3
  const maxAttempts = FAIL_BUDGET.wordCompletionAttempts /* ניסיונות קבועים */
  const guidance =
    l <= 6
      ? 'חלל אחד על מילת ליבה קלה, ובנק מילים נדיב ובולט.'
      : l <= 14
        ? 'חלל/ים על מושגים הדורשים הבנת ההקשר, ובנק מילים מצומצם עם מסיחים סבירים.'
        : 'מספר חללים על מושגים מדויקים/נדירים הדורשים שליטה עמוקה, ללא בנק מילים כלל (הקלדה חופשית).'
  return { wordBankSize, blankCount, maxAttempts, guidance }
}

/* ── חידת סדר (ליניארי): 3 פריטים → 9 פריטים ── */
export function scaleSequenceOrder(level: number): { itemCount: number; maxAttempts: number; guidance: string } {
  const l = clampLevel(level)
  const itemCount = Math.round(lerp20(l, 3, 9)) /* 3 → 9 — הרמה משנה רק את אורך הרצף */
  const maxAttempts = FAIL_BUDGET.sequenceOrderAttempts /* ניסיונות קבועים */
  const guidance =
    l <= 6
      ? 'מעט פריטים עם הבדלים גדולים וברורים ביניהם (קל מאוד למקם).'
      : l <= 12
        ? 'פריטים קרובים יחסית בזמן/בסדר — דורש ידע כדי למקם נכון.'
        : 'הרבה פריטים עם הבדלים עדינים מאוד (פרקי זמן קרובים/שלבים סמוכים) — גם תלמיד חזק עלול לטעות.'
  return { itemCount, maxAttempts, guidance }
}

/* ── שאלת מוסר (moralDilemma) — אין כיול 60/80. עומק נגזר מ-moralDilemmaDepth. ── */
export function scaleMoralDilemma(level: number): { choiceCount: number; guidance: string } {
  const l = clampLevel(level)
  const choiceCount = l <= 6 ? 2 : l <= 14 ? 3 : 4
  const guidance =
    l <= 6
      ? 'דילמה פשוטה וברורה — בחירה אחת "טובה" ואחת פחות, ברמה רגשית בסיסית (לחלוק/לא לחלוק, לעזור/להתעלם). ההשלכות ישירות ומובנות.'
      : l <= 14
        ? 'דילמה עם מתח אמיתי — לכל בחירה יש מחיר. אין אופציה "בטוחה" לגמרי; לפעמים הבחירה ה"מוסרית" מובילה לתוצאה מורכבת.'
        : 'קונפליקט ערכי עמוק (נאמנות מול צדק, הכלל מול הפרט, אמת מול חמלה) — טרייד-אופים אמיתיים ללא מוצא נקי. ההשלכות עשירות ולעיתים הבחירה ה"נכונה מוסרית" גובה את המחיר הגבוה ביותר.'
  return { choiceCount, guidance }
}

/* עומק הדילמה = min(רמת הגיל, רמת הטקסט) — שניהם כבר על 1–20. שני הצירים נדרשים
   (בשלות רגשית מהגיל + יכולת קוגניטיבית מהטקסט) — הנמוך קובע. עקיפת מורה גוברת. */
export function moralDilemmaDepth(ageLevel: number | undefined, textLevel: number | undefined, override?: number): number {
  if (override != null && Number.isFinite(override)) return clampLevel(override)
  const age = Number.isFinite(Number(ageLevel)) ? Number(ageLevel) : 8
  const text = Number.isFinite(Number(textLevel)) ? Number(textLevel) : 10
  return clampLevel(Math.min(age, text))
}

/* ── זיהוי קוד / hangman (ליניארי): 10 ניחושים + מושג מוכר → 2 ניחושים + מושג נדיר ── */
export function scaleHangman(level: number): { maxWrong: number; guidance: string } {
  const l = clampLevel(level)
  const maxWrong = FAIL_BUDGET.hangmanWrong /* ניסיונות קבועים (6); הרמה משנה רק את קושי המילה */
  const guidance =
    l <= 4
      ? 'מושג קצר ומוכר מאוד (3-5 אותיות), והרמז ישיר וכמעט חושף את התשובה.'
      : l <= 8
        ? 'מושג מוכר, רמז ברור.'
        : l <= 12
          ? 'מושג ברמת הבנה, רמז שדורש ידע.'
          : l <= 16
            ? 'מושג ארוך/פחות שכיח, ורמז עקיף שדורש חשיבה.'
            : 'מושג נדיר/ארוך מאוד, ורמז עקיף ומאתגר שגם תלמיד חזק יתקשה בו.'
  return { maxWrong, guidance }
}
