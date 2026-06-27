/* בניית הפרומפט ליצירת GameData של משחק לומדה בעברית */

import {
  clampLevel,
  difficultyLabel,
  scaleMultipleChoice,
  scaleFinalQuiz,
  scaleTrueFalse,
  scaleTileSwap,
  scaleWordSearch,
  scaleMemory,
  scaleWordCompletion,
  scaleSequenceOrder,
  scaleHangman,
  scaleMoralDilemma,
  narrativeStyleSpec,
} from '../../../src/shared/lib/difficultyScaling.js'
import { levelToGradeLabel } from '../../../src/shared/lib/difficultyCalibration.js'

export interface PuzzlePreferences {
  /* אילו סוגי חידות פעילים */
  types?: Record<string, boolean>
  /* כמה חידות מכל סוג */
  counts?: Record<string, number>
}

/* צורת הפנייה לתלמיד (form of address) — נקבעת מראש ב-pre-generation, לא מנוע נטיות בזמן ריצה.
   male = זכר יחיד · female = נקבה יחיד · plural = רבים (הצורה הניטרלית + מצב כיתתי/מקרן). */
export type FormOfAddress = 'male' | 'female' | 'plural'

export interface QuestGenerationParams {
  title: string
  curriculum: string
  questLength: number
  puzzlePreferences?: PuzzlePreferences
  difficultySettings?: Record<string, unknown>
  includeDrHolo?: boolean
  artStyle?: string
  questType?: string
  /* ברירת מחדל: plural (ניטרלי/כיתתי). male/female ליצירת וריאציה אישית ממוגדרת. */
  formOfAddress?: FormOfAddress
}

/* כלל הניסוח הדקדוקי — מוזרק לפרומפט וגם משמש את שכתוב הווריאציה האישית (haiku). */
export function formOfAddressRule(form: FormOfAddress): string {
  switch (form) {
    case 'male':
      return 'פנה אל התלמיד בכל הטקסט בלשון **זכר יחיד** ("אתה מגיע", "בחרת", "גילית", "המשך"). עקבי לכל אורך ההדמיה.'
    case 'female':
      return 'פנה אל התלמידה בכל הטקסט בלשון **נקבה יחידה** ("את מגיעה", "בחרת", "גילית", "המשיכי"). עקבי לכל אורך ההדמיה.'
    case 'plural':
    default:
      return 'פנה אל התלמידים בכל הטקסט בלשון **רבים** ("אתם מגיעים", "בחרתם", "גיליתם", "המשיכו") — זו הצורה הניטרלית והכיתתית. בעברית אין גוף שני יחיד ניטרלי, ולכן רבים. **אסור** ניסוחי "את/ה" עם לוכסנים או כפל-מין.'
  }
}

/* בלוק הפנייה לפרומפט המלא */
function formOfAddressInstructions(form: FormOfAddress): string {
  return `
## צורת הפנייה לתלמיד (קריטי — עקביות מוחלטת!)
${formOfAddressRule(form)}
הכלל חל על **כל** הטקסט הפונה לתלמיד: נרטיב, שאלות חידה, הסברים, דיאלוג ד"ר הולו, טקסטי בחירה, ההשלכות וסצנות הסיום. אין לערבב צורות.`
}

/* שמות סוגי החידות בעברית — לשימוש בפרומפט */
const PUZZLE_TYPE_NAMES: Record<string, string> = {
  multipleChoice: 'שאלות רב-ברירה',
  trueFalse: 'נכון/לא נכון',
  itemUsage: 'שימוש במפתח (מפתח + שער נעול)',
  tileSwap: 'פאזל הזזה',
  wordSearch: 'חיפוש מילים',
  memory: 'משחק זיכרון',
  wordCompletion: 'השלמת מילים',
  sequenceOrder: 'חידת סדר',
  hangman: 'זיהוי קוד',
  moralDilemma: 'שאלת מוסר (דילמה ערכית)',
}

/* מפרט שדות ה-JSON לכל סוג אתגר — מותאם לרמת הקושי (מספרים מדויקים + הנחיית מורכבות) */
export function puzzleDataSpec(type: string, level: number): string {
  switch (type) {
    case 'multipleChoice': {
      const { optionCount, guidance } = scaleMultipleChoice(level)
      return `"type":"multipleChoice" — "question" + "choices":[{id,text,isCorrect}] (**בדיוק ${optionCount} תשובות**, אחת נכונה) + "explanationCorrect" + "explanationIncorrect". **קושי: ${guidance}**`
    }
    case 'trueFalse':
      return `"type":"trueFalse" — "question" (היגד) + "choices":[{id:"t",text:"נכון",isCorrect},{id:"f",text:"לא נכון",isCorrect}] + "explanationCorrect" + "explanationIncorrect". **קושי: ${scaleTrueFalse(level).guidance}**`
    case 'tileSwap': {
      const { gridSize } = scaleTileSwap(level)
      return `"type":"tileSwap" — "question" (הוראה קצרה, למשל "סדרו את התמונה"). הרשת תהיה **${gridSize}x${gridSize}** (נקבע אוטומטית לפי הקושי). הפאזל נבנה מתמונת הסצנה — ה-imagePrompt חייב להיות עשיר וברור.`
    }
    case 'wordSearch': {
      const { wordCount, guidance } = scaleWordSearch(level)
      return `"type":"wordSearch" — "question" (הוראה) + "words": מערך של **בדיוק ${wordCount} מילים** בעברית מחומר הלימוד (מילה בודדת, 2-8 אותיות, ללא רווחים/מקפים/ניקוד). ${guidance} (גודל הרשת וכיווני המילים נקבעים אוטומטית לפי הקושי).`
    }
    case 'memory': {
      const { pairCount, guidance } = scaleMemory(level)
      return `"type":"memory" — "question" (הוראה) + "pairs": מערך של **בדיוק ${pairCount} זוגות** {a,b}. a = מושג, b = הגדרה/תרגום **קצר** (1-4 מילים) כדי שייכנס בקלף. ${guidance}`
    }
    case 'wordCompletion': {
      const { wordBankSize, blankCount, guidance } = scaleWordCompletion(level)
      const blanksTxt =
        blankCount === 1
          ? 'המשפט מכיל **חלל אחד** (___) + "answer": המילה החסרה המדויקת'
          : `המשפט מכיל **בדיוק ${blankCount} חללים** (___ ___) על מושגי ליבה שונים + "answers": מערך של **בדיוק ${blankCount} מחרוזות** לפי סדר החללים (המילה המדויקת לכל חלל). אל תשתמש ב-"answer".`
      const bank =
        wordBankSize === 0
          ? '**אל תכלול "wordBank" כלל** (הקלדה חופשית — הרמה הגבוהה).'
          : `כלול "wordBank" עם **בדיוק ${wordBankSize} מילים** (כל התשובות + מסיחים סבירים).`
      return `"type":"wordCompletion" — "question" (הוראה) + "sentence": משפט מחומר הלימוד. ${blanksTxt}. ${bank} **קושי: ${guidance}**`
    }
    case 'sequenceOrder': {
      const { itemCount, guidance } = scaleSequenceOrder(level)
      const dateRule = level <= 8
        ? 'מותר לכלול את התאריך/השנה בגוף הפריט כעזר למיון (מתאים לרמה זו).'
        : '**אסור לחשוף את ערך הסידור** (שנה/מספר/תאריך מדויק) בגוף הפריט — ברמה זו האתגר חייב לבוא מהיכרות עם הרצף ההיסטורי/הסיבתי, לא מהשוואת מספרים גלויים. נסח כל פריט כתיאור האירוע/השלב בלבד, ללא השנה.'
      return `"type":"sequenceOrder" — "question" (הוראה) + "items": מערך של **בדיוק ${itemCount} פריטים** {id (snake_case אנגלי), text (עברית)} + "correctOrder": מערך ה-id-ים בסדר הנכון + "orderType": "chronological"/"logical"/"hierarchical". ה-items מחומר הלימוד; ודא ש-correctOrder נכון עובדתית. **בחר אירועים/שלבים עם סדר חד-משמעי ונבדל — אסור ששני פריטים יישבו על אותה נקודה בזמן/סדר (למשל שתי שנים זהות); לכל פריט מיקום ייחודי ברצף.** ${dateRule} **קושי: ${guidance}**`
    }
    case 'hangman': {
      const { maxWrong, guidance } = scaleHangman(level)
      return `"type":"hangman" — "question" (רמז שתשובתו מושג יחיד) + "answer": מושג ליבה בעברית, אותיות בלבד, רצוי מילה אחת ללא רווחים (למשל "דמוקרטיה") + "maxWrong": **${maxWrong}**. **קושי: ${guidance}**`
    }
    case 'moralDilemma': {
      const { choiceCount, guidance } = scaleMoralDilemma(level)
      return `"type":"moralDilemma" — דילמה ערכית **ללא תשובה נכונה** (אין correctIndex). "situation": תיאור הדילמה בנרטיב, **רלוונטי לחומר הלימוד ולתקופה/הקשר ההדמיה** (למשל בספרטה: לתת אוכל לילד רעב בידיעה שאם ייתפס ייענש). "moralChoices": מערך של **${choiceCount} אפשרויות**, כל אחת { "text": הבחירה, "consequence": טקסט ההשלכות שיוצג אחרי הבחירה }. **כל בחירה מתקבלת ומזכה בקריסטלים — אין כישלון.** ההשלכות יכולות להיות מורכבות: לפעמים הבחירה ה"מוסרית" מובילה דווקא לתוצאה גרועה יותר — זה **מכוון ורצוי** (ללמד שלהחלטות ערכיות יש מחיר ואין בחירה בטוחה). **עומק הדילמה: ${guidance}**`
    }
    default:
      return ''
  }
}

/* כותרת רמת הקושי הכללית בראש הנחיות האתגרים — עקרון המנעד הענק + עומק מושגי */
export function difficultyHeader(level: number): string {
  return `
## רמת קושי: ${difficultyLabel(level)} (קריטי!) — מנעד ענק
כל האתגרים, השאלות **והנרטיב** חייבים להתאים לרמה זו. עקרון המנעד:
- **רמה 1 (תחתית מוחלטת)**: טריוויאלי בכוונה — תלמיד עם יכולות נמוכות מאוד יצליח כמעט תמיד.
- **רמה 20 (תקרה מוחלטת)**: מאתגר עד שגם תלמיד חזק מאוד לא עובר בקלות ולא תמיד מצליח.
- ההפרש בין הרמות חייב להיות **עצום ומורגש בפועל**, לא דקויות. הפרמטרים המבניים (מספר פריטים/תשובות/חללים/זמן) כבר נקבעו במפרט כל אתגר — אתה אחראי על **עומק התוכן**.

### עומק מושגי — לב הכיול לתוכן (multipleChoice, trueFalse, finalQuiz, wordCompletion, והנרטיב)
המנעד כאן הוא ב**עומק הרעיון הנלמד**, לא בקישוט לשוני:
- **העלאת רמה = העלאת עומק הרעיון**: יותר שכבות, יותר הפשטה, יותר ניואנס, יותר חשיבה ביקורתית, יותר קשרים בין מושגים — **לא** ניסוח מסובך של אותו רעיון פשוט.
- **השפה נגזרת מהרעיון**: אוצר המילים והתחביר עולים באופן טבעי כי הרעיון עמוק יותר, לא כקישוט. **אסור** לדחוף מילים גבוהות או תחביר מתוחכם כדי "להישמע אינטלקטואלי" אם הרעיון עצמו לא דורש זאת. השפה משרתת את הרעיון.
- **דוגמה ("דמוקרטיה")**: רמה נמוכה = "כולם מצביעים ומחליטים יחד". רמה גבוהה = המתח בין שלטון הרוב להגנת זכויות המיעוט ומנגנוני האיזון שמונעים עריצות. המילים עשירות יותר ברמה הגבוהה כי **הרעיון** עמוק יותר — לא כדי להישמע מתוחכם.
- **מסיחים ברב-ברירה**: ברמה נמוכה — שגויים בעליל, כמעט אבסורדיים, נפסלים בלי ידע. ברמה גבוהה — מתעתעים, כמעט-נכונים, דורשים הבחנה דקה ומדויקת בין מושגים קרובים (טעויות תפיסה נפוצות).`
}

/* בלוק רמה מאוחד — ממזג עומק-מושגי + רמת-ניסוח + אופי/תוכן-לפי-גיל לאילוצי-על מנוסחים
   פעם אחת, מגובים ב-few-shot של רגיסטר (מחליף פסקאות-כללים מילוליות). קריטי לזמן היצירה:
   פחות אילוצים חופפים = פחות "חשיבה" של המודל = יצירה מהירה יותר, ללא אובדן כיסוי. */
function levelBlock(level: number): string {
  const grade = levelToGradeLabel(level)
  const character =
    level <= 7
      ? 'עולם משחקי, מוחשי וקונקרטי — דמויות וחפצים, סיפור פשוט, מושגים ניתנים-למישוש. ללא הפשטה ודילמות מורכבות.'
      : level <= 13
        ? 'איזון בין קונקרטי למופשט — סיבתיות, השוואות, תחילת חשיבה ביקורתית ודילמות פשוטות.'
        : 'הפשטה, סיבתיות מורכבת, ניואנס, דילמות ערכיות אמיתיות וחשיבה ביקורתית.'
  return `
## רמה, שפה ואופי — שכבת ${grade} (רמה ${level}/20) · קריטי!
**1. עומק מושגי = ציר הקושי (לא אוצר המילים).** העלאת רמה = יותר שכבות, הפשטה, ניואנס וקישור בין רעיונות — לא ניסוח מסובך של רעיון פשוט. ההפרש בין הקצוות עצום ומורגש (הפרמטרים המבניים כבר במפרט כל אתגר; אתה אחראי לעומק). דוגמה ("דמוקרטיה"): נמוך="כולם מצביעים ומחליטים יחד"; גבוה=המתח בין שלטון הרוב להגנת המיעוט. מסיחי רב-ברירה: נמוך=שגויים בעליל; גבוה=כמעט-נכונים מתעתעים. **עמק ברעיון אחד — אל תדחוס אירועים רבים בפסקה.**
**2. שפה (חל על כל טקסט לתלמיד):** ${narrativeStyleSpec(level)} תמיד עברית **תקנית, עכשווית ובהירה** — לא ארכאית-מליצית, בדיוק מגדרי ומספרי, תחביר שלם (בלי נושא חסר). השפה משרתת את הרעיון; הקושי ברעיון, לא במילון — **הפרדה מוחלטת בין עומק (לא יורד) לניסוח (מותאם לרמה)**.
**3. אופי ותוכן לפי גיל:** ${character} בחר מושגים, דוגמאות ועומק שתלמיד ישראלי בשכבת ${grade} מבין. **תוכן המורה גובר** אם סיפק נושא/מושגים ספציפיים.

### דוגמאות רגיסטר (חקה את הטון המתאים לרמה — כולן עברית עכשווית ובהירה, רק העומק עולה):
רמה 1: "המלך כועס. הוא רוצה עוד זהב."
רמה 7: "המלך כעס מאוד ודרש מהאיכרים לשלם עוד מסים, כדי שיהיה לו זהב לצבא."
רמה 11: "המלך הבין שאם יעלה את המסים האיכרים עלולים למרוד — אבל בלי כסף הצבא שלו ייחלש."
רמה 14: "כל החלטה של המלך הייתה מאזן עדין: מסים גבוהים מדי יציתו מרד, נמוכים מדי יחלישו את הצבא מול האויב שבגבול."
רמה 20: "המלך ידע שכוחו נשען על פחד ועל נאמנות גם יחד, וכל ניסיון להגדיל את האחד שוחק את השני — מלכוד שאין ממנו מוצא נקי."`
}

/* בלוק ניקוד מדורג לפי רמת הכתיבה (סקאלת 1-20). רמות ≤6 (גן/א'/ב') — ניקוד מלא;
   רמות ≥7 (ג'+) — ניקוד סלקטיבי (שמות אנשים/מקומות ומונחים קשים בלבד). */
function niqqudBlock(level: number): string {
  if (level <= 6) {
    return `
## ניקוד (קוראים מתחילים)
**כתוב את כל הטקסט ללא ניקוד כלל** — ניקוד עברי מלא ומדויק יתווסף אוטומטית לאחר מכן על ידי כלי ניקוד ייעודי. אל תוסיף סימני ניקוד בעצמך (כדי למנוע ניקוד שגוי). כתוב עברית רגילה בכתיב מלא תקני.`
  }
  return `
## ניקוד סלקטיבי (קריטי!)
**רוב הטקסט — ללא ניקוד כלל.** נקד **אך ורק** מילים שעלולות להיות לא מוכרות לשכבת הגיל:
- **שמות אנשים** (דמויות היסטוריות, גיבורים) — תמיד מנוקדים.
- **שמות מקומות** (ערים, אתרים, ארצות) — תמיד מנוקדים.
- **מונחים טכניים/מדעיים/לועזיים/נדירים** שכנראה לא מוכרים לגיל.
בספק — **אל תנקד** (ניקוד-יתר מסיח את הקורא הרגיל). הניקוד שכן תנקד חייב להיות **מדויק ותקני** — ניקוד שגוי גרוע מהיעדר ניקוד.`
}

/* כמה מפתחות/מנעולים נדרשים (0 = מבנה לינארי ללא חפצים) */
export function requiredKeyCount(params: QuestGenerationParams): number {
  if (params.puzzlePreferences?.types?.itemUsage) {
    return params.puzzlePreferences.counts?.itemUsage ?? 0
  }
  return 0
}

/* רשימת החידות המבוקשות + מפרט הנתונים לכל סוג, מותאם לרמת הקושי (finalQuiz בנפרד) */
function puzzleListText(prefs: PuzzlePreferences | undefined, level: number): string {
  if (!prefs?.types) return ''
  const enabled = Object.entries(prefs.types).filter(
    ([type, on]) => on && type !== 'itemUsage' && type !== 'finalQuiz' && PUZZLE_TYPE_NAMES[type],
  )
  if (enabled.length === 0) return ''
  const lines = enabled.map(
    ([type]) => `- ${PUZZLE_TYPE_NAMES[type]}: ${prefs.counts?.[type] ?? 1} אתגרים (שדה "type": "${type}")`,
  )
  const specs = enabled
    .map(([type]) => puzzleDataSpec(type, level))
    .filter(Boolean)
    .map((s) => `- ${s}`)
  return `\n## סוגי אתגרים נדרשים\nשלב את האתגרים הבאים בסצנות (כל אתגר בשדה puzzle עם "type" מתאים):\n${lines.join('\n')}\n\n### מפרט נתוני האתגרים (חובה למלא בעברית, בהקשר חומר הלימוד, ובהתאמה לרמת הקושי!)\n**חובה מוחלטת: לכל puzzle — בכל סוג, ובכל סצנה כולל הסצנות המאוחרות — חייב להיות שדה "question" לא-ריק בעברית** (שאלה בחידות תוכן, או הוראה קצרה בחידות מבוססות-משחק כמו tileSwap/wordSearch/memory/sequenceOrder). אל תשמיט את "question" לעולם.\n${specs.join('\n')}`
}

/* הנחיות מבחן הסיכום — אתגר finalQuiz אחד בסצנת השיא */
function finalQuizInstructions(prefs: PuzzlePreferences | undefined, level: number): string {
  if (!prefs?.types?.finalQuiz) return ''
  const n = Math.min(10, Math.max(3, prefs.counts?.finalQuiz ?? 5))
  const { optionCount, guidance } = scaleFinalQuiz(level)
  return `
## מבחן סיכום (finalQuiz) — חובה!
הוסף **אתגר אחד** מסוג "finalQuiz" ב-puzzle של **סצנת השיא** (הסצנה האחרונה לפני הסיום, ראו ADVENTURE NARRATIVE STRUCTURE). זהו המבחן המסכם של ההדמיה:
- "type":"finalQuiz", "question": כותרת/הוראה קצרה (למשל "מבחן הסיכום של המסע").
- "questions": מערך של **בדיוק ${n}** שאלות רב-ברירה **אינטגרטיביות** הבוחנות הבנה כוללת של כל מה שנלמד בהדמיה — לא חזרה מילולית על שאלות קודמות! כל שאלה: { "question", "options": [**בדיוק ${optionCount} מחרוזות**], "correctIndex": אינדקס התשובה הנכונה (0-based), "explanationCorrect", "explanationIncorrect" }.
- **קושי המבחן (${difficultyLabel(level)}): ${guidance}**
- מבחן הסיכום שוקל נתח משמעותי מהקריסטלים — ודא שהוא מקיף ומאתגר.`
}

/* imagePrompt קבוע לסצנת המעבדה — לא נותנים ל-AI להמציא אותו.
   {DR_HOLO} מוחלף בתיאור הדמות הקבוע בשלב יצירת התמונות */
export const LAB_IMAGE_PROMPT_TEMPLATE =
  'futuristic holographic laboratory, {DR_HOLO} standing before a large glowing circular portal, through the portal a vivid view of {quest world}, cyan and blue holographic interfaces floating around, cinematic lighting'

/* הנחיות מבנה מעבדה-פורטל — כש-ד"ר הולו פעיל */
function labStructureInstructions(): string {
  return `
## מבנה מעבדה-פורטל (חובה כשד"ר הולו פעיל!)
1. **הסצנה הראשונה (entrySceneId) היא תמיד מעבדת ד"ר הולו**:
   - הדוקטור מסביר אך ורק: לאן יוצאים, מה נלמד, ומה המשימה.
   - **אסור** לו להסביר את מנגנון הקריסטלים או חוקים של המערכת — התלמידים מכירים אותם. מותר אזכור אגבי אחד לכל היותר ("מכשיר הקריסטלים שלי מוכן — צא לדרך!").
   - ה-imagePrompt של סצנת המעבדה חייב להיות בדיוק התבנית הבאה, כשאת {quest world} מחליפים ב-2-6 מילים באנגלית שמתארות את עולם ההדמיה:
     "${LAB_IMAGE_PROMPT_TEMPLATE}"
   - הוסף לסצנת המעבדה גם "drHoloExpression" התואם לטון הבריפינג (למשל "a worried, urgent expression" אם המשימה דחופה, או "a warm, encouraging smile" אם הפתיחה רגועה).
   - **קריטי: לסצנת המעבדה חייב להיות "nextSceneId" שמצביע לסצנת התוכן הראשונה** (או choices במבנה Hub). אסור שתישאר ללא קישור קדימה — אחרת המשחק ידלג ישר לסיום. כל סצנה חייבת להיות נגישה מסצנת הכניסה.
2. **שתי סצנות סיום** בשדות "endingGood" ו-"endingBad" ברמה העליונה של ה-JSON (לא בתוך scenes):
   - "endingGood": חזרה למעבדה. הדוקטור נרגש — המסה הקריטית של התובנה הושגה! הוא חולק את התובנה/מוסר ההשכל **העמוק** של חומר הלימוד.
   - "endingBad": חזרה למעבדה. הדוקטור חם ומעודד: מציין מה הלך טוב, אומר שחסרים עוד קריסטלים כדי להגיע לתובנה, ומזמין לצאת למסע שוב. **לעולם לא טון מאשים**.
   - בסצנות הסיום התייחסות לקריסטלים מותרת ורצויה — שם זה חלק מהעלילה.
   - **תמונת סיום ייעודית (חובה לכל סיום)**: כל סיום כולל "imagePrompt" באנגלית **השונה מתמונת סצנת הפתיחה** — מסך סיכום/מסך ניצחון במעבדת ד"ר הולו. ה-imagePrompt **חייב** להכיל את ה-placeholder ${`{DR_HOLO}`} (הדוקטור במרכז התמונה), ולצדו שדה "drHoloExpression" באנגלית התואם לסוג הסיום:
     · **endingGood** — אווירה חוגגת ומנצחת: מעבדה זוהרת באור חם, קונפטי/אורות הולוגרפיים של ניצחון, הקריסטלים זוהרים במלואם. "drHoloExpression" = הבעה שמחה/גאה/חוגגת (למשל "a joyful, triumphant smile, beaming with pride"). הטון מואר ואופטימי.
     · **endingBad** — אווירה קודרת ומעורפלת: מעבדה עמומה וקרה, אורות חלשים/מהבהבים, קריסטלים דהויים, צללים. "drHoloExpression" = הבעה מבולבלת/עצובה/מאוכזבת/עייפה (למשל "a tired, dejected and disappointed expression, looking weary"). הטון אפרורי ומלנכולי — אך **לא** מפחיד או מאשים.
   - מבנה כל סיום: { "title": "...", "narrative": "...", "drHoloDialog": "דברי הדוקטור בעברית", "imagePrompt": "English prompt containing ${`{DR_HOLO}`}", "drHoloExpression": "English facial expression matching the ending tone" }`
}

/* מבנה נרטיבי — דרישת עלילה מלאה ב-adventure, או סיור בלבד ב-tour */
function narrativeStructureInstructions(questType?: string): string {
  if (questType === 'tour') {
    return `
## TOUR MODE — מבנה סיור (לא הרפתקה)
סוג ההדמיה הוא "tour": הנרטיב הוא **תירוץ לחשיפת תוכן, לא בעיה לפתרון**. אין צורך ב-mission statement או במשימה מרכזית — הסיור לגיטימי כמסע גילוי. ד"ר הולו מזמין את התלמיד לחקור ולהתפעל, והסצנות חושפות את התוכן בזו אחר זו בצורה זורמת ומעניינת.`
  }
  return `
## ADVENTURE NARRATIVE STRUCTURE (קריטי — חובה מוחלטת כש-type=adventure!)
ההדמיה היא **סיפור הרפתקה עם משימה מרכזית**, לא סדרת תחנות לימוד. אסור בתכלית האיסור לבנות "הגענו ל-X, ועכשיו ל-Y". חובה עלילה שלמה עם משימה, מתח ושיא:

1. CENTRAL MISSION — משימה מרכזית (בפתיחה!): הסצנה הראשונה (מעבדת ד"ר הולו) חייבת לפתוח עם משימה ספציפית, מוחשית ודחופה — בעיה שדורשת פתרון או מטרה שדורשת השגה, עם סיבה לפעול **עכשיו**. **אסור** לפתוח ב"נלמד על X" / "היום נבקר ב-X" / "הגענו ל-X". הדוקטור חייב להטיל משימה. דוגמאות לפי נושא:
   - היסטוריה: "קיבלנו ידיעה שאחד מחברי הבולה עומד להצביע נגד הרפורמה — עליך לגלות מי הוא ולמנוע את זה לפני פנות ערב"
   - גוף האדם: "האיש שנכנסנו לגופו מראה תסמינים קשים — יש לך שעתיים לאתר את הגורם לפני שהנזק יהיה בלתי הפיך"
   - כימיה: "נוסחת התרכובת הנדירה נגנבה — עקוב אחר הרמזים הכימיים כדי לשחזר אותה לפני שהמתחרים יגיעו אליה"

2. NARRATIVE ARC — קשת עלילתית (פתיחה → התפתחות → שיא → סיום):
   - פתיחה: הצגת המשימה + מצב ההתחלה (מה ידוע, מה לא ידוע)
   - התפתחות: כל סצנה מוסיפה מידע/ראיה/יכולת שמקדמת את פתרון המשימה. התוכן הלימודי הוא הכלי לפתרון — לא המטרה עצמה
   - שיא: רגע ההכרעה (ראו סעיף 3)
   - סיום: תוצאת המשימה + התובנה הגדולה (ב-endingGood/endingBad)

3. CLIMAX SCENE — סצנת שיא (חובה! זו הנקודה הקריטית שנכשלת הכי הרבה):
   - לפני המעבר לסצנת הסיום במעבדה חייבת להיות **סצנה אחת ייעודית** שבה המשימה המרכזית **נפתרת בפועל** — העימות, החשיפה, ההצלה, רגע ההכרעה הדרמטי.
   - הכניסה אל היעד (האקרופוליס, חדר הבקרה, ליבת התא, המעבדה הסודית) היא **סצנת השיא עצמה** — סצנה מלאה עם נרטיב שמתאר את פתרון המשימה. **אסור** שהכניסה ליעד תהיה רק טריגר שמדלג ישר לסיום!
   - סצנת השיא היא לינארית: **ללא choices וללא nextSceneId**. היעדר ה-nextSceneId הוא שמסמן את סוף ההרפתקה ואת המעבר ל-endingGood/endingBad.
   - אפשר (ומומלץ) לכלול בסצנת השיא חידה אחרונה מכריעה.
   - רק **אחרי** סצנת השיא מגיעים לסצנות הסיום במעבדה.

4. CONTENT AS TOOL NOT DESTINATION: החומר הלימודי מוטמע בתוך פעולות הסיפור — התלמיד לא "לומד על הדמוקרטיה", הוא "חוקר את מנגנון ההצבעה כדי להבין איך לעצור את הבוגד". כל חידה מתחברת לעלילה: פתרון החידה = התקדמות במשימה.

5. LOCK-AND-KEY NARRATIVE FIT: המפתחות והמנעולים חייבים להתחבר למשימה המרכזית — חפץ שנאסף הוא ראיה, כלי או הוכחה שדרושה לפתרון המשימה, לא "פריט אקראי שפותח שער". השער הנעול הוא המכשול האחרון לפני השיא, והבחירה הנעולה מובילה (nextSceneId) אל סצנת השיא.

### דוגמה מלאה (FEW-SHOT) — הרפתקה לינארית קצרה, תקינה מתחילתה ועד סופה
שים לב: משימה דחופה בפתיחה, כל סצנה מקדמת אותה, סצנת שיא נפרדת שבה המשימה נפתרת (ללא nextSceneId), ואז סיומים. (הדוגמה מקוצרת — אצלך כל narrative מלא ועשיר יותר.)
{
  "scenes": [
    {
      "id": "scene_lab",
      "title": "מעבדת ד\\"ר הולו — קריאת חירום מאתונה",
      "narrative": "ד״ר הולו מסתובב אליך במהירות: 'יש לנו בעיה. בעוד שעה תתכנס האקלסיה להצביע על גורל העיר — ויש שמועה שמישהו זייף את אסימוני ההצבעה כדי להטות את התוצאה. עליך לרדת לאתונה, להבין איך עובדת ההצבעה, ולחשוף את המזייף לפני שהקולות ייספרו!'",
      "imagePrompt": "futuristic holographic laboratory, {DR_HOLO} standing before a large glowing circular portal, through the portal a vivid view of ancient athens agora, cyan and blue holographic interfaces floating around, cinematic lighting",
      "drHoloExpression": "a worried, urgent expression",
      "nextSceneId": "scene_agora"
    },
    {
      "id": "scene_agora",
      "title": "האגורה — איסוף קצה חוט",
      "narrative": "אתה יוצא מהפורטל אל האגורה ההומה. סוחר לוחש לך שראה מישהו מחלק אסימונים מחוץ לבית המטבעה. כדי להבין אם הם מזויפים, עליך לדעת איך נראה אסימון אמיתי.",
      "imagePrompt": "a bustling ancient Greek agora marketplace, citizens in togas, stalls with pottery, 5th century BC, historically accurate, in its original pristine state",
      "puzzle": {
        "type": "multipleChoice",
        "question": "כיצד הצביעו אזרחי אתונה באקלסיה?",
        "choices": [
          { "id": "c1", "text": "בהרמת יד וספירה", "isCorrect": true },
          { "id": "c2", "text": "בכתיבת שם על פפירוס", "isCorrect": false }
        ],
        "explanationCorrect": "נכון! ברוב ההצבעות הרימו יד, ולהערכת קולות גדולה השתמשו בכריזה. ובנוסף — באוסטרקיזם (גירוש) הצביעו דווקא בחרסים, ולכן זיופים היו אפשריים שם.",
        "explanationIncorrect": "התשובה הנכונה היא הרמת יד. ובנוסף — באוסטרקיזם הצביעו בחרסים, ולכן זיופים היו אפשריים שם."
      },
      "nextSceneId": "scene_mint"
    },
    {
      "id": "scene_mint",
      "title": "בית המטבעה — הראיה המכרעת",
      "narrative": "בבית המטבעה אתה מוצא ערימת חרסים. אחד מהם נושא סימן חריטה שונה מכל השאר — סימן המזייף. זו הראיה שתפיל אותו.",
      "imagePrompt": "an ancient Greek mint workshop with clay ostraca shards, oil lamps, 5th century BC, historically accurate, in its original pristine state",
      "nextSceneId": "scene_climax"
    },
    {
      "id": "scene_climax",
      "title": "האקלסיה — רגע ההכרעה",
      "narrative": "אתה מזנק אל גבעת הפניקס רגע לפני הספירה. מול אלפי אזרחים אתה מרים את החרס המזויף ומצביע על סימן החריטה החריג. ההמון משתתק — המזייף מחוויר ונמלט. ההצבעה ניצלה, והרפורמה תעבור ביושר.",
      "imagePrompt": "the Pnyx hill assembly of ancient Athens, thousands of citizens gathered, a speaker on the bema holding up a clay shard, dramatic, 5th century BC, historically accurate, in its original pristine state"
    }
  ],
  "entrySceneId": "scene_lab",
  "isHistorical": true,
  "endingGood": { "title": "הדמוקרטיה ניצלה", "narrative": "חזרת למעבדה. המזייף נחשף וההצבעה הייתה הוגנת.", "drHoloDialog": "הצלת היום לא רק הצבעה — הראית למה השקיפות היא הלב של הדמוקרטיה.", "imagePrompt": "Victory celebration inside Dr. Holo's glowing holographic laboratory, warm golden light, holographic confetti and triumphant light beams, five crystals shining at full brightness, {DR_HOLO} standing proudly at the center", "drHoloExpression": "a joyful, triumphant smile, beaming with pride" },
  "endingBad": { "title": "כמעט שם", "narrative": "חזרת למעבדה עם חלק מהראיות, אך לא הספקת לחשוף את המזייף בזמן.", "drHoloDialog": "התקדמת יפה! חסרו עוד כמה רסיסים כדי להרכיב את התמונה — בוא ננסה שוב.", "imagePrompt": "Dim, cold and somber holographic laboratory, faint flickering blue light, faded dull crystals, long shadows, a melancholic gray atmosphere, {DR_HOLO} standing at the center", "drHoloExpression": "a tired, dejected and disappointed expression, looking weary" }
}

(בהדמיה עם מפתחות/מנעולים המבנה דומה אך מסועף — ראו HUB STRUCTURE; גם שם הבחירה הנעולה מובילה אל סצנת שיא נפרדת.)`
}

/* ── הבלוק הקבוע של פרומפט היצירה (זהה בין כל ההדמיות — אין אינטרפולציה) ──
   נשלח כ-system עם cache_control:ephemeral, כך שב-retry (אותה יצירה) ובהדמיות
   רצופות תוך 5 דק׳ הוא נקרא מה-cache במקום לעבד מחדש ~1800 טוקנים של כללים. */
export const GENERATION_SYSTEM = `אתה מעצב משחקי לומדה פדגוגיים בעברית עבור מערכת HoloAcademy.
צור משחק לומדה (quest) בפורמט JSON בלבד, ללא טקסט נוסף לפני או אחרי.

## HISTORICAL & FACTUAL ACCURACY (CRITICAL — לפני כל דבר אחר!)
זהו כלי חינוכי — דיוק עובדתי הוא דרישת על:
- כל עובדה, דמות, מקום, תאריך, אירוע, טכנולוגיה ומבנה חייבים להיות **מדויקים היסטורית ועובדתית** ותואמים לתקופה שבה מתרחשת ההדמיה.
- **אסור אנכרוניזמים**: אל תשבץ דמות, מבנה, חפץ או מושג בתקופה שבה לא היו קיימים. ודא שכל דמות חיה בתקופה הנכונה, שכל מבנה כבר נבנה ועדיין קיים באותה תקופה, ושכל טכנולוגיה כבר הומצאה. (דוגמה לשגיאה אסורה: שיוך יוליוס קיסר לקולוסיאום — הקולוסיאום נבנה כ-100 שנה אחרי מותו.)
- כשהדמות או האתר מפורסמים — ודא **עקביות מלאה** בין כל הפרטים: תקופה, מקום, ובני התקופה הסובבים.
- **אם אינך בטוח בעובדה — בחר זווית אחרת שאתה בטוח בה. לעולם אל תמציא** תאריך, שם, או קשר היסטורי.
- **אל תמציא מושגים או ביטויים**: כתוב רק ביטויים מדויקים ותקינים מדעית ולוגית. **אסור** ביטוי חסר-משמעות או מטעה שנשמע "מדעי" אך אין לו פשר (למשל "גביש של אוויר" — אין דבר כזה; הירח פשוט חסר אטמוספירה, ללא אוויר). נסח עובדות מדעיות במונחים הנכונים והמקובלים.
- **אוצר המילים של המשחק נשאר במנגנון המשחק**: מונחי הניקוד/המותג — **גביש, קריסטל, רסיס** — שייכים אך ורק למנגנון הקריסטלים ולסצנות הסיום. **אסור** לשבץ אותם בתוכן הלימודי, בנרטיב או בשאלות (לא "גביש של אוויר", לא "קריסטל ידע"). בתוכן הלימוד השתמש אך ורק במונחים המדעיים/ההיסטוריים הנכונים.

## הסברים מעמיקים לשאלות (חובה!)
לכל חידת רב-ברירה (multipleChoice) ונכון/לא נכון (trueFalse) חובה לכלול שני שדות:
- "explanationCorrect": נפתח באישור ("נכון מאוד! …") וממשיך עם **העמקה לימודית מעבר למה שנשאל** — פרט נוסף, מספר מפתיע, או הקשר רחב.
- "explanationIncorrect": נפתח ב"התשובה הנכונה היא…" (כולל התשובה עצמה) ומציג את **אותה העמקה**.
דרישה מפורשת: ההסבר חייב ללמד משהו חדש שלא הופיע בשאלה או בתשובות עצמן!
דוגמה — שאלה "כמה אבנים בפירמידה הגדולה?" → ההסבר מוסיף: "כ-2.3 מיליון אבנים, כשהכבדות שבהן שוקלות עד 80 טון — כמשקל של 16 פילים!"

## דיוק היסטורי ב-imagePrompt (קריטי!)
1. כשההדמיה מתרחשת בעבר, כל imagePrompt חייב לתאר מבנים ואתרים **כפי שנראו בתקופת ההתרחשות — חדשים, שלמים ופעילים**. לעולם לא במצבם המודרני ההרוס.
2. אסור להסתמך על שם האתר לבד (השם מושך את מודל התמונות לצילומי ההריסות המודרניות). חובה לתאר את המבנה ארכיטקטונית במצבו המקורי. דוגמאות:
   - לא: "the Parthenon in Athens" → כן: "a majestic newly-built Greek temple atop a hill, pristine white marble columns, colorful painted sculptures and friezes in red blue and gold, 5th century BC"
   - לא: "the Colosseum" → כן: "a colossal newly-completed Roman amphitheater, intact outer walls with marble facing, colorful awnings, crowds in togas, 80 AD"
   - לא: "Machu Picchu ruins" → כן: "a thriving Inca mountain city, intact stone buildings with thatched roofs, terraced gardens full of crops, llamas and inhabitants, 15th century"
3. הוסף סביבה חיה מתאימה לתקופה: אנשים בלבוש תקופתי, שווקים, כלי תחבורה של הזמן.
4. לכל imagePrompt של הדמיה היסטורית צרף בסוף: ", historically accurate, in its original pristine state"
5. בשדה "isHistorical" (ברמת ה-JSON העליונה, ליד scenes) קבע true אם ההדמיה מתרחשת בעבר, אחרת false.

## דמות ד"ר הולו ב-imagePrompt (קריטי!)
כשד"ר הולו מופיע ויזואלית בתוך סצנה, ה-imagePrompt חייב להכיל את ה-placeholder המדויק {DR_HOLO} במקום שבו הדוקטור אמור להופיע — **אסור לתאר את הדוקטור במילים שלך** (לא מראה, לא בגדים, לא גיל, **ולא הבעת פנים**). פשוט שלב את {DR_HOLO} בתיאור הסצנה. לדוגמה: "{DR_HOLO} pointing at an ancient scroll in a sunlit library". אם הדוקטור לא מופיע בתמונה — אל תכלול את ה-placeholder.
**הבעת פנים — drHoloExpression (חובה כשהדוקטור מופיע):** הזהות של הדוקטור (פנים, זקן, משקפיים, חלוק) קבועה ומוזרקת אוטומטית; אבל **הבעת הפנים חייבת להתאים לטון הנרטיב של הסצנה**. בכל סצנה שה-imagePrompt שלה מכיל {DR_HOLO}, הוסף שדה "drHoloExpression" באנגלית קצרה שמתארת את ההבעה לפי תוכן הסצנה — אם הטקסט אומר שהוא מודאג, ההבעה מודאגת; אם נרגש, ההבעה נרגשת. דוגמאות: "a worried, tense expression", "an excited, joyful smile", "a serious, focused look", "an alarmed, startled face", "a warm, reassuring smile". אל תוסיף את השדה בסצנה שאין בה {DR_HOLO}.
**חשוב מאוד: ה-placeholder {DR_HOLO} מותר אך ורק בשדה imagePrompt!** בכל שדה טקסט שמוצג לתלמיד (narrative, drHoloDialog, question, סצנות הסיום) כתוב תמיד "ד״ר הולו" בעברית — לעולם אל תכתוב {DR_HOLO} בטקסט, הוא יוצג כמחרוזת גולמית מכוערת.

## כללי שפה — חובה
- כל הטקסט המוצג למשתמש (כותרות, תיאורים, שאלות, תשובות) בעברית טבעית ותקינה.
- **בחירת מילה מדויקת בהקשר**: אל תשתמש במילה שנשמעת דומה אך שגויה במשמעות (למשל "הפורטל מְשַׁדֵּךְ אתכם" — מְשַׁדֵּךְ = matchmaking; הנכון הוא "מְשַׁגֵּר/מְשַׁנֵּעַ/מַעֲבִיר אתכם"). ודא שכל מילה אומרת בדיוק את מה שהתכוונת.
- **הימנע מצירופים מתורגמים-מילולית מאנגלית** — כתוב עברית אידיומטית טבעית, לא תרגום מילה-במילה (לא "סביב אתכם" = around you, אלא "סְבִיבְכֶם"; לא "לוקח מקום" = takes place, אלא "מתרחש"). אם צירוף נשמע כתרגום מסורבל — נסח אותו מחדש בעברית טבעית.
- שמות חפצים (name) בעברית בלבד.
- מזהים (id) באנגלית snake_case בלבד.
- imagePrompt באנגלית בלבד.
- **אל תכפיל תרגום בשמות לועזיים**: אם שם לועזי כבר מכיל את מילת-התפקיד (Abbey/River/Mount/King/Lake וכו') — אל תוסיף לפניו את המילה העברית המקבילה. כתוב "ווסטמינסטר אבי" (לא "כנסיית ווסטמינסטר אביי"), "הרי הימלאיה" ולא "הרי ההימלאיה מאונטיינס", "נהר התמזה" ולא "נהר התמזה ריבר". בספק — השתמש בשם המקובל והנפוץ בעברית.

## פורמט הפלט — JSON בלבד
{
  "scenes": [
    {
      "id": "scene_1",
      "title": "כותרת בעברית",
      "narrative": "טקסט סיפורי בעברית",
      "imagePrompt": "English visual description of the scene environment for image generation",
      "drHoloExpression": "facial expression matching the scene tone — only when imagePrompt contains {DR_HOLO}",
      "puzzle": {
        "type": "multipleChoice",
        "question": "שאלה בעברית",
        "choices": [
          { "id": "choice_a", "text": "תשובה בעברית", "isCorrect": true },
          { "id": "choice_b", "text": "תשובה בעברית", "isCorrect": false }
        ],
        "explanationCorrect": "נכון מאוד! ובנוסף… (העמקה עם פרט חדש)",
        "explanationIncorrect": "התשובה הנכונה היא… ובנוסף… (אותה העמקה)"
      },
      "collectableItem": { "id": "...", "name": "...", "imagePrompt": "...", "icon": "🔑" },
      "choices": [
        { "id": "nav_a", "text": "טקסט הבחירה בעברית", "nextSceneId": "scene_2" },
        { "id": "nav_b", "text": "בחירה נעולה", "nextSceneId": "scene_5", "requiredItemIds": ["golden_key"], "unlockText": "המפתח מסתובב במנעול והשער נפתח בחריקה" }
      ],
      "nextSceneId": "scene_2"
    }
  ],
  "entrySceneId": "scene_1",
  "isHistorical": true,
  "endingGood": { "title": "...", "narrative": "...", "drHoloDialog": "...", "imagePrompt": "celebratory victory screen in the lab containing {DR_HOLO}", "drHoloExpression": "a joyful, triumphant smile" },
  "endingBad": { "title": "...", "narrative": "...", "drHoloDialog": "...", "imagePrompt": "dim somber lab containing {DR_HOLO}", "drHoloExpression": "a tired, disappointed expression" }
}

הערות:
- "choices" ברמת הסצנה = בחירות ניווט (לא תשובות לחידה!). השתמש בהן בסצנת ה-Hub ובסוף כל מסלול. סצנה רגילה בתוך מסלול יכולה להשתמש ב-"nextSceneId" פשוט.
- "requiredItemIds" על בחירת ניווט = הבחירה נעולה עד שכל החפצים ברשימה נאספו.
- "unlockText" חובה על כל בחירה נעולה — תיאור רגע הפתיחה בעברית, תואם למכשול ולמפתח.
- "imagePrompt" חובה בכל סצנה — תיאור ויזואלי של הסביבה באנגלית בלבד, ללא דמויות טקסט.
- "collectableItem" רק בסצנות מפתח (אם הוגדרו), אחרת השמט את השדה.
- בסצנה עם "choices" אין צורך ב-"nextSceneId".
- החזר JSON תקין בלבד.`

export function buildQuestPrompt(params: QuestGenerationParams): { system: string; user: string } {
  const keyCount = requiredKeyCount(params)
  const level = clampLevel(params.difficultySettings?.puzzleDifficulty as number | undefined)

  const structureInstructions =
    keyCount > 0
      ? `
## מבנה הקווסט — HUB STRUCTURE (דרישה מוחלטת!)
זהו קווסט מסועף עם בדיוק ${keyCount} מפתחות. המבנה חייב להיות כזה, ללא חריגות:

1. **סצנת צומת (Hub)**: חייבת להיות סצנה מרכזית אחת עם בדיוק ${keyCount + 1} בחירות **פתוחות** (ללא requiredItemIds!):
   - ${keyCount} בחירות — כל אחת מובילה למסלול מפתח שונה ונפרד
   - בחירה אחת נוספת — מובילה אל **סצנת המכשול** (ראו סעיף 2)
2. **סצנת המכשול**: השער הנעול **לעולם לא יושב על ה-Hub עצמו!** צרו סצנת מכשול ייעודית, נפרדת מה-Hub:
   - הנרטיב שלה מתאר את החסימה במפורש ("אתה מגיע אל דלת עץ ענקית. שומר חמוש עומד מולה ומסרב להזיז את ידו מהקת…")
   - בה נמצאת הבחירה **הנעולה** עם "requiredItemIds" של כל ${keyCount} המפתחות + "unlockText" + **"nextSceneId" שמצביע על סצנת השיא** (ראו סעיף 3). אסור שהבחירה הנעולה תקפוץ ישר לסיום — היא נכנסת אל סצנת השיא שבה המשימה נפתרת.
   - וגם בחירה פתוחה לחזרה אל ה-Hub (nextSceneId אל ה-Hub)
3. **סצנת השיא (CLIMAX)**: הסצנה שאליה מובילה הבחירה הנעולה. כאן המשימה המרכזית **נפתרת בפועל** — העימות/החשיפה/ההכרעה הדרמטית. סצנה לינארית: **ללא choices וללא nextSceneId** (היעדר ה-nextSceneId מסמן את סוף ההרפתקה והמעבר ל-endingGood/endingBad). אפשר לכלול בה חידה אחרונה מכריעה. **רק אחרי סצנת השיא** מגיעים לסיום.
4. **מסלולי מפתח**: כל מסלול הוא 1-3 סצנות עם תוכן לימודי שונה. בסוף המסלול מוענק מפתח ייחודי (collectableItem), והבחירה האחרונה במסלול מחזירה את השחקן אל ה-Hub.
5. **חופש בחירה**: השחקן חופשי לבחור את סדר המסלולים. אסור בהחלט שמסלול אחד יהיה נגיש רק דרך מסלול אחר — כל מסלול מתחיל ישירות מבחירה ב-Hub.
6. **אסור** ליצור שרשרת לינארית של מנעולים. המבנה הוא כוכב: Hub במרכז, מסלולים סביבו, סצנת מכשול אחת, וסצנת שיא מאחורי השער.

דוגמה ל-${keyCount === 2 ? 'מבנה הנדרש' : '2 מפתחות (התאם ל-' + keyCount + ')'} בנושא אתונה העתיקה (משימה: לחשוף מזייף הצבעה לפני שתתכנס האקלסיה):
- האגורה (Hub) — 3 בחירות פתוחות: "ללכת לסוקרטס" (מסלול א׳), "ללכת לאקלסיה" (מסלול ב׳), "להתקרב אל שער האקרופוליס" (אל סצנת המכשול)
- מסלול א׳: שיחה עם סוקרטס → חידה → מוענקת "מגילת הפילוסוף" (ראיה ראשונה) → חזרה לאגורה
- מסלול ב׳: ביקור באקלסיה → חידה → מוענק "אסימון ההצבעה" (ראיה שנייה) → חזרה לאגורה
- סצנת המכשול "שער האקרופוליס": "שומר העיר חוסם את המעבר ומצביע על שני חותמים ריקים בשער…" — בחירה נעולה "להיכנס לאקרופוליס" (requiredItemIds: ["philosopher_scroll", "voting_token"], **nextSceneId: "scene_climax"**) + בחירה פתוחה "לחזור לאגורה" (nextSceneId: "hub_scene_id")
- סצנת השיא "scene_climax" — "אולם המועצה": מול חברי הבולה אתה מציג את שתי הראיות וחושף את המזייף ברגע האחרון. המשימה הושלמה. **ללא choices וללא nextSceneId** → מעבר לסיום.

## קוהרנטיות נרטיבית של מנעול-ומפתח (קריטי!)
1. כל מנעול חייב להיות **מכשול מוחשי ומפורש** בנרטיב של הסצנה — לא "בחירה נעולה" סתם. דוגמאות למכשולים:
   - דלת/שער נעולים פיזית
   - שומר/דמות שלא מאפשרים מעבר בלי הוכחה או חפץ
   - דרך חסומה (מפולת, נהר, תהום)
   - מנגנון/מכונה שחסר להם חלק כדי לפעול
   - טרמינל/מחשב שדורש סיסמה או צופן
2. טקסט הסצנה של המכשול חייב לתאר אותו במפורש **ולרמוז מה נדרש כדי לעבור** ("השומר מצביע על חותם ריק על השער…"), כך שתלמיד שמגיע בלי המפתח מבין מה לחפש.
3. המפתח חייב להתאים למכשול **בהיגיון נרטיבי מלא**:
   - שומר שדורש הוכחת אזרחות → אסימון הצבעה
   - טרמינל נעול → פתק עם סיסמה / כרטיס גישה
   - מנגנון שבור → גלגל השיניים החסר
   - דלת נעולה → מפתח פיזי מתאים
   אסור: "מגילה" שפותחת "מפולת סלעים" או כל חפץ שאין לו קשר הגיוני למכשול.
4. טקסט הענקת המפתח (בסצנה שבה הוא מושג) חייב לרמוז לייעודו: "סוקרטס מוסר לך את המגילה: 'הראה אותה לשומר הספרייה — הוא יידע שלמדת אצלי'".
5. לכל בחירה נעולה הוסף שדה "unlockText" — טקסט בעברית שמתאר את רגע הפתיחה בהתאם למכשול ולמפתח: "השומר בוחן את המגילה ומחווה בראשו — הדרך פנויה".

לכל מפתח הגדר collectableItem עם השדות:
- "id": מזהה באנגלית בלבד, snake_case (למשל "golden_key")
- "name": שם החפץ בעברית בלבד (למשל "מפתח הזהב")
- "imagePrompt": תיאור ויזואלי באנגלית ליצירת תמונה
- "icon": אמוג'י אחד מתאים`
      : `
## מבנה הקווסט — לינארי
- צור מבנה לינארי לחלוטין: סצנה אחרי סצנה, ללא הסתעפויות וללא חפצים.
- אין לכלול collectableItem, מפתחות, מנעולים או choices ברמת הסצנה כלל — רק nextSceneId.
- **הסצנה האחרונה היא סצנת השיא** (ראו ADVENTURE NARRATIVE STRUCTURE): בה המשימה המרכזית נפתרת בפועל, והיא היחידה **ללא nextSceneId** (היעדרו מסמן את המעבר לסצנות הסיום). אסור שההדמיה תיגמר ב"הגענו ליעד" בלי רגע הכרעה.`

  /* user = החלק המשתנה בלבד (פרטים + form + מבנה + רמה + חידות). הכללים הקבועים
     (דיוק עובדתי, הסברים, תמונות, שפה, פורמט JSON) חיים ב-GENERATION_SYSTEM המקושש. */
  const user = `## פרטי הקווסט
- כותרת: ${params.title}
- נושא לימודי (תוכנית לימודים): ${params.curriculum}
- אורך: ${params.questLength} סצנות
- סוג קווסט: ${params.questType ?? 'standard'}
- סגנון אמנותי: ${params.artStyle ?? 'holographic'}
- ד"ר הולו (דמות מנחה): ${params.includeDrHolo ? 'כן — שלב את הדמות כמנחה לאורך הקווסט' : 'לא'}
${params.difficultySettings ? `- הגדרות קושי: ${JSON.stringify(params.difficultySettings)}` : ''}

${formOfAddressInstructions(params.formOfAddress ?? 'plural')}
${narrativeStructureInstructions(params.questType)}
${structureInstructions}
${params.includeDrHolo ? labStructureInstructions() : ''}
${levelBlock(level)}
${niqqudBlock(level)}
${puzzleListText(params.puzzlePreferences, level)}
${finalQuizInstructions(params.puzzlePreferences, level)}

צור עכשיו את ה-JSON המלא של ההדמיה, לפי כל הכללים שב-system (דיוק עובדתי, הסברים, תמונות, שפה ופורמט הפלט) ולפי פרטי הקווסט שלמעלה. החזר JSON תקין בלבד.`
  return { system: GENERATION_SYSTEM, user }
}

/* ════════════════════════════════════════════════════════════════════════
   מקבול יצירה לינארית — שלד סדרתי קצר → מילוי סצנות במקביל.
   ════════════════════════════════════════════════════════════════════════ */

export interface SkeletonScene {
  id: string
  title: string
  role: string
  characters: string
  beat: string
  puzzleType: string /* 'none' או סוג חידה */
}
export interface QuestSkeleton {
  isHistorical: boolean
  mission: string
  scenes: SkeletonScene[]
  endingGood: string
  endingBad: string
}

/* קריאת השלד — קצרה וסדרתית. מתכננת את רצף הסצנות (ids, תפקיד, beat, חידה) בלי
   טקסט מלא. פלט קטן = מהיר. */
export function buildSkeletonPrompt(params: QuestGenerationParams): string {
  const level = clampLevel(params.difficultySettings?.puzzleDifficulty as number | undefined)
  const grade = levelToGradeLabel(level)
  const prefs = params.puzzlePreferences
  const puzzleLines = prefs?.types
    ? Object.entries(prefs.types)
        .filter(([t, on]) => on && t !== 'itemUsage' && t !== 'finalQuiz' && PUZZLE_TYPE_NAMES[t])
        .map(([t]) => `${prefs.counts?.[t] ?? 1}× ${t}`)
    : []
  const finalQuiz = !!prefs?.types?.finalQuiz
  return `אתה מתכנן **שלד עלילה** להדמיה חינוכית לינארית בעברית. החזר **JSON שלד בלבד** — בלי טקסט נרטיב מלא, רק תכנון.

## פרטים
- כותרת: ${params.title}
- נושא לימודי: ${params.curriculum}
- שכבת גיל: ${grade} (רמה ${level}/20)
- אורך: **בדיוק ${params.questLength} סצנות**${params.includeDrHolo ? '\n- ד"ר הולו מנחה את המסע' : ''}

## מבנה הקשת (חובה)
1. **סצנה ראשונה = מעבדת ד"ר הולו**: מציג את **המשימה המרכזית** (לאן יוצאים, מה לומדים, מה המטרה). ללא חידה.
2. **סצנות ביניים** (לינאריות): כל אחת מקדמת את המסע לעבר המשימה, במקום/שלב חדש.
3. **סצנה אחרונה = סצנת השיא**: המשימה **נפתרת בפועל** (העימות/החשיפה/ההכרעה).

## חלוקת חידות בין הסצנות
שבץ: ${puzzleLines.length ? puzzleLines.join(', ') : 'ללא חידות בסצנות הביניים'}.${finalQuiz ? ' **מבחן הסיכום (finalQuiz) — בסצנת השיא בלבד.**' : ''} סצנת הפתיחה ללא חידה.

## פלט — JSON שלד בלבד
{
  "isHistorical": true/false (האם מתרחש בעבר),
  "mission": "המשימה המרכזית שד\\"ר הולו מציג — משפט אחד",
  "scenes": [
    { "id": "scene_lab", "title": "כותרת קצרה", "role": "פתיחה — ד\\"ר הולו מציג את המשימה", "characters": "מי מופיע בסצנה", "beat": "מה קורה, איך הסצנה מסתיימת, ומה מוביל לסצנה הבאה", "puzzleType": "none" }
    /* ... בדיוק ${params.questLength} סצנות; האחרונה role=\"שיא\"${finalQuiz ? ', puzzleType=\"finalQuiz\"' : ''} ... */
  ],
  "endingGood": "תיאור קצר של סיום ההצלחה",
  "endingBad": "תיאור קצר של הסיום החלקי"
}
מזהי סצנות: snake_case אנגלי ייחודי. **בלי נרטיב מלא — רק beats.** החזר JSON תקין בלבד.`
}

/* כללי תמונה תמציתיים לכתיבת סצנה בודדת */
function sceneImageRules(): string {
  return `## תמונה (imagePrompt)
- imagePrompt באנגלית בלבד, תיאור הסביבה. אם ד"ר הולו מופיע בסצנה — שלב את ה-placeholder המדויק {DR_HOLO} (אל תתאר אותו במילים) + הוסף שדה "drHoloExpression" באנגלית קצרה שתואמת לטון הסצנה. אם לא מופיע — בלי {DR_HOLO} ובלי drHoloExpression.
- בהדמיה היסטורית: תאר מבנים/אתרים **כפי שנראו בתקופה — חדשים ושלמים**, לא הריסות מודרניות, וצרף ", historically accurate, in its original pristine state".`
}

/* מילוי סצנה בודדת (פתיחה/ביניים) — מקבל את השלד המלא כהקשר + הסצנה שלו. מקבילי. */
export function buildScenePrompt(params: QuestGenerationParams, skeleton: QuestSkeleton, idx: number): string {
  const level = clampLevel(params.difficultySettings?.puzzleDifficulty as number | undefined)
  const scene = skeleton.scenes[idx]
  const next = skeleton.scenes[idx + 1]
  const prev = skeleton.scenes[idx - 1]
  const ptype = scene.puzzleType && scene.puzzleType !== 'none' ? scene.puzzleType : ''
  const puzzleSpec = ptype ? puzzleDataSpec(ptype, level) : ''
  return `אתה כותב **סצנה אחת** בהדמיה חינוכית בעברית, לפי שלד עלילה נתון. החזר **JSON של הסצנה בלבד**, נאמן לשלד.

## השלד (הקשר — אל תכתוב אותו מחדש)
משימה מרכזית: ${skeleton.mission}
רצף הסצנות:
${skeleton.scenes.map((s, i) => `${i + 1}. [${s.id}] ${s.title} — ${s.beat}`).join('\n')}

## הסצנה שעליך לכתוב עכשיו: [${scene.id}] — ${scene.role}
beat: ${scene.beat}
דמויות/חפצים: ${scene.characters}
${prev ? `הסצנה הקודמת (${prev.title}) הסתיימה כך: ${prev.beat} — המשך מכאן בהיגיון.` : 'זו סצנת הפתיחה (מעבדת ד"ר הולו).'}
${next ? `הסצנה הבאה: ${next.title} — הסצנה שלך צריכה להוביל אליה.` : ''}
${levelBlock(level)}
${niqqudBlock(level)}
${formOfAddressInstructions(params.formOfAddress ?? 'plural')}
${puzzleSpec ? `## חידת הסצנה (חובה)\n${puzzleSpec}\nכלול "explanationCorrect"/"explanationIncorrect" לחידות רב-ברירה/נכון-לא.` : 'לסצנה זו **אין** חידה — אל תכלול שדה puzzle.'}
${sceneImageRules()}

## פלט — JSON של הסצנה בלבד
{ "id": "${scene.id}", "title": "כותרת בעברית", "narrative": "טקסט סיפורי בעברית", "imagePrompt": "English scene description", ${ptype ? '"puzzle": { ... לפי המפרט ... }, ' : ''}"nextSceneId": "${next ? next.id : ''}" }
החזר JSON תקין בלבד.`
}

/* מילוי סצנת השיא + שני הסיומים — **אחרון**, עם הנרטיבים שכבר נכתבו (למבחן סיכום אינטגרטיבי). */
export function buildClimaxPrompt(params: QuestGenerationParams, skeleton: QuestSkeleton, filled: { id: string; title: string; narrative: string }[]): string {
  const level = clampLevel(params.difficultySettings?.puzzleDifficulty as number | undefined)
  const climax = skeleton.scenes[skeleton.scenes.length - 1]
  const ptype = climax.puzzleType && climax.puzzleType !== 'none' ? climax.puzzleType : ''
  const fqCount = Math.min(10, Math.max(3, params.puzzlePreferences?.counts?.finalQuiz ?? 5))
  const puzzleSpec = ptype === 'finalQuiz'
    ? `"type":"finalQuiz", "question": כותרת, "questions": מערך של **בדיוק ${fqCount}** שאלות אינטגרטיביות (כל שאלה {question, options[${scaleFinalQuiz(level).optionCount}], correctIndex, explanationCorrect, explanationIncorrect}) הבוחנות הבנה כוללת של **כל** ההדמיה. ${scaleFinalQuiz(level).guidance}`
    : ptype ? puzzleDataSpec(ptype, level) : ''
  return `אתה כותב את **סצנת השיא** (הסצנה האחרונה) + שני הסיומים בהדמיה חינוכית בעברית. החזר **JSON בלבד**.

## המשימה המרכזית: ${skeleton.mission}
## מה קרה בסצנות (לסיכום אינטגרטיבי):
${filled.map((s) => `- ${s.title}: ${s.narrative.slice(0, 200)}`).join('\n')}

## סצנת השיא: [${climax.id}] — ${climax.title}
beat: ${climax.beat}
**כאן המשימה נפתרת בפועל** (העימות/החשיפה/ההכרעה). סצנה לינארית — **ללא nextSceneId** (היעדרו מסמן את המעבר לסיום).
${levelBlock(level)}
${niqqudBlock(level)}
${formOfAddressInstructions(params.formOfAddress ?? 'plural')}
${puzzleSpec ? `## חידת השיא\n${puzzleSpec}` : ''}
${sceneImageRules()}

## הסיומים (תמונה ייעודית לכל אחד, **שונה מהפתיחה**)
- endingGood: ניצחון חוגג — מעבדה זוהרת, ד"ר הולו גאה/שמח. endingBad: חלקי וקודר — מעבדה עמומה, ד"ר הולו מאוכזב/עייף (לעולם לא מאשים).
- לכל סיום: title, narrative, drHoloDialog, imagePrompt (עם {DR_HOLO}), drHoloExpression.

## פלט — JSON בלבד
{ "climax": { "id": "${climax.id}", "title": "...", "narrative": "...", "imagePrompt": "...", "drHoloExpression": "...", ${ptype ? '"puzzle": {...}, ' : ''}"nextSceneId": null },
  "endingGood": { "title": "...", "narrative": "...", "drHoloDialog": "...", "imagePrompt": "...containing {DR_HOLO}", "drHoloExpression": "..." },
  "endingBad": { "title": "...", "narrative": "...", "drHoloDialog": "...", "imagePrompt": "...containing {DR_HOLO}", "drHoloExpression": "..." } }
החזר JSON תקין בלבד.`
}

/* הודעת תיקון ל-retry כשמספר המפתחות לא תואם */
export function buildRetryMessage(expected: number, actual: number): string {
  return `ה-JSON שהחזרת מכיל ${actual} מפתחות (collectableItem) במקום ${expected} הנדרשים. תקן את המבנה כך שיכלול בדיוק ${expected} מפתחות, והחזר את ה-JSON המלא המתוקן בלבד.`
}

/* הודעת תיקון ל-retry כשמבנה ה-Hub שגוי — מפרטת בדיוק מה לא תקין */
export function buildStructureRetryMessage(expected: number, errors: string[]): string {
  return `ה-JSON שהחזרת אינו עומד בדרישת מבנה ה-Hub. הבעיות שנמצאו:
${errors.map((e) => `- ${e}`).join('\n')}

תקן את המבנה: סצנת Hub אחת עם ${expected} בחירות פתוחות (כל אחת למסלול נפרד שמעניק מפתח ייחודי וחוזר ל-Hub) + בחירה נעולה אחת עם requiredItemIds של כל ${expected} המפתחות. אסור שמסלול יהיה נגיש רק דרך מסלול אחר. החזר את ה-JSON המלא המתוקן בלבד.`
}
