/* ──────────────────────────────────────────────────────────────────────────
   demoCatalog — **תוכן דומיין** של ספק ההדגמה של טאב "תוצאות": הדמיות לדוגמה (סצנות, שאלות, תשובות, תגיות טעות)
   והגדרת השליחות (איזו הדמיה, לאיזו כיתה, לפני כמה ימי לימוד, מי שלח, כמה עוד לא סיימו).
   · כמו analyticsV2/catalog.ts: טקסט שאלות ונרטיב הוא נתוני דומיין (תוכן של הדמיה), לא ממצאים. אין כאן אף משפט סיכום,
     ממצא או הסבר למורה — כל אלה נבנים ב-findingsNarrative דרך ליבת התוצאות (core.ts).
   · תגיות הטעות מפנות למזהי MISCONCEPTIONS שב-analyticsV2/catalog.ts (הרשימה הסגורה); הכותרת, התיאור וההדמיה המקושרת
     נשלפות משם — לא מוקלדות כאן.
   · אין כאן תאריכים מוחלטים: ימים הם היסטים ביחס ל-world.days (0 = יום הלימוד האחרון).
   ────────────────────────────────────────────────────────────────────────── */
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'

/* ── טיפוסים ── */
export interface DemoOption { text: string; correct?: boolean; tag?: string }
export interface DemoQuizQuestion { question: string; options: string[]; correctIndex: number }

interface PuzzleBase {
  /* ‎−0.3..+0.3: כמה האתגר קשה יחסית (משפיע על הסיכוי לטעות בו) */
  hardness: number
  /* רמת הקושי (1–20) שנרשמת באירועים */
  level: number
  objectiveId?: string
}
export type DemoPuzzle =
  | (PuzzleBase & { kind: 'choice'; question: string; options: DemoOption[]; tagPick?: number })
  | (PuzzleBase & { kind: 'truefalse'; question: string; answer: boolean })
  | (PuzzleBase & { kind: 'quiz'; question: string; questions: DemoQuizQuestion[] })
  | (PuzzleBase & { kind: 'moral'; question: string; situation: string; choices: string[] })
  | (PuzzleBase & { kind: 'game'; type: 'memory' | 'tileSwap' | 'sequenceOrder' | 'wordSearch' | 'wordCompletion'; question: string })

export interface DemoScene { id: string; title: string; narrative: string; puzzle?: DemoPuzzle }
export interface DemoQuest {
  id: string
  title: string
  subject: SubjectCode
  objectives?: { id: string; text: string }[]
  scenes: DemoScene[]
}

/* ══════════════════════════════════════════════════════════════════════════
   ההדמיות (8)
   ══════════════════════════════════════════════════════════════════════════ */
export const DEMO_QUESTS: DemoQuest[] = [
  /* 1. מתמטיקה — ½+⅓ → ⅖ (טעות נפוצה מתויגת פעמיים) */
  {
    id: 'demo-q-fractions-journey', title: 'מסע בארץ השברים', subject: 'math',
    objectives: [
      { id: 'obj_1', text: 'חיבור שברים עם מכנים שונים' },
      { id: 'obj_2', text: 'השוואה וסידור של שברים' },
    ],
    scenes: [
      { id: 's0', title: 'הגעה לארץ השברים', narrative: 'ד״ר הולו פותח שער זוהר ומבקש את עזרתכם. כדי לחצות את ארץ השברים צריך לפתור כמה חידות ולאסוף קריסטלים. כל תשובה נכונה מקרבת אתכם אל הגשר האחרון.' },
      {
        id: 's1', title: 'גשר החיבור', narrative: 'על הגשר חרוטה משוואה: חצי ועוד שליש. רק מי שיפתור אותה נכון יוכל לעבור.',
        puzzle: {
          kind: 'choice', hardness: 0.3, level: 9, objectiveId: 'obj_1', tagPick: 1, question: 'כמה זה ½ + ⅓ ?',
          options: [{ text: '⅖', tag: 'mc-frac-add-straight' }, { text: '⅚', correct: true }, { text: '⅔' }, { text: '1' }],
        },
      },
      {
        id: 's2', title: 'מגדל ההשוואה', narrative: 'מגדל גבוה מחולק לקומות, ובכל קומה כתוב שבר אחר. השומר שואל שאלה אחת.',
        puzzle: { kind: 'truefalse', hardness: -0.15, level: 7, objectiveId: 'obj_2', question: '⅗ גדול מ-½', answer: true },
      },
      {
        id: 's3', title: 'גשר השלישים והרבעים', narrative: 'גשר שני נפרש מול ההרים. הפעם צריך לחבר שליש ורבע.',
        puzzle: {
          kind: 'choice', hardness: 0.1, level: 10, objectiveId: 'obj_1', tagPick: 0.7, question: 'כמה זה ⅓ + ¼ ?',
          options: [{ text: '⁷⁄₁₂', correct: true }, { text: '²⁄₇', tag: 'mc-frac-add-straight' }, { text: '⅔' }, { text: '¹⁄₁₂' }],
        },
      },
      {
        id: 's4', title: 'חדר הזוגות', narrative: 'בחדר מחכים כרטיסים הפוכים. מתחת לכל שבר מסתתר הייצוג העשרוני שלו.',
        puzzle: { kind: 'game', type: 'memory', hardness: 0, level: 8, objectiveId: 'obj_2', question: 'התאימו כל שבר לייצוג העשרוני שלו' },
      },
      {
        id: 's5', title: 'שביל הסדר', narrative: 'על השביל מונחות אבנים עם שברים מבולגנים. צריך לסדר אותן מהקטנה לגדולה.',
        puzzle: { kind: 'game', type: 'sequenceOrder', hardness: 0.1, level: 9, objectiveId: 'obj_2', question: 'סדרו את השברים מהקטן לגדול' },
      },
      {
        id: 's6', title: 'שער הסיום', narrative: 'השער האחרון נפתח רק למי שמראה שהבין את כל הדרך.',
        puzzle: {
          kind: 'quiz', hardness: 0.15, level: 10, question: 'מבחן הסיכום של ארץ השברים',
          questions: [
            { question: 'מהו המכנה המשותף הקטן ביותר של ½ ו-⅓ ?', options: ['6', '5', '3', '12'], correctIndex: 0 },
            { question: 'כמה זה ¾ − ¼ ?', options: ['½', '⅔', '¼', '1'], correctIndex: 0 },
            { question: 'איזה שבר שווה ל-⅔ ?', options: ['⁴⁄₆', '⁴⁄₉', '²⁄₆'], correctIndex: 0 },
          ],
        },
      },
    ],
  },

  /* 2. מדעים — צף או שוקע (טעות נפוצה: כל חפץ כבד שוקע) */
  {
    id: 'demo-q-float-sink', title: 'צף או שוקע?', subject: 'science',
    scenes: [
      { id: 's0', title: 'מעבדת המים', narrative: 'ד״ר הולו מניח על השולחן בריכה קטנה ולידה כמה חפצים: חצץ, קוביית קרח, כדור ברזל וסירה קטנה. הוא שואל אתכם מה יצוף ומה ישקע, ובעיקר למה. כדי לענות צריך לחשוב על חומרים, על משקל ועל מה שקורה בין החפץ לבין המים שסביבו.' },
      {
        id: 's1', title: 'הניסוי הראשון', narrative: 'חצץ קטן שוקע מיד, וסירת מתכת גדולה צפה בשלווה.',
        puzzle: {
          kind: 'choice', hardness: 0.25, level: 8, tagPick: 1, question: 'מה קובע אם חפץ צף או שוקע?',
          options: [{ text: 'הצפיפות שלו לעומת הצפיפות של המים', correct: true }, { text: 'המשקל שלו בלבד', tag: 'mc-sci-heavy-sinks' }, { text: 'הצבע שלו' }, { text: 'הגודל שלו בלבד' }],
        },
      },
      {
        id: 's2', title: 'קרח במים', narrative: 'קוביית קרח נשארת על פני המים ולא שוקעת.',
        puzzle: { kind: 'truefalse', hardness: -0.1, level: 6, question: 'קרח צף כי הצפיפות שלו קטנה מהצפיפות של המים', answer: true },
      },
      {
        id: 's3', title: 'מדף הצפיפויות', narrative: 'על המדף עומדים צנצנות עם חומרים שונים, וליד כל אחת רשום מספר.',
        puzzle: { kind: 'game', type: 'memory', hardness: 0, level: 7, question: 'התאימו כל חומר לצפיפות שלו' },
      },
      {
        id: 's4', title: 'בריכת השמן', narrative: 'ד״ר הולו שופך שמן ומים לאותה כוס ומבקש שתנחשו מה יישאר למעלה.',
        puzzle: {
          kind: 'choice', hardness: -0.05, level: 6, question: 'איזה מהחומרים האלה יצוף על פני המים?',
          options: [{ text: 'שמן', correct: true }, { text: 'ברזל' }, { text: 'אבן' }, { text: 'נחושת' }],
        },
      },
      {
        id: 's5', title: 'פאזל הענן', narrative: 'תמונה של מעגל המים התפרקה לחתיכות. צריך להחזיר כל חתיכה למקומה.',
        puzzle: { kind: 'game', type: 'tileSwap', hardness: 0.05, level: 7, question: 'השלימו את תמונת מעגל המים' },
      },
      {
        id: 's6', title: 'מבחן המעבדה', narrative: 'ד״ר הולו מסכם את הניסויים בשלוש שאלות אחרונות.',
        puzzle: {
          kind: 'quiz', hardness: 0.15, level: 8, question: 'מבחן הסיכום של מעבדת המים',
          questions: [
            { question: 'מה קורה לחפץ שהצפיפות שלו גדולה מהצפיפות של המים?', options: ['הוא שוקע', 'הוא צף', 'הוא נעלם'], correctIndex: 0 },
            { question: 'מדוע ספינת ענק מברזל אינה שוקעת?', options: ['הצפיפות הממוצעת שלה, עם האוויר שבתוכה, קטנה מהצפיפות של המים', 'הברזל קל מהמים', 'הים רגוע'], correctIndex: 0 },
            { question: 'איך אפשר לגרום לחפץ שוקע לצוף?', options: ['להגדיל את הנפח שלו בלי להוסיף משקל', 'להוסיף לו משקל', 'לצבוע אותו'], correctIndex: 0 },
          ],
        },
      },
    ],
  },

  /* 3. עברית — שורש (טעות נפוצה: שורש = מילה שלמה; אי-התאמה במין) */
  {
    id: 'demo-q-root-tracks', title: 'בעקבות השורש', subject: 'hebrew',
    scenes: [
      { id: 's0', title: 'פתח המילים', narrative: 'ד״ר הולו מוצא תיבה מלאה במילים שהתפזרו. כדי לסדר אותן צריך לזהות מאיזה שורש כל מילה צמחה.' },
      {
        id: 's1', title: 'שורש המכתב', narrative: 'על לוח עץ חרוטה המילה מכתבה.',
        puzzle: {
          kind: 'choice', hardness: 0.2, level: 9, tagPick: 1, question: 'מהו השורש של המילה מכתבה ?',
          options: [{ text: 'כ-ת-ב', correct: true }, { text: 'מכתבה', tag: 'mc-heb-root-word' }, { text: 'מ-כ-ת' }, { text: 'ב-ה' }],
        },
      },
      {
        id: 's2', title: 'שער המשקלים', narrative: 'שומר השער בודק אם אתם מבדילים בין אותיות השורש לאותיות התוספת.',
        puzzle: { kind: 'truefalse', hardness: 0, level: 8, question: 'במילה מדריך האות מ היא חלק מהשורש', answer: false },
      },
      {
        id: 's3', title: 'תפזורת השורשים', narrative: 'בין האותיות מסתתרות מילים ששייכות לאותו שורש.',
        puzzle: { kind: 'game', type: 'wordSearch', hardness: 0.1, level: 9, question: 'מצאו את המילים ששייכות לשורש ש-ל-ח' },
      },
      {
        id: 's4', title: 'דקדוק על הגשר', narrative: 'הגשר נבנה ממשפטים, ורק משפט תקין מחזיק משקל.',
        puzzle: {
          kind: 'choice', hardness: 0.05, level: 7, tagPick: 0.8, question: 'איזה משפט כתוב נכון?',
          options: [{ text: 'הילדה גדולה', correct: true }, { text: 'הילדה גדול', tag: 'mc-heb-gender-agree' }, { text: 'הילד גדולה' }],
        },
      },
      {
        id: 's5', title: 'משפט חסר', narrative: 'במגילה ישנה נמחקה מילה אחת, וצריך להחזיר אותה.',
        puzzle: { kind: 'game', type: 'wordCompletion', hardness: 0.05, level: 8, question: 'השלימו את המילה החסרה במשפט' },
      },
      {
        id: 's6', title: 'מבחן הסיום', narrative: 'שלוש שאלות אחרונות לפני שהתיבה נפתחת.',
        puzzle: {
          kind: 'quiz', hardness: 0.1, level: 9, question: 'מבחן הסיכום של בעקבות השורש',
          questions: [
            { question: 'מהו השורש של המילה מלמד ?', options: ['ל-מ-ד', 'מ-ל-מ-ד', 'מ-ל-ד'], correctIndex: 0 },
            { question: 'איזו מילה שייכת לשורש כ-ת-ב ?', options: ['כתובת', 'כתום', 'קטב'], correctIndex: 0 },
            { question: 'איך נקרא החלק שחוזר בכל המילים במשפחה אחת ונושא את המשמעות המרכזית?', options: ['שורש', 'משקל', 'סיומת'], correctIndex: 0 },
          ],
        },
      },
    ],
  },

  /* 4. היסטוריה — בית ראשון ובית שני (שתי טעויות מתויגות, דילמה מוסרית) */
  {
    id: 'demo-q-two-temples', title: 'בימי בית ראשון ובית שני', subject: 'history',
    scenes: [
      { id: 's0', title: 'מנהרת הזמן', narrative: 'ד״ר הולו מפעיל מכונה שמחזירה אתכם אחורה בזמן, אל ירושלים של לפני אלפי שנים. בדרך תפגשו מלכים, נביאים וחומות, ותצטרכו להבין לא רק מה קרה אלא גם באיזה סדר. כל תחנה במסע היא חידה, ובסוף תקבלו מבחן שמחבר את כל מה שראיתם.' },
      {
        id: 's1', title: 'ציר הזמן', narrative: 'על קיר המנהרה מצוירים שלושה פרקים של ההיסטוריה, אבל הסדר שלהם התבלבל.',
        puzzle: {
          kind: 'choice', hardness: 0.15, level: 8, tagPick: 1, question: 'מהו הסדר הנכון של התקופות?',
          options: [
            { text: 'בית ראשון, אחריו גלות בבל, אחריה בית שני', correct: true },
            { text: 'בית שני, אחריו גלות בבל, אחריה בית ראשון', tag: 'mc-his-order-reverse' },
            { text: 'גלות בבל, אחריה בית ראשון, אחריו בית שני' },
          ],
        },
      },
      {
        id: 's2', title: 'שער החורבן', narrative: 'מעל העיר עולה עשן. אתם מנסים להבין איך הגיעו לכאן.',
        puzzle: {
          kind: 'choice', hardness: 0.2, level: 9, tagPick: 0.8, question: 'מדוע חרב בית ראשון?',
          options: [
            { text: 'בגלל שילוב של סיבות פנימיות וחיצוניות', correct: true },
            { text: 'רק בגלל כיבוש בבל', tag: 'mc-his-single-cause' },
            { text: 'בגלל רעידת אדמה' },
            { text: 'בגלל בצורת' },
          ],
        },
      },
      {
        id: 's3', title: 'המסע לבבל', narrative: 'שיירה ארוכה יוצאת מהעיר, ואתם הולכים איתה.',
        puzzle: { kind: 'truefalse', hardness: -0.15, level: 6, question: 'גלות בבל התרחשה אחרי חורבן בית ראשון', answer: true },
      },
      {
        id: 's4', title: 'סידור האירועים', narrative: 'שבע אבנים מפוזרות על הרצפה, ועל כל אחת אירוע אחד.',
        puzzle: { kind: 'game', type: 'sequenceOrder', hardness: 0.1, level: 8, question: 'סדרו את האירועים לפי הסדר שבו התרחשו' },
      },
      {
        id: 's5', title: 'הגליל בחפירה', narrative: 'בחפירה ארכיאולוגית נמצא גליל קדום, ולא ברור מה כתוב בו.',
        puzzle: {
          kind: 'moral', hardness: 0, level: 8, question: 'מה תעשו?', situation: 'אתם מוצאים בחפירה גליל קדום ואף אחד לא רואה אתכם',
          choices: ['אמסור אותו מיד לרשות העתיקות', 'אשאיר אותו אצלי כדי לבדוק בעצמי', 'אספר למורה ונחליט יחד'],
        },
      },
      {
        id: 's6', title: 'מבחן הסיכום', narrative: 'ארבע שאלות שמחברות את כל התחנות.',
        puzzle: {
          kind: 'quiz', hardness: 0.1, level: 9, question: 'מבחן הסיכום של מנהרת הזמן',
          questions: [
            { question: 'איזו תקופה הייתה לפני גלות בבל?', options: ['בית ראשון', 'בית שני', 'התקופה הרומית'], correctIndex: 0 },
            { question: 'מי כבש את ירושלים וחרב את בית ראשון?', options: ['מלך בבל', 'מלך מצרים', 'קיסר רומא'], correctIndex: 0 },
            { question: 'מה הקשר בין גלות בבל לבניית בית שני?', options: ['חלק מהגולים חזרו לירושלים ובנו מחדש', 'בית שני נבנה בבבל', 'אין ביניהם קשר'], correctIndex: 0 },
            { question: 'למה כדאי לבדוק יותר ממקור אחד כשחוקרים את העבר?', options: ['כי מקור אחד עלול להיות חלקי או מוטה', 'כי כל המקורות זהים', 'כי אסור להאמין לשום מקור'], correctIndex: 0 },
          ],
        },
      },
    ],
  },

  /* 5. אנגלית — בלי תגיות טעות בכלל */
  {
    id: 'demo-q-words-road', title: 'שביל המילים באנגלית', subject: 'english',
    scenes: [
      { id: 's0', title: 'שער הפתיחה', narrative: 'Doctor Holo opens a glowing gate. To cross the road of words you must solve a few challenges and collect the crystals.' },
      {
        id: 's1', title: 'השלט הראשון', narrative: 'A traveler stops at the first sign on the road.',
        puzzle: {
          kind: 'choice', hardness: 0, level: 6, question: 'She ___ to school every day.',
          options: [{ text: 'goes', correct: true }, { text: 'go' }, { text: 'going' }, { text: 'gone' }],
        },
      },
      {
        id: 's2', title: 'סדר המילים', narrative: 'The next sign shows two words in a strange order.',
        puzzle: { kind: 'truefalse', hardness: -0.3, level: 5, question: '"Big house" is the correct word order in English.', answer: true },
      },
      {
        id: 's3', title: 'המילה החסרה', narrative: 'A page from an old diary lost one word.',
        puzzle: { kind: 'game', type: 'wordCompletion', hardness: 0.05, level: 6, question: 'Complete the sentence: I ___ a book yesterday.' },
      },
      {
        id: 's4', title: 'גשר הזיכרון', narrative: 'Cards with words and meanings lie face down on the bridge.',
        puzzle: { kind: 'game', type: 'memory', hardness: 0, level: 6, question: 'Match each English word to its meaning' },
      },
      {
        id: 's5', title: 'הניגוד', narrative: 'At the end of the road, a gatekeeper asks about opposites.',
        puzzle: {
          kind: 'choice', hardness: -0.05, level: 5, question: 'What is the opposite of "cold"?',
          options: [{ text: 'hot', correct: true }, { text: 'dry' }, { text: 'tall' }, { text: 'slow' }],
        },
      },
      {
        id: 's6', title: 'השער האחרון', narrative: 'Three last questions and the road is yours.',
        puzzle: {
          kind: 'quiz', hardness: 0.3, level: 6, question: 'Final gate',
          questions: [
            { question: 'Choose the correct sentence.', options: ['He likes apples.', 'He like apples.', 'He liking apples.'], correctIndex: 0 },
            { question: 'What does "quickly" describe?', options: ['how something is done', 'a place', 'a person'], correctIndex: 0 },
            { question: 'Which word is a color?', options: ['green', 'chair', 'run'], correctIndex: 0 },
          ],
        },
      },
    ],
  },

  /* 6. מתמטיקה ד׳ — שתי תפיסות שגויות מתויגות (גודל מכנה, ערך מקום) */
  {
    id: 'demo-q-fraction-compare', title: 'קרב השברים', subject: 'math',
    scenes: [
      { id: 's0', title: 'זירת הקרב', narrative: 'בזירה עצומה עומדים שברים זה מול זה. מי שמזהה איזה שבר גדול יותר, מנצח.' },
      {
        id: 's1', title: 'ראש בראש', narrative: 'שני שברים נכנסים לזירה, ואתם השופטים.',
        puzzle: {
          kind: 'choice', hardness: 0.2, level: 5, tagPick: 1, question: 'איזה שבר גדול יותר: ⅛ או ¼ ?',
          options: [{ text: '¼', correct: true }, { text: '⅛', tag: 'mc-frac-bigger-denominator' }, { text: 'שניהם שווים' }],
        },
      },
      {
        id: 's2', title: 'קריאת המספר', narrative: 'על לוח הזירה מופיע מספר גדול, וצריך לקרוא אותו נכון.',
        puzzle: {
          kind: 'choice', hardness: 0.15, level: 5, tagPick: 0.8, question: 'מהו ערך הספרה 3 במספר 4,305 ?',
          options: [{ text: '300', correct: true }, { text: '3', tag: 'mc-place-value-digits' }, { text: '30' }, { text: '3,000' }],
        },
      },
      {
        id: 's3', title: 'נכון או לא', narrative: 'השופט הראשי מכריז על טענה.',
        puzzle: { kind: 'truefalse', hardness: -0.1, level: 4, question: '½ גדול מ-¼', answer: true },
      },
      {
        id: 's4', title: 'זוגות בזירה', narrative: 'כרטיסים הפוכים מתחלפים בין השברים לציורים.',
        puzzle: { kind: 'game', type: 'memory', hardness: 0, level: 4, question: 'התאימו כל שבר לציור שלו' },
      },
      {
        id: 's5', title: 'פאזל הזירה', narrative: 'תמונת הזירה התפרקה, וצריך להרכיב אותה מחדש.',
        puzzle: { kind: 'game', type: 'tileSwap', hardness: 0.05, level: 5, question: 'השלימו את תמונת הזירה' },
      },
      {
        id: 's6', title: 'טקס הסיום', narrative: 'שלוש שאלות אחרונות לפני שמכריזים על המנצחים.',
        puzzle: {
          kind: 'quiz', hardness: 0.1, level: 5, question: 'מבחן הסיכום של קרב השברים',
          questions: [
            { question: 'איזה שבר שווה ל-½ ?', options: ['²⁄₄', '¹⁄₃', '³⁄₄'], correctIndex: 0 },
            { question: 'איזה מספר גדול יותר?', options: ['4,305', '4,053', '3,450'], correctIndex: 0 },
            { question: 'כמה שמינים יש בשלם אחד?', options: ['8', '4', '2'], correctIndex: 0 },
          ],
        },
      },
    ],
  },

  /* 7. אנגלית ד׳ — תפיסה שגויה מתויגת (סדר מילים עברי) */
  {
    id: 'demo-q-big-house', title: 'הבית הגדול', subject: 'english',
    scenes: [
      { id: 's0', title: 'ברוכים הבאים', narrative: 'Doctor Holo shows you a street full of houses. Each house has a word on its door.' },
      {
        id: 's1', title: 'הבית הראשון', narrative: 'The first house is very tall.',
        puzzle: {
          kind: 'choice', hardness: 0.2, level: 4, tagPick: 1, question: 'Which phrase is correct?',
          options: [{ text: 'big house', correct: true }, { text: 'house big', tag: 'mc-eng-hebrew-order' }, { text: 'a house is big the' }],
        },
      },
      {
        id: 's2', title: 'המכונית האדומה', narrative: 'A car is parked next to the second house.',
        puzzle: { kind: 'truefalse', hardness: -0.1, level: 3, question: '"Red car" is correct English.', answer: true },
      },
      {
        id: 's3', title: 'זוגות של מילים', narrative: 'Words and pictures are hiding behind the windows.',
        puzzle: { kind: 'game', type: 'memory', hardness: 0, level: 4, question: 'Match each word to its picture' },
      },
      {
        id: 's4', title: 'הצבע על הדלת', narrative: 'The door of the third house is painted.',
        puzzle: {
          kind: 'choice', hardness: -0.05, level: 3, question: 'Which word is a color?',
          options: [{ text: 'blue', correct: true }, { text: 'table' }, { text: 'jump' }],
        },
      },
      {
        id: 's5', title: 'מילה אחרונה', narrative: 'One last word is missing from the sign.',
        puzzle: { kind: 'game', type: 'wordCompletion', hardness: 0.05, level: 4, question: 'Complete the sentence: This is a ___ house.' },
      },
      {
        id: 's6', title: 'סיום הרחוב', narrative: 'Three questions and the street is finished.',
        puzzle: {
          kind: 'quiz', hardness: 0.1, level: 4, question: 'Final questions',
          questions: [
            { question: 'Choose the correct phrase.', options: ['small dog', 'dog small', 'dog the small'], correctIndex: 0 },
            { question: 'What is the plural of "house"?', options: ['houses', 'housees', 'hice'], correctIndex: 0 },
            { question: 'Which one is a number?', options: ['five', 'fish', 'farm'], correctIndex: 0 },
          ],
        },
      },
    ],
  },

  /* 8. תנ״ך ד׳ — ערבוב דמויות (טעות מתויגת) */
  {
    id: 'demo-q-abraham-journey', title: 'מסע אברהם', subject: 'bible',
    scenes: [
      { id: 's0', title: 'יציאה לדרך', narrative: 'ד״ר הולו מוביל אתכם אל תחילת הדרך. בקול רם נשמע הציווי לצאת אל הארץ.' },
      {
        id: 's1', title: 'הציווי', narrative: 'קול מן השמיים פונה לאיש אחד ומבקש ממנו לצאת מביתו.',
        puzzle: {
          kind: 'choice', hardness: 0.2, level: 5, tagPick: 1, question: 'מי קיבל את הציווי ״לך לך מארצך״ ?',
          options: [{ text: 'אברהם', correct: true }, { text: 'לוט', tag: 'mc-bib-mixup' }, { text: 'נח' }, { text: 'יצחק' }],
        },
      },
      {
        id: 's2', title: 'בני המשפחה', narrative: 'המשפחה אורזת ויוצאת, ואתם הולכים איתה.',
        puzzle: { kind: 'truefalse', hardness: -0.1, level: 4, question: 'שרה הייתה אשתו של אברהם', answer: true },
      },
      {
        id: 's3', title: 'סדר האירועים', narrative: 'האירועים של הדרך נכתבו על אבנים שהתפזרו.',
        puzzle: { kind: 'game', type: 'sequenceOrder', hardness: 0.1, level: 5, question: 'סדרו את אירועי הסיפור לפי הסדר' },
      },
      {
        id: 's4', title: 'דמויות ותפקידים', narrative: 'ליד המדורה מונחים כרטיסים עם שמות ועם תיאורים.',
        puzzle: { kind: 'game', type: 'memory', hardness: 0, level: 4, question: 'התאימו כל דמות לתפקידה בסיפור' },
      },
      {
        id: 's5', title: 'מבחן הדרך', narrative: 'בסוף הדרך מחכות שלוש שאלות.',
        puzzle: {
          kind: 'quiz', hardness: 0.1, level: 5, question: 'מבחן הסיכום של מסע אברהם',
          questions: [
            { question: 'לאן יצא אברהם?', options: ['לארץ כנען', 'למצרים בלבד', 'לבבל'], correctIndex: 0 },
            { question: 'מי יצא עם אברהם?', options: ['שרה ולוט', 'נח', 'משה'], correctIndex: 0 },
            { question: 'איך נקראה אשתו של אברהם?', options: ['שרה', 'רבקה', 'רחל'], correctIndex: 0 },
          ],
        },
      },
    ],
  },
]

/* ══════════════════════════════════════════════════════════════════════════
   המורים השולחים (שמות בדויים) — לשדה "מי שלח"
   ══════════════════════════════════════════════════════════════════════════ */
export const DEMO_HOMEROOM_TEACHER = 'רונית שפירא'
export const DEMO_SUBJECT_TEACHERS: Partial<Record<SubjectCode, string>> = {
  math: 'אסף ברוך', hebrew: 'מיכל הראל', history: 'עמוס קדמון', science: 'ליאת נבון', english: 'תמי גרין', bible: 'חנה שלום',
}

/* ══════════════════════════════════════════════════════════════════════════
   השליחות (10)
   · dayIndex = היסט ב"ימי לימוד" אחורה (0 = היום האחרון), מתוך world.days.
   · sender: 'homeroom' = מחנכת ו׳2 (פרסונת המחנך) שלחה; 'subject' = מורה המקצוע שלחה.
   · inProgress / notStarted = סך מי שעוד לא סיים (כולל רועי, התלמיד החדש, בכיתה ו׳2).
   · roi: מצבו של רועי (התלמיד החדש) בשליחה — באמצע או לא התחיל.
   · answerDetail=false: שליחה מלפני לכידת התשובות — יש רק אירועים מסוכמים.
   · ease: היסט לסיכוי ההצלחה של הכיתה בשליחה (הדמיה קלה או קשה יחסית), כך שלא כל השליחות נראות אותו דבר.
   · תלמיד שמציג (בעולם הדמו) תפיסה שגויה שיש לה מסיח מתויג בהדמיה — מסיים אותה תמיד, ולכן מספר הבוחרים במסיח
     שווה בדיוק למספר המציגים בעולם.
   ══════════════════════════════════════════════════════════════════════════ */
export interface DemoSubmissionDef {
  id: string
  questId: string
  classId: string
  dayIndex: number
  sender: 'homeroom' | 'subject'
  inProgress: number
  notStarted: number
  roi?: 'in_progress' | 'not_started'
  answerDetail: boolean
  /* היסט (‎−0.3..+0.3) לסיכוי ההצלחה של הכיתה בשליחה הזאת — הדמיה קלה/קשה יחסית */
  ease?: number
}

export const DEMO_SUBMISSIONS: DemoSubmissionDef[] = [
  { id: 'demo-sub-science-v2', questId: 'demo-q-float-sink', classId: 'c-v2', dayIndex: 1, sender: 'subject', inProgress: 6, notStarted: 5, roi: 'in_progress', answerDetail: true },
  { id: 'demo-sub-fractions-v2', questId: 'demo-q-fractions-journey', classId: 'c-v2', dayIndex: 3, sender: 'homeroom', inProgress: 1, notStarted: 1, roi: 'in_progress', answerDetail: true },
  { id: 'demo-sub-bible-d2', questId: 'demo-q-abraham-journey', classId: 'c-d2', dayIndex: 4, sender: 'subject', inProgress: 1, notStarted: 1, ease: 0.12, answerDetail: true },
  { id: 'demo-sub-history-v2', questId: 'demo-q-two-temples', classId: 'c-v2', dayIndex: 6, sender: 'subject', inProgress: 1, notStarted: 2, roi: 'not_started', ease: -0.05, answerDetail: true },
  { id: 'demo-sub-fractions-v1', questId: 'demo-q-fractions-journey', classId: 'c-v1', dayIndex: 8, sender: 'subject', inProgress: 0, notStarted: 2, answerDetail: true },
  { id: 'demo-sub-hebrew-v2', questId: 'demo-q-root-tracks', classId: 'c-v2', dayIndex: 10, sender: 'homeroom', inProgress: 0, notStarted: 1, roi: 'not_started', ease: 0.1, answerDetail: true },
  { id: 'demo-sub-compare-d1', questId: 'demo-q-fraction-compare', classId: 'c-d1', dayIndex: 12, sender: 'subject', inProgress: 1, notStarted: 1, answerDetail: true },
  { id: 'demo-sub-english-v2', questId: 'demo-q-words-road', classId: 'c-v2', dayIndex: 15, sender: 'subject', inProgress: 0, notStarted: 1, roi: 'not_started', ease: 0.12, answerDetail: true },
  { id: 'demo-sub-history-v1', questId: 'demo-q-two-temples', classId: 'c-v1', dayIndex: 18, sender: 'subject', inProgress: 1, notStarted: 0, ease: -0.3, answerDetail: true },
  { id: 'demo-sub-english-d1', questId: 'demo-q-big-house', classId: 'c-d1', dayIndex: 21, sender: 'subject', inProgress: 0, notStarted: 1, ease: 0.08, answerDetail: false },
]

/* אינדקס יום הלימוד שממנו נאספים פירוטי תשובות (שליחות ישנות ממנו — אירועים מסוכמים בלבד) */
export const DEMO_DETAIL_FROM_DAY_INDEX = 19

/* ══════════════════════════════════════════════════════════════════════════
   המרה למבנה game_data (כפי שנשמר ב-DB) — לליבת התוצאות
   ══════════════════════════════════════════════════════════════════════════ */
export const optionLetter = (i: number): string => String.fromCharCode(97 + i)

export const questById = (id: string): DemoQuest | undefined => DEMO_QUESTS.find((q) => q.id === id)
export const puzzleScenes = (q: DemoQuest): (DemoScene & { puzzle: DemoPuzzle })[] =>
  q.scenes.filter((s): s is DemoScene & { puzzle: DemoPuzzle } => !!s.puzzle)

function gamePuzzle(p: DemoPuzzle): Record<string, unknown> {
  const base = { question: p.question, difficulty: p.level, ...(p.objectiveId ? { objectiveId: p.objectiveId } : {}) }
  switch (p.kind) {
    case 'choice':
      return { ...base, type: 'multipleChoice', choices: p.options.map((o, i) => ({ id: optionLetter(i), text: o.text, isCorrect: o.correct === true })) }
    case 'truefalse':
      return { ...base, type: 'trueFalse', choices: [{ id: 't', text: 'נכון', isCorrect: p.answer }, { id: 'f', text: 'לא נכון', isCorrect: !p.answer }] }
    case 'quiz':
      return { ...base, type: 'finalQuiz', questions: p.questions.map((q) => ({ question: q.question, options: q.options, correctIndex: q.correctIndex })) }
    case 'moral':
      return { ...base, type: 'moralDilemma', situation: p.situation, moralChoices: p.choices.map((text) => ({ text, consequence: '' })) }
    case 'game':
      return { ...base, type: p.type }
  }
}

export function questGameData(q: DemoQuest): { entrySceneId: string; objectives: { id: string; text: string }[]; scenes: Record<string, unknown>[] } {
  return {
    entrySceneId: q.scenes[0].id,
    objectives: q.objectives ?? [],
    scenes: q.scenes.map((s, i) => ({
      id: s.id, title: s.title, narrative: s.narrative,
      ...(i + 1 < q.scenes.length ? { nextSceneId: q.scenes[i + 1].id } : {}),
      ...(s.puzzle ? { puzzle: gamePuzzle(s.puzzle) } : {}),
    })),
  }
}

/* מסיחים מתויגים בהדמיה: מיקום האתגר (סצנה), האות של האפשרות ומזהה התפיסה */
export interface TaggedOption { sceneId: string; itemIndex: number; optionId: string; misconceptionId: string }
export function taggedOptions(q: DemoQuest): TaggedOption[] {
  const out: TaggedOption[] = []
  for (const s of puzzleScenes(q)) {
    if (s.puzzle.kind !== 'choice') continue
    s.puzzle.options.forEach((o, i) => { if (o.tag) out.push({ sceneId: s.id, itemIndex: 0, optionId: optionLetter(i), misconceptionId: o.tag }) })
  }
  return out
}
