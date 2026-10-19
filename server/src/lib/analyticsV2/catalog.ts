/* ──────────────────────────────────────────────────────────────────────────
   catalog — קטלוג הדמו של האנליטיקה החדשה: מושגים, תפיסות שגויות, יעדי תוכנית לימודים.
   זהו **תוכן דומיין** (שורות שבעתיד יגיעו מהטבלאות concepts / misconceptions / curriculum_nodes),
   לא טקסט ממצאים. יעדי הלימוד כאן בשמות נושאים כלליים בלבד — אין קודים רשמיים, מספרי תקנים
   או ציטוטי משרד החינוך (mappingStatus='sample' → "מיפוי לדוגמה").
   ────────────────────────────────────────────────────────────────────────── */
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { ContentVectorKey } from '../../../../src/shared/lib/analyticsConfig.js'

export const DEMO_GRADES = [
  { grade: 4, label: 'ד׳' },
  { grade: 6, label: 'ו׳' },
] as const

/* מקצועות לפי שכבה; ערבית = מקצוע בחירה בקבוצה קטנה (לדוגמת תא מוסתר) */
export const SUBJECTS_BY_GRADE: Record<number, SubjectCode[]> = {
  4: ['hebrew', 'math', 'science', 'english', 'bible'],
  6: ['hebrew', 'math', 'history', 'science', 'english'],
}
export const ELECTIVE_SUBJECT: SubjectCode = 'arabic'

export interface ConceptDef { key: string; titleHe: string; subject: SubjectCode; vector: ContentVectorKey; goalId: string | null }
export interface GoalDef { id: string; title: string; subject: SubjectCode; gradeFrom: number; gradeTo: number }

export const GOALS: GoalDef[] = [
  { id: 'g-math-frac-add', title: 'שברים: חיבור וחיסור בשברים עם מכנים שונים', subject: 'math', gradeFrom: 5, gradeTo: 6 },
  { id: 'g-math-frac-cmp', title: 'שברים: השוואה וסידור שברים', subject: 'math', gradeFrom: 4, gradeTo: 5 },
  { id: 'g-math-mult', title: 'כפל וחילוק: משמעות הפעולות והקשר ביניהן', subject: 'math', gradeFrom: 4, gradeTo: 6 },
  { id: 'g-math-place', title: 'ערך המקום במספרים גדולים', subject: 'math', gradeFrom: 3, gradeTo: 4 },
  { id: 'g-heb-morph', title: 'מורפולוגיה: שורש ומשקל', subject: 'hebrew', gradeFrom: 5, gradeTo: 7 },
  { id: 'g-heb-agree', title: 'התאמה דקדוקית במין ובמספר', subject: 'hebrew', gradeFrom: 3, gradeTo: 6 },
  { id: 'g-heb-read', title: 'הבנת הנקרא: מידע מפורש ומשתמע', subject: 'hebrew', gradeFrom: 4, gradeTo: 6 },
  { id: 'g-his-time', title: 'ציר זמן וסדר כרונולוגי של תקופות', subject: 'history', gradeFrom: 6, gradeTo: 7 },
  { id: 'g-his-cause', title: 'סיבות ותוצאות של אירועים היסטוריים', subject: 'history', gradeFrom: 6, gradeTo: 8 },
  { id: 'g-sci-matter', title: 'תכונות החומר: משקל, נפח וצפיפות', subject: 'science', gradeFrom: 5, gradeTo: 6 },
  { id: 'g-sci-food', title: 'שרשראות מזון ומערכות אקולוגיות', subject: 'science', gradeFrom: 4, gradeTo: 6 },
  { id: 'g-eng-order', title: 'מבנה משפט פשוט באנגלית', subject: 'english', gradeFrom: 4, gradeTo: 6 },
  { id: 'g-eng-read', title: 'הבנת טקסט קצר באנגלית', subject: 'english', gradeFrom: 4, gradeTo: 6 },
  { id: 'g-bib-story', title: 'עלילה ודמויות בסיפורי המקרא', subject: 'bible', gradeFrom: 3, gradeTo: 5 },
]

export const CONCEPTS: ConceptDef[] = [
  { key: 'math.fractions.add_unlike_denominators', titleHe: 'חיבור שברים עם מכנים שונים', subject: 'math', vector: 'concept_understanding', goalId: 'g-math-frac-add' },
  { key: 'math.fractions.compare', titleHe: 'השוואת שברים', subject: 'math', vector: 'concept_understanding', goalId: 'g-math-frac-cmp' },
  { key: 'math.multiplication.facts', titleHe: 'לוח הכפל', subject: 'math', vector: 'factual', goalId: 'g-math-mult' },
  { key: 'math.word_problems', titleHe: 'בעיות מילוליות', subject: 'math', vector: 'application_inference', goalId: null },
  { key: 'math.place_value', titleHe: 'ערך המקום', subject: 'math', vector: 'concept_understanding', goalId: 'g-math-place' },

  { key: 'hebrew.morphology.roots_patterns', titleHe: 'הבנה מורפולוגית (שורש ומשקל)', subject: 'hebrew', vector: 'concept_understanding', goalId: 'g-heb-morph' },
  { key: 'hebrew.reading.comprehension', titleHe: 'הבנת הנקרא', subject: 'hebrew', vector: 'domain_reading', goalId: 'g-heb-read' },
  { key: 'hebrew.vocabulary', titleHe: 'אוצר מילים', subject: 'hebrew', vector: 'factual', goalId: null },
  { key: 'hebrew.grammar.agreement', titleHe: 'התאמה דקדוקית', subject: 'hebrew', vector: 'application_inference', goalId: 'g-heb-agree' },

  { key: 'history.timeline_order', titleHe: 'סדר כרונולוגי', subject: 'history', vector: 'sequence_causality', goalId: 'g-his-time' },
  { key: 'history.reading_sources', titleHe: 'הבנת מקור היסטורי', subject: 'history', vector: 'domain_reading', goalId: null },
  { key: 'history.causes_effects', titleHe: 'סיבות ותוצאות', subject: 'history', vector: 'sequence_causality', goalId: 'g-his-cause' },
  { key: 'history.key_facts', titleHe: 'עובדות מפתח', subject: 'history', vector: 'factual', goalId: null },

  { key: 'science.matter.weight_density', titleHe: 'משקל וצפיפות', subject: 'science', vector: 'concept_understanding', goalId: 'g-sci-matter' },
  { key: 'science.food_chain', titleHe: 'שרשרת מזון', subject: 'science', vector: 'sequence_causality', goalId: 'g-sci-food' },
  { key: 'science.experiment_design', titleHe: 'תכנון ניסוי', subject: 'science', vector: 'application_inference', goalId: null },
  { key: 'science.facts', titleHe: 'מושגי יסוד', subject: 'science', vector: 'factual', goalId: null },

  { key: 'english.sentence_order', titleHe: 'סדר מילים במשפט', subject: 'english', vector: 'application_inference', goalId: 'g-eng-order' },
  { key: 'english.vocabulary', titleHe: 'אוצר מילים באנגלית', subject: 'english', vector: 'factual', goalId: null },
  { key: 'english.reading', titleHe: 'הבנת טקסט באנגלית', subject: 'english', vector: 'domain_reading', goalId: 'g-eng-read' },

  { key: 'bible.story_sequence', titleHe: 'רצף האירועים בסיפור', subject: 'bible', vector: 'sequence_causality', goalId: 'g-bib-story' },
  { key: 'bible.characters', titleHe: 'דמויות ותפקידיהן', subject: 'bible', vector: 'factual', goalId: 'g-bib-story' },
  { key: 'bible.text_reading', titleHe: 'הבנת פסוקים', subject: 'bible', vector: 'domain_reading', goalId: null },

  { key: 'arabic.vocabulary', titleHe: 'אוצר מילים בערבית', subject: 'arabic', vector: 'factual', goalId: null },
  { key: 'arabic.reading', titleHe: 'קריאת מילים', subject: 'arabic', vector: 'domain_reading', goalId: null },
]

export const MORPHOLOGY_KEY = 'hebrew.morphology.roots_patterns'
export const FRACTIONS_ADD_KEY = 'math.fractions.add_unlike_denominators'

export interface LinkedQuestDef { questId: string; title: string }
export interface MisconceptionDef {
  id: string
  code: string
  titleHe: string
  descriptionHe: string
  conceptKey: string
  subject: SubjectCode
  /* שכבה → שיעור התלמידים המציגים (במקום 'exact' — מספר מדויק פר כיתה) */
  prevalence: Partial<Record<4 | 6, number>>
  linkedQuest: LinkedQuestDef | null
}

export const MISCONCEPTIONS: MisconceptionDef[] = [
  {
    id: 'mc-frac-add-straight', code: 'math.frac_add_straight',
    titleHe: 'חיבור מונים ומכנים ללא מכנה משותף',
    descriptionHe: 'בחיבור ½ + ⅓ מקבלים ⅖: מחברים מונה למונה ומכנה למכנה במקום להביא למכנה משותף.',
    conceptKey: FRACTIONS_ADD_KEY, subject: 'math', prevalence: { 6: 0.42 },
    linkedQuest: { questId: 'demo-q-fractions-add', title: 'שברים בחצר הפיצה — מכנה משותף' },
  },
  {
    id: 'mc-frac-bigger-denominator', code: 'math.frac_bigger_denominator',
    titleHe: 'שבר עם מכנה גדול יותר הוא גדול יותר',
    descriptionHe: 'בהשוואת ⅛ ל-¼ בוחרים ב-⅛ כגדול כי המספר 8 גדול מ-4.',
    conceptKey: 'math.fractions.compare', subject: 'math', prevalence: { 4: 0.35 },
    linkedQuest: null,
  },
  {
    id: 'mc-place-value-digits', code: 'math.place_value_digits',
    titleHe: 'קריאת מספר ספרה אחר ספרה ללא ערך מקום',
    descriptionHe: 'המספר 4,305 נקרא "ארבע-שלוש-אפס-חמש" ולא לפי ערך המקום של כל ספרה.',
    conceptKey: 'math.place_value', subject: 'math', prevalence: { 4: 0.22 },
    linkedQuest: null,
  },
  {
    id: 'mc-heb-root-word', code: 'hebrew.root_equals_word',
    titleHe: 'בלבול בין שורש למילה שלמה',
    descriptionHe: 'מזהים את המילה "מכתבה" כשורש של עצמה ולא מפרידים בין שורש (כ-ת-ב) לבין המשקל.',
    conceptKey: MORPHOLOGY_KEY, subject: 'hebrew', prevalence: { 6: 0.3, 4: 0.18 },
    linkedQuest: { questId: 'demo-q-root-detectives', title: 'בלשי השורש' },
  },
  {
    id: 'mc-heb-gender-agree', code: 'hebrew.agreement_gender',
    titleHe: 'אי-התאמה בין שם עצם לתואר במין',
    descriptionHe: 'כותבים "ילדה גדול" במקום "ילדה גדולה".',
    conceptKey: 'hebrew.grammar.agreement', subject: 'hebrew', prevalence: { 4: 0.26, 6: 0.14 },
    linkedQuest: null,
  },
  {
    id: 'mc-his-order-reverse', code: 'history.timeline_reverse',
    titleHe: 'היפוך סדר כרונולוגי של תקופות סמוכות',
    descriptionHe: 'ממקמים את תקופת בית שני לפני תקופת בית ראשון.',
    conceptKey: 'history.timeline_order', subject: 'history', prevalence: { 6: 0.24 },
    linkedQuest: { questId: 'demo-q-timeline', title: 'מסע על ציר הזמן' },
  },
  {
    id: 'mc-his-single-cause', code: 'history.single_cause',
    titleHe: 'הסבר אירוע היסטורי בסיבה אחת בלבד',
    descriptionHe: 'מסבירים מלחמה או מהפכה בגורם יחיד ומתעלמים מצירוף סיבות.',
    conceptKey: 'history.causes_effects', subject: 'history', prevalence: { 6: 0.31 },
    linkedQuest: null,
  },
  {
    id: 'mc-sci-heavy-sinks', code: 'science.heavier_sinks',
    titleHe: 'כל חפץ כבד שוקע וכל חפץ קל צף',
    descriptionHe: 'מתעלמים מהצפיפות: סירה כבדה צפה וחצץ קטן שוקע.',
    conceptKey: 'science.matter.weight_density', subject: 'science', prevalence: { 4: 0.28, 6: 0.2 },
    linkedQuest: null,
  },
  {
    id: 'mc-eng-hebrew-order', code: 'english.hebrew_word_order',
    titleHe: 'סדר מילים עברי במשפט באנגלית',
    descriptionHe: 'כותבים "house big" במקום "big house" — תואר אחרי שם העצם.',
    conceptKey: 'english.sentence_order', subject: 'english', prevalence: { 4: 0.33, 6: 0.17 },
    linkedQuest: null,
  },
  {
    id: 'mc-bib-mixup', code: 'bible.character_mixup',
    titleHe: 'ערבוב בין דמויות וסיפורים סמוכים',
    descriptionHe: 'מייחסים פעולה של אחת הדמויות לדמות אחרת מאותו סיפור.',
    conceptKey: 'bible.characters', subject: 'bible', prevalence: { 4: 0.21 },
    linkedQuest: null,
  },
]

export const goalById = (id: string | null): GoalDef | null => (id ? GOALS.find((g) => g.id === id) ?? null : null)
export const conceptByKey = (k: string): ConceptDef | undefined => CONCEPTS.find((c) => c.key === k)
export const conceptsOfSubject = (s: SubjectCode): ConceptDef[] => CONCEPTS.filter((c) => c.subject === s)

/* שמות בדויים (אין קשר לאנשים אמיתיים) */
export const FIRST_MALE = ['אורי', 'איתן', 'אסף', 'בן', 'גיא', 'גלעד', 'דור', 'הראל', 'זיו', 'חן', 'טל', 'יהב', 'יונתן', 'כפיר', 'לביא', 'מתן', 'נדב', 'נמרוד', 'עידו', 'עומר', 'פלג', 'צח', 'קורן', 'רן', 'שחר', 'שי', 'תומר', 'אופיר', 'ארז', 'ברק', 'דוד', 'מיכאל', 'ניר', 'סהר', 'עמית', 'רום']
export const FIRST_FEMALE = ['אביגיל', 'אורית', 'אילנה', 'אמית', 'בר', 'גל', 'דניאלה', 'הדר', 'ורד', 'זהר', 'חנה', 'טליה', 'יעל', 'כרמל', 'לילך', 'מור', 'מיכל', 'נוגה', 'ענבר', 'עדן', 'פנינה', 'צליל', 'קרן', 'רותם', 'שירה', 'שקד', 'תהל', 'אלמה', 'ארבל', 'בת-אל', 'דנה', 'הילה', 'ליה', 'סיוון', 'עלמה', 'רוני']
export const LAST_NAMES = ['אברהם', 'בן-דוד', 'ברק', 'גולן', 'דהן', 'הלפרין', 'וקנין', 'זכאי', 'חזן', 'טובי', 'יוגב', 'כהן', 'לביא', 'מזרחי', 'נחום', 'סגל', 'עמר', 'פרידמן', 'צדוק', 'קפלן', 'רוזן', 'שמש', 'תמיר', 'אילון', 'בראון', 'גבאי', 'דרור', 'הרשקוביץ', 'ויצמן', 'זלמן']
