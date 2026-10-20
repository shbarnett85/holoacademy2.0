/* ──────────────────────────────────────────────────────────────────────────
   findingsNarrative — מודול התבניות היחיד לטקסט בשפה טבעית באנליטיקה החדשה (שלב D, ושלב UX).
   · ספק ההדגמה והמנוע האמיתי (שלבים 5–7) מייצרים ממצאים כמבנה נתונים, ורק כאן הם הופכים לטקסט.
   · אסור טקסט קשיח ב-fixtures: כל משפט שמוצג למשתמש על ממצא/המלצה/תדריך/משוב נבנה מכאן.
   · חוק 7: ניסוח תצפיתי בלבד ("נצפה", "ייתכן") — לא שיפוטי, לא תווית. מגמה ולא פסק דין.
   · חוק 1: ה-AI אינו מאבחן; התבניות מתארות נתונים שכבר חושבו.
   · עברית פשוטה למורה עם ניסיון מוגבל במחשב: אין כאן וקטור / p / מובהק / BH / אינדקס / קורלציה /
     הסתברות / גודל אפקט. **פרטים סטטיסטיים חיים רק בקבוצה HOW_WE_CALC** (מוצגים מאחורי "איך חישבנו?").
     נאכף ב-forbiddenWords.test.ts (סורק כל מחרוזת בכל תגובת ספק, פרט לסעיף how_we_calculated בתדריך).
   · מספרים מוצגים כ"11 מתוך 24" (countOf/withPct); אחוז רק בנוסף.
   pure: ללא DOM/Node, ללא Date.now() — התאריכים מגיעים מהקורא.
   ────────────────────────────────────────────────────────────────────────── */
import type { Evidence, InsufficientReason } from '../types/analyticsV2'
import type { FindingKind, Position, Trend } from './analyticsConfig'
import {
  AGE_NORM, AREA_MIN_DELTA, ATTENTION_RULE, CLASS_SUCCESS_BANDS, CLASS_SUMMARY_MIN_COMPLETED, CURRENT_LEVEL_SESSIONS, MIN_CELL_SIZE, MISCONCEPTION_RULE,
  TREND_LABEL_MIN_DELTA, TREND_WINDOWS, contentVectorLabel,
} from './analyticsConfig'
import { subjectName } from './subjects'

/* ── תאריכים: שמות חודשים ומחציות — מחושבים מהתאריך, לא נכתבים ידנית ── */
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
export const monthName = (iso: string): string => MONTHS[new Date(iso).getUTCMonth()] ?? ''
export const monthYear = (iso: string): string => `${monthName(iso)} ${new Date(iso).getUTCFullYear()}`

/* מחצית א׳ = ספטמבר–ינואר; מחצית ב׳ = פברואר–יוני. הקיץ שייך למחצית ב׳ שהסתיימה. */
export type Term = 'half_a' | 'half_b'
export function termOf(iso: string): Term {
  const m = new Date(iso).getUTCMonth() + 1
  return m >= 2 && m <= 8 ? 'half_b' : 'half_a'
}
/* תחילת המחצית האחרונה (≤ היום): 1 בפברואר או 1 בספטמבר */
export function latestTermStart(term: Term, now: Date): Date {
  const month = term === 'half_b' ? 1 : 8 /* 0-based: פברואר / ספטמבר */
  const y = now.getUTCFullYear()
  const cand = new Date(Date.UTC(y, month, 1, 12))
  return cand.getTime() <= now.getTime() ? cand : new Date(Date.UTC(y - 1, month, 1, 12))
}
export const termLabel = (term: Term): string => (term === 'half_b' ? 'מחצית ב׳' : 'מחצית א׳')

/* ── עזרי מספרים ── */
const fmt1 = (x: number): string => (Math.round(x * 10) / 10).toString()
const pct0 = (x: number): number => Math.round(x * 100)
const levelsWord = (n: number): string => {
  const a = Math.abs(Math.round(n * 10) / 10)
  return a === 1 ? 'רמה אחת' : `${fmt1(a)} רמות`
}
/* "ברמה אחת" / "ב-0.6 רמות" — בלי מקף לפני מילה ("ב-רמה אחת" אינו עברית) */
const byLevels = (n: number): string => {
  const a = Math.abs(Math.round(n * 10) / 10)
  return a === 1 ? 'ברמה אחת' : `ב-${fmt1(a)} רמות`
}
const studentsWord = (n: number): string => (n === 1 ? 'תלמיד/ה אחד/ת' : `${n} תלמידים`)
/* "אין עדיין מספיק נתונים" — הניסוח האחיד בכל מקום שבו אין מה לדווח */
export const NO_DATA_YET = 'אין עדיין מספיק נתונים'

/* ── הסתייגויות קבועות (חוקים 7, 11) ── */
export const CAVEAT_AGE_NORM = 'משווים לרמה המיועדת לשכבה בסולם ההדמיות, לא למבחן ארצי. הטווח נועד להקשר בלבד ואינו ציון.'
/* משפט אחד קצר, זהה בכל מסך. ההסבר המלא (סולם משלו לכל מקצוע, אין ציון מאוחד) חי ב-HOW_WE_CALC.lines. */
export const CAVEAT_CROSS_SUBJECT = 'הרמות של מקצועות שונים אינן ניתנות להשוואה ישירה.'
export const CAVEAT_TREND = 'המערכת מתארת מה שנצפה בנתונים ואינה קובעת מה גרם לכך. כל מגמה היא נקודת התחלה לשיחה, לא פסק דין.'
/* ההסתייגויות כפי שהן מגיעות בחוזה — מקור יחיד לכל הספקים והמסכים */
export const ANALYTICS_CAVEATS = { ageNorm: CAVEAT_AGE_NORM, crossSubject: CAVEAT_CROSS_SUBJECT, trend: CAVEAT_TREND } as const

/* הודעות מצב קבועות (נתוני הדגמה; מיפוי תוכנית לימודים לדוגמה) */
export const NOTICE_DEMO_DATA = 'נתוני הדגמה — בית ספר, כיתות ותלמידים בדויים. בחשבון אמיתי יוצגו כאן התלמידים שלכם.'
export const NOTICE_CURRICULUM_SAMPLE = 'מיפוי לדוגמה: יעדי תוכנית הלימודים כאן הם נושאים כלליים להמחשה, ללא קודים או ציטוטים רשמיים של משרד החינוך.'

export interface NarrativeCtx {
  /* שם התלמיד (רק בעדשות שמורשות לראות אותו) או null */
  studentName?: string | null
  subjectName?: string | null
  className?: string | null
}

const who = (c: NarrativeCtx): string => (c.studentName ? c.studentName : 'התלמיד/ה')
const inSubject = (c: NarrativeCtx): string => (c.subjectName ? ` ב${c.subjectName}` : '')

/* ── מגמה ומיקום מול הטווח המיועד — מילים בלבד (צבע אף פעם לא נושא משמעות לבד) ── */
/* לתלמיד/ה */
export const TREND_TEXT: Record<Trend, string> = { improving: 'משתפר/ת', steady: 'יציב/ה', declining: 'בירידה', insufficient: NO_DATA_YET }
/* לכיתה / שכבה / מקצוע ("המגמה: בעלייה") */
export const GROUP_TREND_TEXT: Record<Trend, string> = { improving: 'בעלייה', steady: 'יציבה', declining: 'בירידה', insufficient: NO_DATA_YET }
export const POSITION_TEXT: Record<Position, string> = {
  above: 'מעל הטווח המיועד לשכבה',
  within: 'בתוך הטווח המיועד לשכבה',
  below: 'מתחת לטווח המיועד לשכבה',
}
export const trendText = (t: Trend): string => TREND_TEXT[t]
export const groupTrendText = (t: Trend): string => GROUP_TREND_TEXT[t]
export const positionText = (p: Position | null): string | null => (p ? POSITION_TEXT[p] : null)

/* ── שמות הדפוסים וספירתם ("אין מספיק נתונים") ── */
const KIND_NOUN: Record<FindingKind, string> = {
  level_trend: 'שינוי ברמה',
  class_concept_improvement: 'שינוי בכיתה',
  memory_random_pattern: 'צורת המשחק במשחק הזיכרון',
  position_bias: 'הנטייה לבחור בתשובה הראשונה',
  reading_skip: 'קצב הקריאה',
  cross_subject_dip: 'שינוי בכמה מקצועות יחד',
}
/* יחידת הספירה של כל סוג ממצא — [יחיד, רבים] */
const KIND_UNIT: Record<FindingKind, [string, string]> = {
  level_trend: ['הדמיה אחת', 'הדמיות'],
  class_concept_improvement: ['תלמיד/ה אחד/ת', 'תלמידים'],
  memory_random_pattern: ['משחק זיכרון אחד', 'משחקי זיכרון'],
  position_bias: ['שאלה אחת', 'שאלות'],
  reading_skip: ['שקף אחד', 'שקפים'],
  cross_subject_dip: ['מקצוע אחד', 'מקצועות'],
}
export const unitCount = (kind: FindingKind, n: number): string => (n === 1 ? KIND_UNIT[kind][0] : `${n} ${KIND_UNIT[kind][1]}`)
export const sessionsCount = (n: number): string => unitCount('level_trend', n)

export function narrateInsufficient(kind: FindingKind, reason: InsufficientReason, n: number, minN: number, c: NarrativeCtx = {}): string {
  const head = `${NO_DATA_YET} כדי לדבר על ${KIND_NOUN[kind]}${inSubject(c)}`
  if (reason === 'n_below_min') return `${head}: עד עכשיו יש ${unitCount(kind, n)}, וכדי לדווח צריך לפחות ${minN}. כשיצטברו עוד נתונים נדווח כאן.`
  return `${head}: יש עד עכשיו ${unitCount(kind, n)}, אבל עדיין אי אפשר לומר בביטחון אם יש כאן דפוס. נמשיך לעקוב.`
}

/* שם המקצוע לרשימת cross_subject — הקורא מספק מחרוזת מוכנה */
export function joinSubjectNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  const last = names[names.length - 1]
  return names.slice(0, -1).join(', ') + (/^\d/.test(last) ? ' ו-' : ' ו') + last /* "ו-3 תלמידים", אבל "ומדעים" */
}

const wordsPerSecond = (msPerWord: number): number => Math.max(1, Math.round(1000 / msPerWord))

/* ── ממצא מדווח ── */
export function narrateFinding(e: Evidence, c: NarrativeCtx = {}): string {
  const name = who(c)
  switch (e.kind) {
    case 'level_trend': {
      const m = monthName(e.changeDate)
      const rates = `ההצלחה הממוצעת ב-${e.sessionsAfter} ההדמיות האחרונות — ${pct0(e.successAfter)}%, לעומת ${pct0(e.successBefore)}% ב-${e.sessionsBefore} ההדמיות שלפניהן.`
      if (e.direction === 'down') {
        return `${name}${inSubject(c)}: מחודש ${m} נצפתה ירידה ברמה, מ-${fmt1(e.fromLevel)} ל-${fmt1(e.toLevel)} (${levelsWord(e.deltaLevels)}). ${rates} זו תצפית על שינוי; הנתונים אינם מסבירים את הסיבה.`
      }
      return `${name}${inSubject(c)}: מחודש ${m} נצפתה עלייה ברמה, מ-${fmt1(e.fromLevel)} ל-${fmt1(e.toLevel)} (${levelsWord(e.deltaLevels)}). ${rates}`
    }
    case 'class_concept_improvement': {
      const since = `${termLabel(e.term)} (${monthYear(e.sinceDate)})`
      const where = `${c.subjectName ? `ב${c.subjectName}, ` : ''}${c.className ? `בכיתה ${c.className}` : 'בכיתה'}`
      if (e.meanDelta < 0) {
        return `${where} נצפתה ירידה ב${e.conceptTitle} מאז תחילת ${since}: רק ${countOf(e.improvedCount, e.studentsCount)} תלמידים השתפרו, ובממוצע הרמה ירדה ${byLevels(e.meanDelta)}.`
      }
      return `${where} נצפה שיפור ב${e.conceptTitle} מאז תחילת ${since}: ${countOf(e.improvedCount, e.studentsCount)} תלמידים השתפרו, ובממוצע עלו ${levelsWord(e.meanDelta)}.`
    }
    case 'memory_random_pattern': {
      const found = Math.round(e.observedRate * e.turns)
      const lead = e.randomLikelihood >= 0.9 ? 'נראה ש' : 'ייתכן ש'
      return `${name}${inSubject(c)}: ב-${e.games} משחקי זיכרון, כשהזוג של הקלף שנפתח כבר נחשף קודם, הוא נמצא ב-${countOf(found, e.turns)} פעמים (${pct0(e.observedRate)}%). בדרך כלל זה קורה בכ-${pct0(e.attentiveRate)}% מהפעמים. ${lead}הלחיצות היו מהירות או לא מתוכננות; זו תצפית על המשחק, לא הסבר לסיבה.`
    }
    case 'position_bias':
      return `${name}${inSubject(c)}: בשאלות עם כמה תשובות לבחירה, התשובה הראשונה נבחרה ב-${countOf(e.firstChoices, e.items)} שאלות (${pct0(e.observedShare)}%). כשמיקום התשובה לא משפיע, מצפים לכ-${pct0(e.expectedShare)}%. נראה שיש נטייה לבחור בתשובה הראשונה בלי קשר לתוכן; זו תצפית, לא הסבר.`
    case 'reading_skip':
      return `${name}${inSubject(c)}: ב-${e.scenes} שקפים המעבר לשקף הבא היה מהיר במיוחד — כ-${wordsPerSecond(e.msPerWord)} מילים בשנייה, לעומת כ-${wordsPerSecond(e.classMedianMsPerWord)} אצל רוב הכיתה. ייתכן שהטקסט נקרא בחטף; כדאי לבדוק בשיחה קצרה או בצפייה בהדמיה.`
    case 'cross_subject_dip': {
      const list = joinSubjectNames(e.subjects.map((s) => subjectName(s.code)))
      return `${name}: מחודש ${monthName(e.startDate)} נצפתה ירידה ברמה בכמה מקצועות בו-זמנית (${list}). כשהירידה מופיעה בכמה מקצועות יחד, ייתכן שהסיבה אינה קשורה למקצוע מסוים. כדאי לשוחח עם התלמיד/ה; הנתונים אינם מסבירים מה גרם לכך.`
    }
  }
}

/* גוף המשפט הקצר — בלי הפתיח (שם התלמיד/ה או הכיתה) ובלי נקודה: "ירידה ברמה בהיסטוריה מאז יוני".
   המקצוע (אם יש) כלול בגוף, כדי שאפשר יהיה לשלב אותו בכותרות ("הדחוף ביותר: …"). */
export function narrateShortBody(e: Evidence, c: NarrativeCtx = {}): string {
  const sub = inSubject(c)
  switch (e.kind) {
    case 'level_trend':
      return `${e.direction === 'down' ? 'ירידה' : 'עלייה'} ברמה${sub} מאז ${monthName(e.changeDate)}`
    case 'class_concept_improvement':
      return `${e.meanDelta < 0 ? 'ירידה' : 'שיפור'} ב${e.conceptTitle} מאז תחילת ${termLabel(e.term)} — ${countOf(e.improvedCount, e.studentsCount)} תלמידים השתפרו`
    case 'memory_random_pattern':
      return `דפוס הלחיצות במשחק הזיכרון${sub} ראוי לבדיקה`
    case 'position_bias':
      return `נטייה לבחור בתשובה הראשונה${sub}`
    case 'reading_skip':
      return `מעבר מהיר מאוד בין שקפים${sub} — ייתכן שהטקסט נקרא בחטף`
    case 'cross_subject_dip':
      return `ירידה ברמה בכמה מקצועות יחד (${joinSubjectNames(e.subjects.map((s) => subjectName(s.code)))})`
  }
}

/* משפט קצר אחד — להתרעות במסך הכניסה, לסיכום המקצוע ולציר ההתקדמות: "אלון: ירידה ברמה בהיסטוריה מאז יוני." */
export function narrateShort(e: Evidence, c: NarrativeCtx = {}): string {
  const lead = e.kind === 'class_concept_improvement' ? (c.className ? `בכיתה ${c.className}` : 'בכיתה') : who(c)
  return `${lead}: ${narrateShortBody(e, c)}.`
}

/* ── טעויות נפוצות והמלצות ── */
export interface MisconceptionNarrativeInput {
  titleHe: string
  conceptTitle: string
  studentsShowing: number
  studentsExposed: number
  sharePct: number
  /* נשמר לתאימות; הניסוח אינו מציג סף טכני (הוא ב"איך חישבנו?") */
  minHits?: number
  gradeLabel?: string
}

export function narrateRecommendation(m: MisconceptionNarrativeInput, hasLinkedQuest: boolean): string {
  const base = `מומלץ להקדיש חלק מהשיעור הבא ל${m.conceptTitle}: ${countOf(m.studentsShowing, m.studentsExposed)} תלמידים (${m.sharePct}%) חוזרים על אותה טעות — "${m.titleHe}".`
  return hasLinkedQuest ? `${base} יש הדמיה ממוקדת לטעות הזאת.` : base
}

/* "21 מתוך 50 תלמידים (42%)" — שורת הספירה של טעות נפוצה */
export function studentsCountText(showing: number, exposed: number): string {
  return exposed > 0 ? `${countOf(showing, exposed)} תלמידים (${Math.round((100 * showing) / exposed)}%)` : `${countOf(showing, exposed)} תלמידים`
}
export function narrateMisconceptionInsufficient(exposed: number): string {
  return `${NO_DATA_YET}: ${studentsWord(exposed)} ענו על שאלות בנושא, וצריך לפחות ${MIN_CELL_SIZE}.`
}

export function narrateAdminMisconception(titleHe: string, showing: number, exposed: number, gradeLabel: string): string {
  return `${countOf(showing, exposed)} תלמידי שכבה ${gradeLabel} (${Math.round((100 * showing) / exposed)}%) חוזרים על הטעות "${titleHe}".`
}

/* ── תחומים, תדריך (ישיבה פדגוגית + בסיס) ── */
export function narrateStrengthAbove(subjectName: string, level: number, normCenter: number): string {
  return `ב${subjectName} הרמה הנוכחית (${fmt1(level)}) גבוהה מהרמה המיועדת לשכבה בסולם ההדמיות (${fmt1(normCenter)}).`
}
export function narrateDifficultyBelow(subjectName: string, level: number, normCenter: number): string {
  return `ב${subjectName} הרמה הנוכחית (${fmt1(level)}) נמוכה מהרמה המיועדת לשכבה בסולם ההדמיות (${fmt1(normCenter)}); זו נקודת ייחוס להקשר ולא מדד ליכולת.`
}
/* "בתחום "ידע עובדתי"" — ושם תחום שכבר מסתיים ב"בתחום" ("הבנת הנקרא בתחום") לא מקבל "בתחום" כפול: ב"הבנת הנקרא בתחום" */
export function areaRef(vectorKey: string): string {
  const label = contentVectorLabel(vectorKey)
  return /בתחום$/.test(label.trim()) ? `ב"${label}"` : `בתחום "${label}"`
}
export function narrateVectorStrength(vectorKey: string, subjectName: string, level: number, subjectLevel: number): string {
  return `ב${subjectName}, הרמה ${areaRef(vectorKey)} (${fmt1(level)}) גבוהה מהרמה הכללית במקצוע (${fmt1(subjectLevel)}).`
}
export function narrateVectorGap(vectorKey: string, subjectName: string, level: number, subjectLevel: number): string {
  return `ב${subjectName}, הרמה ${areaRef(vectorKey)} (${fmt1(level)}) נמוכה מהרמה הכללית במקצוע (${fmt1(subjectLevel)}).`
}
export function narrateRecommendationFromFinding(e: Evidence, c: NarrativeCtx): string {
  const sub = c.subjectName ?? 'המקצוע'
  switch (e.kind) {
    case 'level_trend':
      return e.direction === 'down'
        ? `מומלץ לקיים שיחה קצרה עם ${who(c)} ולבדוק מה השתנה מאז ${monthName(e.changeDate)}, ולשקול חזרה על חומר ${sub} בקצב מותאם.`
        : `מומלץ לחזק את ההישג ב${sub} ולהציע אתגרים ברמה המתקדמת הבאה.`
    case 'class_concept_improvement':
      return `מומלץ להמשיך במה שנעשה ב${e.conceptTitle} ולבחון אילו פעילויות תרמו לשיפור.`
    case 'memory_random_pattern':
      return `מומלץ להציע משחק זיכרון קצר בליווי, ולבחון אם הלחיצות משקפות קושי בהבנת המשימה או היסח דעת.`
    case 'position_bias':
      return `מומלץ להזכיר שאין קשר בין מיקום האפשרות לנכונותה, ולעודד קריאה של כל האפשרויות לפני בחירה.`
    case 'reading_skip':
      return `מומלץ להציע קריאה מוקרנת או הקראה בקול של טקסט ההדמיה, ולבחון אם קצב הקריאה משתנה.`
    case 'cross_subject_dip':
      return `מומלץ לשוחח עם ${who(c)} ועם צוות המורים על גורם כללי שייתכן שמשפיע על כמה מקצועות במקביל.`
  }
}
export function narrateUnknown(kind: FindingKind, n: number, minN: number, c: NarrativeCtx): string {
  return narrateInsufficient(kind, 'n_below_min', n, minN, c)
}
/* ירידה ברמה — ניסוח קצר לסעיף "קשיים" בתדריך (הפירוט המלא בסעיף "מגמה") */
export function narrateDifficultyFromTrend(subjectName: string, changeIso: string, deltaLevels: number): string {
  return `ב${subjectName}: הרמה ירדה ${byLevels(deltaLevels)} מאז ${monthName(changeIso)} (הפירוט בסעיף המגמה).`
}
export const EVIDENCE_LIMITS_NOTE =
  'מידע שאינו זמין למערכת: התנהגות בכיתה, ציונים במבחנים, ידע קודם והקשר אישי או משפחתי. יש להצליב את הנתונים עם התרשמות המורה לפני כל החלטה.'

/* ── שורות ראיה פשוטות (בלי מונחים סטטיסטיים): "מבוסס על 10 הדמיות, מדצמבר 2025 עד אוקטובר 2026" ── */
export const basisLine = (what: string, startIso: string, endIso: string): string =>
  `מבוסס על ${what}, מ${monthYear(startIso)} עד ${monthYear(endIso)}`
/* מה הממצא מבוסס עליו — ביחידות של הסוג שלו */
export function basisWhat(e: Evidence): string {
  switch (e.kind) {
    case 'level_trend': return sessionsCount(e.sessionsBefore + e.sessionsAfter)
    case 'class_concept_improvement': return unitCount('class_concept_improvement', e.studentsCount)
    case 'memory_random_pattern': return unitCount('memory_random_pattern', e.games)
    case 'position_bias': return unitCount('position_bias', e.items)
    case 'reading_skip': return unitCount('reading_skip', e.scenes)
    case 'cross_subject_dip': return unitCount('cross_subject_dip', e.subjects.length)
  }
}
export const narrateEvidenceWindow = (startIso: string, endIso: string, sessions: number, subject?: string): string =>
  `${subject ? `${subject} — ` : ''}${basisLine(sessionsCount(sessions), startIso, endIso)}`
export const basedOnSessions = (sessions: number): string => `מבוסס על ${sessionsCount(sessions)}`
export const basedOnChallenges = (n: number): string => (n === 1 ? 'מבוסס על אתגר אחד בתחום' : `מבוסס על ${n} אתגרים בתחום`)

/* ── משוב לתלמיד/ה — צמיחה בלבד, בלי השוואה לאחרים ובלי תוויות ── */
export function narrateFeedbackGrowth(subjectName: string, deltaLevels: number, sinceIso: string): string {
  return `השתפרת ב${subjectName}! מאז ${monthName(sinceIso)} עלית ${levelsWord(deltaLevels)}. כל הכבוד על ההתמדה.`
}
export function narrateFeedbackStreak(subjectNames: string, sessions: number): string {
  return `השלמת ${sessions} הדמיות ב${subjectNames} לאחרונה. הרצף הזה מראה התמדה.`
}
export function narrateFeedbackNextStep(subjectName: string, conceptTitle: string | null): string {
  return conceptTitle
    ? `הצעד הבא ב${subjectName}: עוד תרגול קצר ב${conceptTitle}. כל תרגול מקרב אותך להצלחה.`
    : `הצעד הבא ב${subjectName}: להמשיך לשחק ולנסות אתגרים חדשים. כל ניסיון מלמד משהו.`
}
/* פתיח תצוגת "כך התלמיד/ה רואה" — מופיע למורה בלבד, מעל מה שהתלמיד/ה רואה */
export const FEEDBACK_INTRO_TEXT = 'כך נראה המסך לתלמיד/ה. אין בו השוואה לתלמידים אחרים.'
export function narrateFeedbackHeadline(firstName: string, hasGrowth: boolean): string {
  return hasGrowth ? `שלום ${firstName}, הנה מה שהשתפר אצלך לאחרונה` : `שלום ${firstName}, הנה סיכום הפעילות שלך`
}

/* ══════════════════════════════════════════════════════════════════════════
   משפטי סיכום למסכים החדשים (כניסה / סקירת כיתה / מקצוע / תלמיד / מנהל)
   ══════════════════════════════════════════════════════════════════════════ */
const attentionSentence = (n: number): string => (n === 0 ? 'אין כרגע תלמידים לתשומת לב.' : `${attentionBadgeText(n)}.`)
const POSITION_SHORT: Record<Position, string> = { above: 'מעל הטווח המיועד לשכבה', within: 'בתוכו', below: 'מתחתיו' }

export interface OverviewSummaryInput { className: string; above: number; within: number; below: number; attentionStudents: number }
/* משפט הסיכום של "סקירת הכיתה" (מחנך) */
export function narrateOverviewSummary(i: OverviewSummaryInput): string {
  const measured = i.above + i.within + i.below
  if (measured === 0) return `בכיתה ${i.className}: ${NO_DATA_YET} על הרמה במקצועות. התמונה תופיע כשתלמידים יסיימו הדמיות.`
  const parts: string[] = []
  let first = true
  for (const [n, p] of [[i.above, 'above'], [i.within, 'within'], [i.below, 'below']] as const) {
    if (!n) continue
    parts.push(`${n} ${first ? POSITION_TEXT[p] : POSITION_SHORT[p]}`)
    first = false
  }
  return `בכיתה ${i.className}, מתוך ${measured} מקצועות: ${parts.join(', ')}. ${attentionSentence(i.attentionStudents)}`
}

/* מילת החיבור בין המיקום למגמה: "ו" כששניהם באותו כיוון (או כשהמגמה יציבה), "אך" כשהם מנוגדים.
   מיקום "מעל" ו"בתוך" הטווח נחשבים טובים, "מתחת" גרוע; מגמה "בעלייה" טובה, "בירידה" גרועה, "יציבה" ניטרלית. */
export type Connective = 'ו' | 'אך'
export function trendConnective(position: Position, trend: Trend): Connective | null {
  if (trend === 'insufficient') return null
  const positionGood = position !== 'below'
  return (positionGood && trend === 'declining') || (!positionGood && trend === 'improving') ? 'אך' : 'ו'
}
const TREND_CLAUSE: Record<Exclude<Trend, 'insufficient'>, string> = { improving: 'המגמה בעלייה', steady: 'המגמה יציבה', declining: 'המגמה בירידה' }

export interface SubjectHeadlineInput { className: string; subject: string; position: Position | null; trend: Trend; attentionStudents: number }
/* משפט הסיכום של מקצוע בכיתה */
export function narrateSubjectHeadline(i: SubjectHeadlineInput): string {
  if (!i.position) return `בכיתה ${i.className}: ${NO_DATA_YET} על הרמה ב${i.subject}. התמונה תופיע כשתלמידים יסיימו הדמיות.`
  const joiner = trendConnective(i.position, i.trend)
  /* "ו" נצמד למילה ("והמגמה"); "אך" עומד לבדו ("אך המגמה") */
  const trendClause = joiner && i.trend !== 'insufficient' ? `, ${joiner === 'ו' ? `ו${TREND_CLAUSE[i.trend]}` : `אך ${TREND_CLAUSE[i.trend]}`}` : ''
  return `בכיתה ${i.className} הרמה ב${i.subject} ${POSITION_TEXT[i.position]}${trendClause}. ${attentionSentence(i.attentionStudents)}`
}

export interface StudentHeadlineInput {
  firstName: string
  attention: number
  positive: number
  crossSubject: boolean
  /* הממצא החשוב ביותר בטון "תשומת לב" (גוף משפט מ-narrateShortBody, בלי שם); כשחסר — ניסוח כללי */
  topAttention?: string | null
}
/* משפט הסיכום של עמוד התלמיד: אומר מה נצפה, לא "יש משהו לבדוק".
   אחד: "אלון: ירידה ברמה בהיסטוריה מאז יוני." · כמה: "… יש 3 דברים שכדאי לבדוק. הדחוף ביותר: …" */
export function narrateStudentHeadline(i: StudentHeadlineInput): string {
  const top = i.topAttention ?? null
  if (i.crossSubject) return top ? `${i.firstName}: ${top} — כדאי לשוחח.` : `${i.firstName}: נצפתה ירידה ברמה בכמה מקצועות יחד — כדאי לשוחח.`
  if (i.attention > 0) {
    if (i.attention === 1) return top ? `${i.firstName}: ${top}.` : `${i.firstName}: יש דבר אחד שכדאי לבדוק.`
    return top ? `${i.firstName}: יש ${i.attention} דברים שכדאי לבדוק. הדחוף ביותר: ${top}.` : `${i.firstName}: יש ${i.attention} דברים שכדאי לבדוק.`
  }
  if (i.positive > 0) return `${i.firstName}: נצפתה התקדמות.`
  return `${i.firstName}: אין כרגע דבר חריג לדווח.`
}

/* ── מסך הכניסה: כותרת רצועת "דורש תשומת לב" והמשך הרשימה ──
   shown = כמה התרעות מוצגות ברצועה; total = כמה תלמידים לתשומת לב יש בהיקף שהצופה רשאי לראות (אותו מספר כמו בכרטיסי הכיתות). */
export function narrateAlertsTitle(shown: number, total: number): string {
  if (total <= 0) return ANALYTICS_TEXT.alertsTitle /* אין רצועה להציג; תווית ניטרלית (גם למנהל, שלא מקבל נתוני תלמידים) */
  if (total <= shown) return attentionBadgeText(total)
  return `${countOf(shown, total)} התלמידים לתשומת לב — הדחופים ביותר`
}
/* "ועוד 2 תלמידים בכיתה" — או null כשהכול מוצג */
export function narrateAlertsMore(shown: number, total: number, manyClasses = false): string | null {
  const rest = total - shown
  if (rest <= 0) return null
  const where = manyClasses ? 'בכיתות' : 'בכיתה'
  return rest === 1 ? `ועוד תלמיד/ה אחד/ת ${where}` : `ועוד ${rest} תלמידים ${where}`
}

/* ── משפט אחד לכל תת-טאב של מקצוע בכיתה (טעויות נפוצות · התקדמות · תלמידים) ── */
export interface StudentsTabInput { total: number; improving: number; steady: number; declining: number }
/* "20 מתוך 22 תלמידים בירידה." — הקבוצה הגדולה ראשונה, ואחריה השאר */
export function narrateStudentsTabSummary(i: StudentsTabInput): string {
  if (i.total <= 0) return EMPTY_TEXT.noStudents
  const measured = i.improving + i.steady + i.declining
  if (measured === 0) return `${NO_DATA_YET} על מגמות התלמידים. הן יופיעו כשתלמידים יסיימו עוד הדמיות.`
  const one = (n: number): string => (n === 1 ? 'תלמיד/ה אחד/ת' : `${n} תלמידים`)
  /* סדר ההשוואה בשוויון: ירידה, אחר כך שיפור, אחר כך יציבות — מה שדורש תשומת לב קודם */
  const groups = [
    { n: i.declining, label: () => 'בירידה' },
    { n: i.improving, label: (n: number) => (n === 1 ? 'משתפר/ת' : 'משתפרים') },
    { n: i.steady, label: (n: number) => (n === 1 ? 'יציב/ה' : 'יציבים') },
  ].filter((g) => g.n > 0).sort((a, b) => b.n - a.n)
  const [first, ...others] = groups
  const lead = first.n === i.total && i.total > 1 ? `כל ${i.total} התלמידים ${first.label(first.n)}` : `${countOf(first.n, i.total)} תלמידים ${first.label(first.n)}`
  const unknown = i.total - measured
  const tail = [
    others.length ? `, ${joinSubjectNames(others.map((g) => `${one(g.n)} ${g.label(g.n)}`))}` : '',
    unknown > 0 ? `, ולגבי ${one(unknown)} ${NO_DATA_YET}` : '',
  ].join('')
  return `${lead}${tail}.`
}

export interface ProgressTabInput {
  /* n = כמה תלמידים תרמו נתון באותו חודש (אם ידוע) */
  series: { date: string; level: number; n?: number }[]
}
/* "הרמה הממוצעת עלתה ב-0.6 רמות מאז ספטמבר." — מהחודש הראשון בגרף לאחרון.
   חודש שתרמו לו פחות ממחצית מהתלמידים שתרמו בחודש העמוס ביותר לא משמש נקודת קצה (חודש עם תלמיד/ה בודד/ת היה מטעה). */
export function narrateProgressTabSummary(i: ProgressTabInput): string {
  const maxN = Math.max(1, ...i.series.map((p) => p.n ?? 0))
  const usable = i.series.filter((p) => p.n === undefined || p.n * 2 >= maxN)
  if (usable.length < 2) return EMPTY_TEXT.noProgress
  const first = usable[0]
  const last = usable[usable.length - 1]
  const delta = Math.round((last.level - first.level) * 10) / 10
  /* שם החודש לבדו ("מאז ספטמבר"); רק כשעברה כמעט שנה שלמה מוסיפים שנה, כדי שלא יהיה ספק איזה ספטמבר */
  const f = new Date(first.date)
  const l = new Date(last.date)
  const monthsApart = (l.getUTCFullYear() - f.getUTCFullYear()) * 12 + (l.getUTCMonth() - f.getUTCMonth())
  const since = monthsApart >= 11 ? monthYear(first.date) : monthName(first.date)
  if (delta === 0) return `הרמה הממוצעת של הכיתה כמעט לא השתנתה מאז ${since}.`
  return `הרמה הממוצעת ${delta > 0 ? 'עלתה' : 'ירדה'} ${byLevels(delta)} מאז ${since}.`
}

export interface ErrorsTabInput {
  /* שמות הטעויות הנפוצות בכיתה, מהנפוצה ביותר */
  common: string[]
  /* האם יש לפחות טעות אחת עם מספיק נתונים לדיווח */
  anyReported: boolean
  /* כמה שמות לקרוא במשפט (השאר: "ועוד N") */
  maxTitles: number
}
/* "2 טעויות נפוצות: "א" ו"ב"." */
export function narrateErrorsTabSummary(i: ErrorsTabInput): string {
  if (!i.anyReported) return EMPTY_TEXT.noCommonErrors
  if (i.common.length === 0) return 'אין כרגע טעות שחוזרת אצל חלק גדול מהכיתה.'
  const titles = i.common.slice(0, Math.max(1, i.maxTitles)).map((t) => `"${t}"`)
  const hidden = i.common.length - titles.length
  const count = i.common.length === 1 ? 'טעות נפוצה אחת' : `${i.common.length} טעויות נפוצות`
  return `${count}: ${joinSubjectNames(titles)}${hidden > 0 ? ` ועוד ${hidden}` : ''}.`
}

/* ── מנהל: משפטים ללא שם/מזהה תלמיד וללא מידע על מורים ── */
export function narrateAdminSchool(grades: number, classes: number, students: number): string {
  const g = grades === 1 ? 'בשכבה אחת' : `ב-${grades} שכבות`
  const c = classes === 1 ? 'כיתה אחת' : `${classes} כיתות`
  return `בבית הספר ${students} תלמידים, ב-${c}, ${g}.`
}
export function narrateAdminPosition(gradeLabel: string, subject: string, position: Position): string {
  return `בשכבה ${gradeLabel} הרמה ב${subject} ${POSITION_TEXT[position]}.`
}
export const ADMIN_HIDDEN_CELL_TEXT = `מעט תלמידים מדי להצגה (פחות מ-${MIN_CELL_SIZE}), כדי לשמור על פרטיות`
export function narrateAdminGradeSummary(gradeLabel: string, above: number, within: number, below: number): string {
  const shown = above + within + below
  if (!shown) return `בשכבה ${gradeLabel}: ${NO_DATA_YET}.`
  const parts: string[] = []
  let first = true
  for (const [n, p] of [[above, 'above'], [within, 'within'], [below, 'below']] as const) {
    if (!n) continue
    parts.push(`${countOf(n, shown)}${first ? ' מקצועות ' + POSITION_TEXT[p] : ' ' + POSITION_SHORT[p]}`)
    first = false
  }
  return `בשכבה ${gradeLabel}: ${parts.join(', ')}.`
}
export function narrateAdminSubjectSummary(subject: string, parts: { gradeLabel: string; position: Position | null }[]): string {
  const body = parts.map((p) => `שכבה ${p.gradeLabel} — ${p.position ? POSITION_TEXT[p.position] : NO_DATA_YET}`).join('; ')
  return `ב${subject}: ${body}.`
}

/* ── כותרות תדריך, הודעות שגיאה ושורות עזר (כל טקסט שמוצג — מכאן) ── */
export const BRIEFING_SECTION_TITLES = {
  strengths: 'חוזקות',
  difficulties: 'קשיים',
  trend: 'מגמה',
  recommendations: 'המלצות',
  unknowns: 'מה עדיין לא ידוע',
  evidence_basis: 'על מה זה מבוסס',
  how_we_calculated: 'איך חישבנו?',
} as const
export const briefingTitleStudent = (name: string): string => `תדריך לישיבה פדגוגית — ${name}`
export const briefingTitleClass = (className: string): string => `תדריך כיתתי לישיבה פדגוגית — כיתה ${className}`
export const briefingSubtitleStudent = (className: string, subjectNames: string[] | null): string =>
  `כיתה ${className}${subjectNames && subjectNames.length ? ` · ${subjectNames.join(', ')}` : ''}`
export const briefingSubtitleClass = (subjectNames: string[]): string => subjectNames.join(', ')
export const ERR_AGGREGATE_ONLY = 'נתוני תלמידים ברמה האישית אינם זמינים לתפקיד זה — רק תמונות רחבות ומגמות'
export const ERR_NO_ACCESS = 'אין הרשאה לצפות בנתון זה'
export const ERR_NOT_FOUND = 'לא נמצא'
/* טווח מספרי נכתב במילים ("מ-8.5 עד 11.5") ולא במקף בין שני מספרים: בתוך פסקה מימין לשמאל המקף היה הופך את הסדר ל-"11.5–8.5".
   כל טקסט מספרי חדש עם טווח עובר דרך numberRange. */
export const numberRange = (low: number, high: number): string => `מ-${fmt1(low)} עד ${fmt1(high)}`
export const normBandLine = (low: number, high: number): string => `הטווח המיועד לשכבה: ${numberRange(low, high)}`
/* "יש עד עכשיו 3 הדמיות; כדי לדווח צריך לפחות 8" */
export const needMoreLine = (kind: FindingKind, n: number, minN: number): string => `יש עד עכשיו ${unitCount(kind, n)}; כדי לדווח צריך לפחות ${minN}`
export const exposuresLine = (minExposures: number): string => `לפחות ${minExposures} שאלות בנושא לכל תלמיד/ה`

/* ── טקסטי מצב ריק ותוויות מסכים — עברית פשוטה, אומרים מה קורה ומה יקרה ── */
export const EMPTY_TEXT = {
  noRecent: 'עוד אין אירועים בולטים לדווח עליהם. הם יופיעו כאן כשיצטברו מספיק נתונים.',
  noFindings: 'לא נמצא בינתיים דבר חריג. אם יתברר משהו בולט, הוא יופיע כאן.',
  noProgress: 'עוד אין מספיק הדמיות כדי להציג התקדמות. הגרף יופיע כאן כשתלמידים יסיימו כמה הדמיות.',
  noCommonErrors: 'עוד אין טעויות נפוצות לדווח עליהן. הן יופיעו כאן כשיצטברו מספיק תשובות.',
  noAreas: 'עוד אין מספיק נתונים על תחומים חזקים ותחומים מאתגרים.',
  noAlerts: 'אין כרגע תלמידים שדורשים תשומת לב.',
  noClasses: 'עוד אין כיתות להצגה.',
  noStudents: 'עוד אין תלמידים להצגה.',
} as const

export const ANALYTICS_TEXT = {
  entryTitle: 'בחרו כיתה',
  alertsTitle: 'דורש תשומת לב',
  classTabs: { overview: 'סקירה' },
  subjectTabs: { summary: 'סיכום', misconceptions: 'טעויות נפוצות', progress: 'התקדמות', students: 'תלמידים' },
  adminTabs: { overview: 'סקירה', grades: 'שכבות', subjects: 'מקצועות', misconceptions: 'טעויות נפוצות' },
  labels: {
    strongAreas: 'תחומים חזקים',
    challengingAreas: 'תחומים מאתגרים',
    trend: 'מגמה',
    level: 'רמה',
    whatHappenedLately: 'מה קרה לאחרונה',
    whatToTeach: 'מה ללמד בשיעור הבא',
    commonErrors: 'טעויות נפוצות',
  },
} as const

/* ══════════════════════════════════════════════════════════════════════════
   HOW_WE_CALC — הקבוצה היחידה שבה מותר פירוט חישובי/סטטיסטי. מוצגת בממשק רק מאחורי "איך חישבנו?"
   (ובתדריך — בסעיף how_we_calculated). כל מחרוזת מחוץ לקבוצה הזאת נקייה ממונחים טכניים.
   ══════════════════════════════════════════════════════════════════════════ */
function evidenceLinesTechnical(n: number, pAdj: number | null, effect: number | null, startIso: string, endIso: string): string[] {
  const out = [`N = ${n}`, `חלון: מ${monthYear(startIso)} עד ${monthYear(endIso)}`]
  if (pAdj !== null) out.push(`p מתוקן (BH) = ${pAdj < 0.001 ? '< 0.001' : (Math.round(pAdj * 1000) / 1000).toString()}`)
  if (effect !== null) out.push(`גודל אפקט = ${fmt1(effect)}`)
  return out
}
export const HOW_WE_CALC = {
  title: 'איך חישבנו?',
  /* ההערה המתודולוגית של התדריך */
  methodNote:
    'הממצאים מבוססים על תשובות ופעילות בהדמיות בלבד. כל דפוס מדווח רק לאחר שעמד בסף מינימום של תצפיות, בתיקון Benjamini-Hochberg לבדיקות מרובות ובגודל אפקט מינימלי. המערכת אינה מאבחנת ואינה קובעת את סיבות ההתנהגות.',
  /* שורות ראיה טכניות לממצא: N, חלון, p מתוקן, גודל אפקט */
  evidenceLines: evidenceLinesTechnical,
  /* תווית פריט בסעיף "איך חישבנו?" בתדריך — שם הדפוס (+ מקצוע) */
  itemLabel: (kind: FindingKind, subject?: string | null): string => `${KIND_NOUN[kind]}${subject ? ` ב${subject}` : ''}`,
  /* הסברי החישוב בשפה פשוטה (כולל הספים מהקונפיג) — מוצגים מאחורי "איך חישבנו?" בכל מסך */
  lines: [
    `הרמה הנוכחית במקצוע = ממוצע הרמה ב-${CURRENT_LEVEL_SESSIONS} ההדמיות האחרונות.`,
    `הטווח המיועד לשכבה = הרמה המיועדת לשכבה בסולם ההדמיות, פלוס מינוס ${AGE_NORM.bandHalfWidth}. זו נקודת ייחוס להקשר, לא מבחן ולא ציון.`,
    `מגמה = ההפרש בין ממוצע הרמה ב-${TREND_WINDOWS.recentDays} ימי הלימוד האחרונים לבין הממוצע ב-90 עד 150 ימי הלימוד שלפניהם. הפרש של ${TREND_LABEL_MIN_DELTA} רמה או יותר נחשב עלייה או ירידה; פחות מזה נחשב יציב.`,
    `תחום חזק או מאתגר = תחום שהרמה בו שונה מהרמה הכללית במקצוע ב-${AREA_MIN_DELTA} רמה או יותר, ורק אם נאספו בו מספיק תשובות.`,
    `טעות נפוצה = לפחות ${MISCONCEPTION_RULE.minExposuresPerStudent} שאלות בנושא, שבהן התלמיד/ה בחר/ה בתשובה השגויה המתויגת לפחות ${MISCONCEPTION_RULE.minHitsPerStudent} פעמים ובמחצית מהשאלות או יותר. אחוז מוצג רק כשיש לפחות ${MIN_CELL_SIZE} תלמידים.`,
    'דפוס או שינוי מדווחים רק כשיש מספיק תצפיות, כשהשינוי אינו נראה מקרי (בדיקה סטטיסטית עם תיקון לבדיקות מרובות) והוא גדול מספיק כדי להיות משמעותי.',
    /* ההסבר המלא להסתייגות "הרמות של מקצועות שונים אינן ניתנות להשוואה ישירה" (במסכים מופיע רק המשפט הקצר) */
    'לכל מקצוע סולם רמות משלו, ולכן אי אפשר להשוות ישירות בין הרמות של מקצועות שונים. אין כאן ציון אחד מאוחד; התצוגה של כמה מקצועות זה לצד זה נועדה לתת תמונה, לא דירוג.',
  ] as readonly string[],
} as const
/* כינוי לתאימות אחורה (מסכי שלב D); ההגדרה היחידה היא בתוך HOW_WE_CALC */
export const evidenceLines = HOW_WE_CALC.evidenceLines

/* ══════════════════════════════════════════════════════════════════════════
   תוצאות (שלב UX) — משפטי סיכום ותוויות לטאב "תוצאות". עובדות בלבד, בעברית פשוטה.
   ══════════════════════════════════════════════════════════════════════════ */
/* "11 מתוך 24" — כך מוצגים מספרים; אחוז רק בנוסף */
export const countOf = (x: number, y: number): string => `${x} מתוך ${y}`
export const withPct = (x: number, y: number): string => (y > 0 ? `${countOf(x, y)} (${Math.round((100 * x) / y)}%)` : countOf(x, y))

/* ── תאריכי תוצאות: יום בלוח השנה של ישראל (Asia/Jerusalem), לא רגע UTC ──
   שליחה ב-20 באוקטובר 01:30 שעון ישראל נשמרת ב-DB כ-19 באוקטובר 22:30Z. גם הניסוח ("זמין מ-…") וגם ההשוואה "נשלח אחרי שהלכידה
   התחילה" נעשים לפי היום הישראלי, ולכן הטקסט והשער תמיד מסכימים. */
const IL_TIME_ZONE = 'Asia/Jerusalem'
const IL_DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: IL_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' })
export function israelDay(iso: string): { year: number; month: number; day: number } | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = IL_DAY_FORMAT.formatToParts(d)
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value)
  return { year: part('year'), month: part('month'), day: part('day') }
}
/* מפתח יום ישראלי להשוואה (YYYY-MM-DD; השוואת מחרוזות = השוואת ימים); null אם התאריך אינו תקין */
export function israelDayKey(iso: string): string | null {
  const p = israelDay(iso)
  const pad = (n: number, w: number): string => String(n).padStart(w, '0')
  return p ? `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}` : null
}
export const dateHe = (iso: string): string => {
  const p = israelDay(iso)
  return p ? `${p.day} ב${MONTHS[p.month - 1] ?? ''} ${p.year}` : ''
}

/* "X מתוך Y" צמוד — רווחים לא-שוברים (U+00A0), כדי שהמספר לא יתנתק מ"מתוך" בגבול שורה. למשפטי הסיכום בלבד: countOf (לממשק) נשאר כפי שהיה. */
const NBSP = '\u00A0'
export const countNb = (x: number, y: number): string => `${x}${NBSP}מתוך${NBSP}${y}`
const challengesWord = (n: number): string => (n === 1 ? 'אתגר' : 'אתגרים')

export interface ClassSummaryInput {
  total: number
  completed: number
  inProgress: number
  notStarted: number
  /* חלק האתגרים שנפתרו בממוצע בקרב מי שסיימו (0..1), או null אם אין מי שסיים */
  avgSolvedShare: number | null
  /* מספר האתגרים בהדמיה. 0 = אין בה אתגרים שאפשר למדוד (אז "סיימו" הוא כל מה שיש לומר); חסר = לא ידוע */
  totalChallenges?: number
  /* wrong = כמה מתוך מי שניסו את האתגר לא הצליחו (טעו, ויתרו או נגמר הזמן) */
  hardest: { title: string; attempted: number; wrong: number; topErrorOptionText: string | null; topErrorCount: number } | null
}

/* כשכולם סיימו: משפט על הכיתה כולה */
const classLead = (share: number): string =>
  share >= CLASS_SUCCESS_BANDS.most ? 'רוב הכיתה הצליחה.' : share >= CLASS_SUCCESS_BANDS.some ? 'חלק מהכיתה התקשה.' : 'הכיתה התקשתה בהדמיה.'
/* כשעדיין לא כולם סיימו: המשפט מדבר רק על מי שסיימו (אחרי "עד עכשיו סיימו X מתוך Y.") */
const partialLead = (share: number): string =>
  share >= CLASS_SUCCESS_BANDS.most ? 'רובם הצליחו.' : share >= CLASS_SUCCESS_BANDS.some ? 'חלקם התקשו.' : 'הם התקשו בהדמיה.'
const partialLeadShort = (share: number): string =>
  share >= CLASS_SUCCESS_BANDS.most ? 'רוב מי שסיימו עד עכשיו הצליחו.' : share >= CLASS_SUCCESS_BANDS.some ? 'חלק ממי שסיימו עד עכשיו התקשו.' : 'מי שסיימו עד עכשיו התקשו בהדמיה.'

/* מספיק תוצאות כדי לסכם את הכיתה במשפט כללי: כולם סיימו, או לפחות CLASS_SUMMARY_MIN_COMPLETED */
const canSummarize = (i: ClassSummaryInput): boolean => i.completed >= i.total || i.completed >= CLASS_SUMMARY_MIN_COMPLETED

/* משפט אחיד לכל רמה (כיתה / רשימה / תלמיד/ה): עוד אין תוצאות, ומה יקרה */
export const NO_RESULTS_YET = 'התוצאות יופיעו כאן כשיסיימו.'

const noChallengesLine = (i: ClassSummaryInput): string => `${countNb(i.completed, i.total)} סיימו את ההדמיה; אין בה אתגרים שאפשר למדוד.`

/* משפט הסיכום של מסך ההדמיה (מצב "כל הכיתה") */
export function narrateClassSummary(i: ClassSummaryInput): string {
  if (i.totalChallenges === 0 && i.completed > 0) return noChallengesLine(i)
  if (i.completed === 0 || i.avgSolvedShare === null) {
    return i.inProgress > 0
      ? `${i.inProgress === 1 ? 'אחד התלמידים באמצע' : `${i.inProgress} תלמידים באמצע`} ההדמיה. ${NO_RESULTS_YET}`
      : `עוד אף תלמיד לא התחיל את ההדמיה. ${NO_RESULTS_YET}`
  }
  const enough = canSummarize(i)
  const parts: string[] = []
  if (i.completed >= i.total) parts.push(classLead(i.avgSolvedShare))
  else parts.push(`עד עכשיו סיימו ${countNb(i.completed, i.total)}.`, enough ? partialLead(i.avgSolvedShare) : 'עוד אין מספיק תוצאות כדי לסכם את הכיתה.')
  const h = i.hardest
  if (enough && h && h.wrong > 0) {
    let s = `האתגר הקשה ביותר: ${h.title}. ${countNb(h.wrong, h.attempted)} לא הצליחו`
    if (h.topErrorOptionText && h.topErrorCount >= 2) {
      const chosen = `ב״${h.topErrorOptionText}״`
      s += h.topErrorCount * 2 > h.wrong ? `, ורובם בחרו ${chosen}.` : `, ו-${h.topErrorCount} מהם בחרו ${chosen}.`
    } else s += '.'
    parts.push(s)
  }
  return parts.join(' ')
}

/* משפט קצר אחד לשורה ברשימת השליחות — אותו כלל כמו הסיכום הכיתתי: לא מכליל מעבר למי שסיימו */
export function narrateListSummary(i: ClassSummaryInput): string {
  if (i.totalChallenges === 0 && i.completed > 0) return `${countNb(i.completed, i.total)} סיימו את ההדמיה.`
  if (i.completed === 0 || i.avgSolvedShare === null) {
    return i.inProgress > 0 ? 'התלמידים באמצע ההדמיה — עוד אין תוצאות.' : `עוד לא התחילו. ${NO_RESULTS_YET}`
  }
  if (!canSummarize(i)) return `עד עכשיו סיימו ${countNb(i.completed, i.total)}.`
  const lead = i.completed >= i.total ? classLead(i.avgSolvedShare) : partialLeadShort(i.avgSolvedShare)
  const h = i.hardest
  return h && h.wrong > 0 ? `${lead} הקשה ביותר: ${h.title}.` : lead
}

export const attentionBadgeText = (n: number): string => (n === 1 ? 'תלמיד/ה אחד/ת לתשומת לב' : `${n} תלמידים לתשומת לב`)
export const attentionReasonText = (r: 'not_started' | 'gave_up_often' | 'low_success'): string =>
  r === 'not_started' ? 'עוד לא התחיל/ה' : r === 'gave_up_often' ? 'ויתר/ה על כמה אתגרים' : 'הצליח/ה בפחות מחצי מהאתגרים'

export interface StudentSummaryInput {
  firstName: string
  status: 'completed' | 'in_progress' | 'not_started'
  totalChallenges: number
  attempted: number
  solved: number
  gaveUp: number
  /* סיבות "תשומת לב" של התלמיד/ה (analyticsConfig.ATTENTION_RULE) — מנוסחות במילים בסוף המשפט */
  attentionReasons?: ('not_started' | 'gave_up_often' | 'low_success')[]
}
export function narrateStudentSummary(i: StudentSummaryInput): string {
  if (i.status === 'not_started') return `${i.firstName} עוד לא התחיל/ה את ההדמיה. ${NO_RESULTS_YET}`
  if (i.status === 'in_progress') {
    return i.attempted > 0
      ? `${i.firstName} באמצע ההדמיה: פתר/ה ${countNb(i.solved, i.attempted)} ${challengesWord(i.attempted)} עד עכשיו.`
      : `${i.firstName} באמצע ההדמיה. ${NO_RESULTS_YET}`
  }
  if (i.totalChallenges === 0) return `${i.firstName} סיים/ה את ההדמיה; אין בה אתגרים שאפשר למדוד.`
  let s = `${i.firstName} פתר/ה ${countNb(i.solved, i.totalChallenges)} ${challengesWord(i.totalChallenges)}.`
  if (i.gaveUp > 0) s += ` ויתר/ה על ${i.gaveUp}.`
  /* "עוד לא התחיל/ה" כבר נאמר במשפט עצמו (not_started); כאן רק סיבות למי שסיים/ה */
  const why = (i.attentionReasons ?? []).filter((r) => r !== 'not_started').map(attentionReasonText)
  if (why.length > 0) s += ` לתשומת לב: ${why.join(', ')}.`
  return s
}

/* תרגול חזרה: המטלה שנשלחה אינה של ההדמיה שביקשו ממנה חזרה */
export const ERR_REVIEW_WRONG_QUEST = 'המטלה אינה שייכת להדמיה זו'

export const detailAvailableLine = (iso: string): string => `פירוט התשובות זמין להדמיות שנשלחו מ-${dateHe(iso)}`
export const slideFactText = (order: number, words: number, seconds: number): string => `בשקף ${order} (${words} מילים) עבר/ה אחרי ${seconds} שניות`

export const RESULTS_TEXT = {
  listTitle: 'מה התלמידים עשו בהדמיות ששלחתי?',
  emptyList: 'עוד לא שלחת הדמיות לתלמידים. שליחה נעשית מספריית ההדמיות.',
  emptyListCta: 'לספריית ההדמיות',
  noMatch: 'לא נמצאו שליחות שמתאימות לסינון.',
  classQuestion: 'איך הכיתה הצליחה בהדמיה?',
  studentQuestion: 'איך התלמיד/ה הצליח/ה בהדמיה?',
  noCommonErrors: 'אין עדיין טעויות נפוצות מתויגות בהדמיה הזאת.',
  noChallengeData: 'עדיין אין תוצאות לאתגר הזה. הן יופיעו כאן כשתלמידים יסיימו.',
  howWeCalcLabel: 'איך חישבנו?',
} as const

/* שורות "איך חישבנו?" לתוצאות — המקום היחיד שבו מותר פירוט חישובי */
export function howWeCalcResultsLines(): string[] {
  return [
    `אתגר נחשב ל"הצליחו" כשהתלמיד/ה פתר/ה אותו. "ויתרו" = לחצו על "אני מוותר/ת" או סגרו את האתגר בלי לענות.`,
    `תלמיד/ה מופיע/ה ב"תשומת לב" אם: עוד לא התחיל/ה, או ויתר/ה על ${ATTENTION_RULE.gaveUpAtLeast} אתגרים או יותר, או סיים/ה והצליח/ה בפחות מחצי מהאתגרים. זה כלל עובדתי בלבד — הוא לא מסביר למה.`,
    'התוצאות נספרות לפי ההרצה האחרונה של כל תלמיד/ה בהדמיה.',
  ]
}

/* ── יעדי למידה (טאב "יעדי הלמידה" במסך ההדמיה) — מילים פשוטות בלבד ── */
export type ObjectiveLevelKey = 'strong' | 'partial' | 'weak'
export const OBJECTIVE_LEVEL_TEXT: Record<ObjectiveLevelKey, string> = { strong: 'למדו', partial: 'למדו חלקית', weak: 'עדיין קשה' }
export const OBJECTIVE_NO_DATA_TEXT = 'אין עדיין נתונים'
export const objectiveLevelText = (level: ObjectiveLevelKey | null): string => (level ? OBJECTIVE_LEVEL_TEXT[level] : OBJECTIVE_NO_DATA_TEXT)

export interface ObjectivesSummaryInput {
  /* כל היעדים שאפשר למדוד בהדמיה */
  total: number
  strong: number
  partial: number
  weak: number
}

/* משפט הסיכום של טאב יעדי הלמידה */
export function narrateObjectivesSummary(i: ObjectivesSummaryInput): string {
  const measured = i.strong + i.partial + i.weak
  if (measured === 0) return 'עוד אין תוצאות ביעדי הלמידה. הן יופיעו כאן כשתלמידים יסיימו.'
  const parts = [i.strong > 0 ? `הכיתה למדה ${countOf(i.strong, i.total)} ${i.total === 1 ? 'יעד' : 'יעדים'}.` : 'עדיין אין יעד שהכיתה למדה במלואו.']
  if (i.partial > 0) parts.push(`${i.partial === 1 ? 'יעד אחד נלמד' : `${i.partial} יעדים נלמדו`} חלקית.`)
  if (i.weak > 0) parts.push(`${i.weak === 1 ? 'יעד אחד עדיין קשה' : `${i.weak} יעדים עדיין קשים`} לכיתה.`)
  if (i.total > measured) parts.push(`${i.total - measured === 1 ? 'ליעד אחד' : `ל-${i.total - measured} יעדים`} עוד אין נתונים.`)
  return parts.join(' ')
}

/* שורות "איך חישבנו?" ליעדי למידה — מצורפות לשורות התוצאות רק כשיש יעדים. הספים מגיעים מהקורא (analyticsConfig.OBJECTIVE_BANDS). */
export function howWeCalcObjectivesLines(bands: { strong: number; partial: number }): string[] {
  const strong = Math.round(bands.strong * 100)
  const partial = Math.round(bands.partial * 100)
  return [
    'לכל יעד נספרים האתגרים והשאלות שהוגדרו כקשורים אליו. שאלות מוסר אינן נספרות, כי אין בהן תשובה נכונה.',
    `תלמיד/ה נחשב/ת כמי שהצליח/ה ביעד כשהצליח/ה לפחות ב-${partial}% מהאתגרים והשאלות שלו. מי שהצליח/ה בפחות מזה מופיע/ה ברשימת המתקשים.`,
    `"${OBJECTIVE_LEVEL_TEXT.strong}" = ${strong}% מהתלמידים שניסו, או יותר, הצליחו ביעד. "${OBJECTIVE_LEVEL_TEXT.partial}" = בין ${partial}% ל-${strong}%. "${OBJECTIVE_LEVEL_TEXT.weak}" = פחות מ-${partial}%.`,
  ]
}

/* משפט אחד מעל רשימת השליחות: "5 הדמיות נשלחו; ב-4 מהן יש תלמידים לתשומת לב."
   total = כמה שליחות מוצגות, withAttention = בכמה מהן יש לפחות תלמיד/ה אחד/ת לתשומת לב. מחזיר '' כשאין שליחות. */
export function narrateSubmissionsSummary(total: number, withAttention: number): string {
  if (total <= 0) return ''
  const sent = total === 1 ? 'הדמיה אחת נשלחה' : `${total} הדמיות נשלחו`
  const w = Math.min(Math.max(0, withAttention), total)
  const attention =
    total === 1 ? (w > 0 ? 'יש בה תלמידים לתשומת לב' : 'אין בה תלמידים לתשומת לב')
      : w === 0 ? 'אין בהן תלמידים לתשומת לב'
        : w === total ? 'בכולן יש תלמידים לתשומת לב'
          : w === 1 ? 'באחת מהן יש תלמידים לתשומת לב'
            : `ב-${w} מהן יש תלמידים לתשומת לב`
  return `${sent}; ${attention}.`
}

export const LOCKED_SUBJECT_TEXT = 'זמין למורה המקצוע ולמחנך/ת'
