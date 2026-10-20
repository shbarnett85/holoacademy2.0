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
  AGE_NORM, AREA_MIN_DELTA, ATTENTION_RULE, CLASS_SUCCESS_BANDS, CURRENT_LEVEL_SESSIONS, MIN_CELL_SIZE, MISCONCEPTION_RULE,
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
const studentsWord = (n: number): string => (n === 1 ? 'תלמיד/ה אחד/ת' : `${n} תלמידים`)
/* "אין עדיין מספיק נתונים" — הניסוח האחיד בכל מקום שבו אין מה לדווח */
export const NO_DATA_YET = 'אין עדיין מספיק נתונים'

/* ── הסתייגויות קבועות (חוקים 7, 11) ── */
export const CAVEAT_AGE_NORM = 'משווים לרמה המיועדת לשכבה בסולם ההדמיות, לא למבחן ארצי. הטווח נועד להקשר בלבד ואינו ציון.'
export const CAVEAT_CROSS_SUBJECT = 'לכל מקצוע סולם רמות משלו, ולכן אי אפשר להשוות ישירות בין הרמות של מקצועות שונים. אין כאן ציון אחד מאוחד; התצוגה זה לצד זה נועדה לתת תמונה, לא דירוג.'
export const CAVEAT_TREND = 'המערכת מתארת מה שנצפה בנתונים ואינה קובעת מה גרם לכך. כל מגמה היא נקודת התחלה לשיחה, לא פסק דין.'

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
  return names.slice(0, -1).join(', ') + ' ו' + names[names.length - 1]
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
        return `${where} נצפתה ירידה ב${e.conceptTitle} מאז תחילת ${since}: רק ${countOf(e.improvedCount, e.studentsCount)} תלמידים השתפרו, ובממוצע הרמה ירדה ב-${levelsWord(e.meanDelta)}.`
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

/* משפט קצר אחד — להתרעות במסך הכניסה, לסיכום המקצוע ולציר ההתקדמות */
export function narrateShort(e: Evidence, c: NarrativeCtx = {}): string {
  const name = who(c)
  switch (e.kind) {
    case 'level_trend':
      return e.direction === 'down'
        ? `${name}${inSubject(c)}: ירידה ברמה מאז ${monthName(e.changeDate)}.`
        : `${name}${inSubject(c)}: עלייה ברמה מאז ${monthName(e.changeDate)}.`
    case 'class_concept_improvement':
      return `${c.className ? `בכיתה ${c.className}` : 'בכיתה'}: ${e.meanDelta < 0 ? 'ירידה' : 'שיפור'} ב${e.conceptTitle} מאז תחילת ${termLabel(e.term)} — ${countOf(e.improvedCount, e.studentsCount)} תלמידים השתפרו.`
    case 'memory_random_pattern':
      return `${name}${inSubject(c)}: דפוס הלחיצות במשחק הזיכרון ראוי לבדיקה.`
    case 'position_bias':
      return `${name}${inSubject(c)}: נטייה לבחור בתשובה הראשונה.`
    case 'reading_skip':
      return `${name}${inSubject(c)}: מעבר מהיר מאוד בין שקפים — ייתכן שהטקסט נקרא בחטף.`
    case 'cross_subject_dip':
      return `${name}: ירידה ברמה בכמה מקצועות יחד (${joinSubjectNames(e.subjects.map((s) => subjectName(s.code)))}).`
  }
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
export function narrateVectorStrength(vectorKey: string, subjectName: string, level: number, subjectLevel: number): string {
  return `ב${subjectName}, בתחום "${contentVectorLabel(vectorKey)}" הרמה (${fmt1(level)}) גבוהה מהרמה הכללית במקצוע (${fmt1(subjectLevel)}).`
}
export function narrateVectorGap(vectorKey: string, subjectName: string, level: number, subjectLevel: number): string {
  return `ב${subjectName}, בתחום "${contentVectorLabel(vectorKey)}" הרמה (${fmt1(level)}) נמוכה מהרמה הכללית במקצוע (${fmt1(subjectLevel)}).`
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
  return `ב${subjectName}: הרמה ירדה ב-${levelsWord(deltaLevels)} מאז ${monthName(changeIso)} (הפירוט בסעיף המגמה).`
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

export interface SubjectHeadlineInput { className: string; subject: string; position: Position | null; trend: Trend; attentionStudents: number }
/* משפט הסיכום של מקצוע בכיתה */
export function narrateSubjectHeadline(i: SubjectHeadlineInput): string {
  if (!i.position) return `בכיתה ${i.className}: ${NO_DATA_YET} על הרמה ב${i.subject}. התמונה תופיע כשתלמידים יסיימו הדמיות.`
  const trendClause =
    i.trend === 'improving' ? ', והמגמה בעלייה' : i.trend === 'steady' ? ', והמגמה יציבה' : i.trend === 'declining' ? ', אך המגמה בירידה' : ''
  return `בכיתה ${i.className} הרמה ב${i.subject} ${POSITION_TEXT[i.position]}${trendClause}. ${attentionSentence(i.attentionStudents)}`
}

export interface StudentHeadlineInput { firstName: string; attention: number; positive: number; crossSubject: boolean }
/* משפט הסיכום של עמוד התלמיד */
export function narrateStudentHeadline(i: StudentHeadlineInput): string {
  if (i.crossSubject) return `${i.firstName}: נצפתה ירידה ברמה בכמה מקצועות יחד — כדאי לשוחח.`
  if (i.attention > 0) return i.attention === 1 ? `${i.firstName}: יש דבר אחד שכדאי לבדוק.` : `${i.firstName}: יש ${i.attention} דברים שכדאי לבדוק.`
  if (i.positive > 0) return `${i.firstName}: נצפתה התקדמות.`
  return `${i.firstName}: אין כרגע דבר חריג לדווח.`
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
  evidence_basis: 'בסיס ראייתי לתל״א',
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
export const normBandLine = (low: number, high: number): string => `הטווח המיועד לשכבה: ${low}–${high}`
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
  const out = [`N = ${n}`, `חלון: ${monthYear(startIso)} – ${monthYear(endIso)}`]
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

export const dateHe = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getUTCDate()} ב${monthName(iso)} ${d.getUTCFullYear()}`
}

export interface ClassSummaryInput {
  total: number
  completed: number
  inProgress: number
  notStarted: number
  /* חלק האתגרים שנפתרו בממוצע בקרב מי שסיימו (0..1), או null אם אין מי שסיים */
  avgSolvedShare: number | null
  hardest: { title: string; attempted: number; wrong: number; topErrorOptionText: string | null; topErrorCount: number } | null
}

const classLead = (share: number): string =>
  share >= CLASS_SUCCESS_BANDS.most ? 'רוב הכיתה הצליחה.' : share >= CLASS_SUCCESS_BANDS.some ? 'חלק מהכיתה התקשה.' : 'הכיתה התקשתה בהדמיה.'

const NO_RESULTS_YET = 'התוצאות יופיעו כאן כשתלמידים יסיימו.'

/* משפט הסיכום של מסך ההדמיה (מצב "כל הכיתה") */
export function narrateClassSummary(i: ClassSummaryInput): string {
  if (i.completed === 0 || i.avgSolvedShare === null) {
    return i.inProgress > 0
      ? `${i.inProgress === 1 ? 'תלמיד/ה אחד/ת באמצע' : `${i.inProgress} תלמידים באמצע`} ההדמיה. ${NO_RESULTS_YET}`
      : `עוד אף תלמיד לא התחיל את ההדמיה. ${NO_RESULTS_YET}`
  }
  const parts = [classLead(i.avgSolvedShare)]
  const h = i.hardest
  if (h && h.wrong > 0) {
    let s = `האתגר הקשה ביותר: ${h.title}. ${countOf(h.wrong, h.attempted)} טעו`
    if (h.topErrorOptionText && h.topErrorCount >= 2) {
      s += h.topErrorCount * 2 > h.wrong ? `, ורובם בחרו ${h.topErrorOptionText}.` : `, ו-${h.topErrorCount} מהם בחרו ${h.topErrorOptionText}.`
    } else s += '.'
    parts.push(s)
  }
  if (i.completed < i.total) parts.push(`${countOf(i.completed, i.total)} סיימו עד עכשיו.`)
  return parts.join(' ')
}

/* משפט קצר אחד לשורה ברשימת השליחות */
export function narrateListSummary(i: ClassSummaryInput): string {
  if (i.completed === 0 || i.avgSolvedShare === null) {
    return i.inProgress > 0 ? 'התלמידים באמצע ההדמיה — עוד אין תוצאות.' : 'עוד לא התחילו — התוצאות יופיעו כשתלמידים יסיימו.'
  }
  const h = i.hardest
  return h && h.wrong > 0 ? `${classLead(i.avgSolvedShare)} הקשה ביותר: ${h.title}.` : classLead(i.avgSolvedShare)
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
}
export function narrateStudentSummary(i: StudentSummaryInput): string {
  if (i.status === 'not_started') return `${i.firstName} עוד לא התחיל/ה את ההדמיה. התוצאות יופיעו כאן כשיסיימו.`
  if (i.status === 'in_progress') {
    return i.attempted > 0
      ? `${i.firstName} באמצע ההדמיה: פתר/ה ${countOf(i.solved, i.attempted)} אתגרים עד עכשיו.`
      : `${i.firstName} באמצע ההדמיה. התוצאות יופיעו כאן כשיסיימו.`
  }
  const base = `${i.firstName} פתר/ה ${countOf(i.solved, i.totalChallenges)} אתגרים.`
  return i.gaveUp > 0 ? `${base} ויתר/ה על ${i.gaveUp}.` : base
}

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

export const LOCKED_SUBJECT_TEXT = 'זמין למורה המקצוע ולמחנך/ת'
