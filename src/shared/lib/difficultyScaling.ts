/* ──────────────────────────────────────────────────────────────────────────
   כיול קושי מרכזי ל-HoloAcademy — סקלה 1-10, **מנעד ענק ומכויל**.

   עקרון המנעד (חל על כל סוג אתגר):
   - רמה 1 (תחתית מוחלטת): טריוויאלית בכוונה — תלמיד עם יכולות נמוכות מאוד יצליח
     כמעט תמיד. מעט מאוד פריטים, תקציב טעויות נדיב מאוד, זמן כמעט בלתי-מוגבל.
   - רמה 10 (תקרה מוחלטת): מאתגרת עד שגם תלמיד חזק מאוד לא עובר בקלות ולא תמיד מצליח.
     הרבה מאוד פריטים, תקציב קמצן, זמן לחוץ.
   - 8 רמות הביניים: חלוקה הדרגתית ואחידה בין שני הקצוות — כל מדרגה מורגשת.
   - **כל הפרמטרים נעים יחד** לאורך המנעד. אין פרמטר קבוע — מנעד ענק דורש שכל מימד יזוז.

   קובץ זה הוא מקור האמת היחיד (קל לכוונן לפי נתונים אמיתיים בעתיד). הוא משמש:
   - את הקליינט (פאזל הזזה + חיפוש מילים + השלמת מילים) לחישוב פרמטרי תצוגה ותנאי כישלון.
   - את questPrompt.ts בשרת כדי שה-AI יפיק תוכן בקושי תואם (מבנה + **עומק מושגי**).

   דגש לתוכן (רב-ברירה/נכון-לא/סיכום/השלמה/נרטיב): המנעד הוא ב**עומק המושגי** של הרעיון
   הנלמד — לא בקישוט לשוני. השפה עולה כנגזרת טבעית מעומק הרעיון. ראו questPrompt.ts.

   הקובץ pure (ללא תלות ב-DOM/Node) כדי שיתקמפל בשני הצדדים.
   ────────────────────────────────────────────────────────────────────────── */

export function clampLevel(level: number | undefined): number {
  const n = Math.round(Number(level))
  if (!Number.isFinite(n)) return 5
  return Math.max(1, Math.min(10, n))
}

/* תווית לכותרת הפרומפט */
export function difficultyLabel(level: number): string {
  const l = clampLevel(level)
  const band = l <= 2 ? 'קל מאוד' : l <= 4 ? 'קל' : l <= 6 ? 'בינוני' : l <= 8 ? 'קשה' : 'קשה מאוד'
  return `${l}/10 (${band})`
}

/* ── רמת ניסוח הנרטיב (מקור אמת יחיד) ──
   קובעת את **השפה בפועל** לפי הרמה — לא רק מספר מופשט. עומק התוכן אינו יורד עם הרמה,
   רק המורכבות הלשונית. משמש גם ביצירה הבסיסית (questPrompt) וגם בהתאמה האישית (quests).
   הסקלה 1-10; text_level (1-16) ממופה דרך textLevelToScale. */

/* אורך משפט מרבי מומלץ (מילים) — לוולידציה פרוגרמטית ולהזרקה לפרומפט */
export function maxSentenceWords(level: number): number {
  const l = clampLevel(level)
  return l <= 2 ? 8 : l <= 4 ? 12 : l <= 6 ? 18 : l <= 8 ? 26 : 40
}

/* ממיר text_level (1-16) לסקלת הניסוח (1-10) */
export function textLevelToScale(textLevel: number): number {
  const t = Math.max(1, Math.min(16, Math.round(Number(textLevel) || 8)))
  return clampLevel(Math.round((t / 16) * 10))
}

/* מחוון ניסוח קונקרטי לרמה (1-10): אורך משפט, מורכבות תחבירית, אוצר מילים, צפיפות מידע */
export function narrativeStyleSpec(level: number): string {
  const l = clampLevel(level)
  if (l <= 2)
    return `משפטים קצרים מאוד — עד ~${maxSentenceWords(l)} מילים, רעיון אחד לכל משפט, ללא פסוקיות משועבדות. אוצר מילים יומיומי ושכיח בלבד: העדף פעלים פשוטים ("קם", "אומר", "הולך", "מראֶה") על פני ספרותיים ("מתרומם", "בקול רגש", "מוביל"). צפיפות מידע נמוכה — עובדה אחת למשפט. עברית תקנית וזורמת — פשוטה, לא קטועה ולא "טלגרפית".`
  if (l <= 4)
    return `משפטים קצרים — עד ~${maxSentenceWords(l)} מילים. מותר חיבור פשוט (ו/אבל/כי), אך לא שרשור פסוקיות. אוצר מילים יסודי ומוכר; מונח חדש מוסבר מיד במילים פשוטות. עד שני פרטי מידע למשפט.`
  if (l <= 6)
    return `משפטים בינוניים — עד ~${maxSentenceWords(l)} מילים, מותרת פסוקית משועבדת אחת. אוצר מילים סטנדרטי, מותרים מונחי תוכן עם הקשר. צפיפות מידע בינונית.`
  if (l <= 8)
    return `משפטים מורכבים אך **בהירים** (עד ~${maxSentenceWords(l)} מילים) — תחביר עשיר שמשרת בהירות, לא מתפתל לשם מורכבות. אוצר מילים מדויק ותחומי (מונחי התחום), לא ארכאי-לראווה. צפיפות מידע גבוהה אך קריאה. **הקושי חי בעומק הרעיון, לא בפיתול הלשון.**`
  return `שפה **בהירה, מדויקת וצפופה** — מוסרת רעיונות מופשטים ורב-שכבתיים בלי קישוט לשוני. אוצר מילים תחומי ומדויק (לא מילים גבוהות לראווה ולא תחביר מפותל); משפט יכול להיות ארוך אך תמיד ברור. **הקושי נובע אך ורק מעומק הרעיון, מההסקה הרב-שלבית ומהניואנס — לא מאוצר מילים או תחביר.** מבחן אנטי-קישוט: אם אפשר לפשט את הניסוח בלי לאבד את האתגר המחשבתי — פשט. אם פישוט הניסוח מבטל את הקושי, הקושי היה לשוני מזויף.`
}

/* ── רב-ברירה / מבחן סיכום ── */
export interface ChoiceScale {
  optionCount: number
  guidance: string
}

export function scaleMultipleChoice(level: number): ChoiceScale {
  const l = clampLevel(level)
  const optionCount = l <= 2 ? 3 : l <= 4 ? 4 : l <= 8 ? 5 : 6
  const guidance =
    l <= 2
      ? 'עומק רעיון מינימלי — עובדה/הגדרה בסיסית אחת. המסיחים שגויים בעליל (אבסורדיים כמעט) וקל לפסול אותם בלי ידע.'
      : l <= 4
        ? 'רעיון ברמת הבנה בסיסית (סיבה-תוצאה פשוטה). מסיח אחד נשמע סביר אך נפסל בידע בסיסי.'
        : l <= 6
          ? 'רעיון בעל כמה שכבות — דורש הבנה אמיתית וקישור. המסיחים סבירים ודורשים ידע מדויק כדי לפסול.'
          : l <= 8
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
    l <= 2
      ? 'הצהרה על עובדה בסיסית אחת, ברורה לחלוטין — קל מאוד לשפוט.'
      : l <= 4
        ? 'הצהרה הנשענת על עובדה מוכרת, עם שיפוט פשוט.'
        : l <= 6
          ? 'הצהרה הדורשת ידע מדויק והבנת הקשר כדי לשפוט.'
          : l <= 8
            ? 'הצהרה רב-שכבתית עם ניואנס — חלקה נכון וחלקה לא, דורשת הבחנה מושגית.'
            : 'ניואנס עדין מאוד: טעות תפיסה נפוצה שנשמעת נכונה לחלוטין, או דיוק מושגי שגם תלמיד חזק עלול לפספס.'
  return { guidance }
}

/* ── פאזל הזזה — מנעד ענק: 2x2 (4 חלקים, טריוויאלי) → 6x6 (36 חלקים) ──
   גודל הרשת נע ליניארית 2→6, ותקציב ה"החלפות הגרועות" נע מנדיב מאוד לקמצן. */
export function scaleTileSwap(level: number): { gridSize: number; maxBadSwaps: number } {
  const l = clampLevel(level)
  const gridSize = Math.round(2 + ((l - 1) / 9) * 4) /* 2 → 6 */
  /* תנאי כישלון: "החלפה גרועה" = שני האריחים נשארו לא במקומם. המקדם צונח חדות עם הרמה
     (נדיב מאוד ברמה 1, קמצן ברמה 10), ומתחשב בגודל הרשת (רשת גדולה דורשת יותר החלפות). */
  const count = gridSize * gridSize
  const mult = l <= 2 ? 2.5 : l <= 4 ? 1.6 : l <= 6 ? 1.0 : l <= 8 ? 0.6 : 0.35
  const maxBadSwaps = Math.max(2, Math.round(count * mult))
  return { gridSize, maxBadSwaps }
}

/* ── חיפוש מילים ── */
export type WordSearchDir = 'horizontal' | 'vertical' | 'reverse' | 'diagonal'
export interface WordSearchScale {
  gridSize: number
  wordCount: number
  directions: WordSearchDir[]
  /* תנאי כישלון: טיימר (שניות) — נדיב מאוד ברמה נמוכה, לחוץ בגבוהה */
  timeSec: number
  /* צפיפות אותיות מבלבלות: 0 = מילוי אקראי לגמרי; 1 = המילוי שואב מאותיות המילים (מבלבל) */
  decoyBias: number
  guidance: string
}

/* מנעד ענק: רשת 6x6 / 3 מילים / אופקי בלבד / 5 דקות (טריוויאלי) →
   רשת 18x18 / 14 מילים / כל הכיוונים / 45ש׳ / מילוי מבלבל מאוד. כל מימד נע יחד. */
export function scaleWordSearch(level: number): WordSearchScale {
  const l = clampLevel(level)
  const gridSize = Math.round(6 + ((l - 1) / 9) * 12) /* 6 → 18 */
  const wordCount = Math.round(3 + ((l - 1) / 9) * 11) /* 3 → 14 */
  const timeSec = Math.round(300 - ((l - 1) / 9) * 255) /* 300 → 45 */
  const decoyBias = Math.round(((l - 1) / 9) * 85) / 100 /* 0 → 0.85 */
  const directions: WordSearchDir[] =
    l <= 2
      ? ['horizontal']
      : l <= 4
        ? ['horizontal', 'vertical']
        : l <= 6
          ? ['horizontal', 'vertical', 'reverse']
          : ['horizontal', 'vertical', 'reverse', 'diagonal']
  const guidance =
    l <= 3
      ? 'מילות מפתח בסיסיות, קצרות ובולטות מחומר הלימוד.'
      : l <= 6
        ? 'מילים מרכזיות מחומר הלימוד, חלקן ארוכות יותר.'
        : 'מילים ארוכות/נדירות ומדויקות מחומר הלימוד — מושגי ליבה, לא מילות קישור.'
  return { gridSize, wordCount, directions, timeSec, decoyBias, guidance }
}

/* ── זיכרון — מנעד ענק: 2 זוגות + 12 פסילות (טריוויאלי) → 14 זוגות + פסילה 1 ──
   מורכבות התוכן של הזוגות עולה עם הרמה (וכפופה גם ל-text_level — ראו difficultyCalibration). */
export function scaleMemory(level: number): { pairCount: number; maxMistakes: number; guidance: string } {
  const l = clampLevel(level)
  const pairCount = Math.round(2 + ((l - 1) / 9) * 12) /* 2 → 14 */
  const maxMistakes = Math.max(1, Math.round(12 - ((l - 1) / 9) * 11)) /* 12 → 1 */
  const guidance =
    l <= 3
      ? 'התאמת מושג↔הגדרה קצרה וברורה מאוד; הזוגות שונים זה מזה בעליל.'
      : l <= 6
        ? 'התאמת מושג↔הגדרה מדויקת הדורשת הבנה (לא חזרה מילולית).'
        : 'התאמת מושג↔הגדרה הדורשת ידע אמיתי — לא זיכרון מיקום בלבד. כלול מושגים קרובים/דומים מאוד כך שצריך להבין לעומק את ההגדרה כדי להתאים נכון.'
  return { pairCount, maxMistakes, guidance }
}

/* ── השלמת מילים — מנעד ענק: חלל אחד + בנק 8 (טריוויאלי) → 3 חללים + ללא בנק ──
   blankCount = מספר החללים (___) במשפט; wordBankSize = גודל בנק המילים (0 = הקלדה חופשית). */
export function scaleWordCompletion(level: number): { wordBankSize: number; blankCount: number; maxAttempts: number; guidance: string } {
  const l = clampLevel(level)
  const wordBankSize = l <= 2 ? 8 : l <= 4 ? 6 : l <= 5 ? 5 : l <= 6 ? 4 : l <= 8 ? 3 : 0
  const blankCount = l <= 4 ? 1 : l <= 7 ? 2 : 3
  /* תנאי כישלון: מספר נסיונות שגויים מותרים לפני כישלון (4 → 1) */
  const maxAttempts = Math.max(1, Math.round(4 - ((l - 1) / 9) * 3))
  const guidance =
    l <= 3
      ? 'חלל אחד על מילת ליבה קלה, ובנק מילים נדיב ובולט.'
      : l <= 7
        ? 'חלל/ים על מושגים הדורשים הבנת ההקשר, ובנק מילים מצומצם עם מסיחים סבירים.'
        : 'מספר חללים על מושגים מדויקים/נדירים הדורשים שליטה עמוקה, ללא בנק מילים כלל (הקלדה חופשית).'
  return { wordBankSize, blankCount, maxAttempts, guidance }
}

/* ── חידת סדר — מנעד ענק: 3 פריטים נדיבים (טריוויאלי) → 9 פריטים עדינים מאוד ── */
export function scaleSequenceOrder(level: number): { itemCount: number; maxAttempts: number; guidance: string } {
  const l = clampLevel(level)
  const itemCount = Math.round(3 + ((l - 1) / 9) * 6) /* 3 → 9 */
  /* תנאי כישלון: מספר נסיונות הגשה שגויים מותרים לפני כישלון (4 → 1) */
  const maxAttempts = Math.max(1, Math.round(4 - ((l - 1) / 9) * 3))
  const guidance =
    l <= 3
      ? 'מעט פריטים עם הבדלים גדולים וברורים ביניהם (קל מאוד למקם).'
      : l <= 6
        ? 'פריטים קרובים יחסית בזמן/בסדר — דורש ידע כדי למקם נכון.'
        : 'הרבה פריטים עם הבדלים עדינים מאוד (פרקי זמן קרובים/שלבים סמוכים) — גם תלמיד חזק עלול לטעות.'
  return { itemCount, maxAttempts, guidance }
}

/* ── שאלת מוסר (moralDilemma) — אין כיול 60/80 (אין הצלחה/כישלון). ──
   עומק הדילמה נגזר מ-min(רמת הגיל, text_level) — ראו moralDilemmaDepth. במנעד:
   רמה נמוכה = בחירה פשוטה וברורה (לחלוק/לא לחלוק); גבוהה = טרייד-אופים אמיתיים וקונפליקט ערכי. */
export function scaleMoralDilemma(level: number): { choiceCount: number; guidance: string } {
  const l = clampLevel(level)
  const choiceCount = l <= 3 ? 2 : l <= 7 ? 3 : 4
  const guidance =
    l <= 3
      ? 'דילמה פשוטה וברורה — בחירה אחת "טובה" ואחת פחות, ברמה רגשית בסיסית (לחלוק/לא לחלוק, לעזור/להתעלם). ההשלכות ישירות ומובנות.'
      : l <= 7
        ? 'דילמה עם מתח אמיתי — לכל בחירה יש מחיר. אין אופציה "בטוחה" לגמרי; לפעמים הבחירה ה"מוסרית" מובילה לתוצאה מורכבת.'
        : 'קונפליקט ערכי עמוק (נאמנות מול צדק, הכלל מול הפרט, אמת מול חמלה) — טרייד-אופים אמיתיים ללא מוצא נקי. ההשלכות עשירות ולעיתים הבחירה ה"נכונה מוסרית" גובה את המחיר הגבוה ביותר.'
  return { choiceCount, guidance }
}

/* עומק הדילמה = min(רמת הגיל, text_level), מומר לסקלת 1-10.
   ageLevel = שכבה (1-12, מ-grade_label); textLevel = רמת הטקסט (1-16). שני הצירים נדרשים:
   בשלות רגשית (גיל) ויכולת קוגניטיבית (טקסט) — הנמוך קובע. עקיפת מורה גוברת על שניהם. */
export function moralDilemmaDepth(ageLevel: number | undefined, textLevel: number | undefined, override?: number): number {
  if (override != null && Number.isFinite(override)) return clampLevel(override)
  const age = Number.isFinite(Number(ageLevel)) ? Number(ageLevel) : 6
  const text = Number.isFinite(Number(textLevel)) ? Number(textLevel) : 8
  /* גיל 1-12 → 1-10 ; טקסט 1-16 → 1-10, ואז הנמוך */
  const ageScaled = (age / 12) * 10
  const textScaled = (text / 16) * 10
  return clampLevel(Math.min(ageScaled, textScaled))
}

/* ── זיהוי קוד / hangman — מנעד ענק: 10 ניחושים + מושג קצר מוכר (טריוויאלי) →
   2 ניחושים + מושג נדיר/ארוך ורמז עקיף. גם מספר הניחושים וגם אופי המושג/הרמז נעים. */
export function scaleHangman(level: number): { maxWrong: number; guidance: string } {
  const l = clampLevel(level)
  const maxWrong = Math.max(2, Math.round(10 - ((l - 1) / 9) * 8)) /* 10 → 2 */
  const guidance =
    l <= 2
      ? 'מושג קצר ומוכר מאוד (3-5 אותיות), והרמז ישיר וכמעט חושף את התשובה.'
      : l <= 4
        ? 'מושג מוכר, רמז ברור.'
        : l <= 6
          ? 'מושג ברמת הבנה, רמז שדורש ידע.'
          : l <= 8
            ? 'מושג ארוך/פחות שכיח, ורמז עקיף שדורש חשיבה.'
            : 'מושג נדיר/ארוך מאוד, ורמז עקיף ומאתגר שגם תלמיד חזק יתקשה בו.'
  return { maxWrong, guidance }
}
