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
  AGE_NORM, AREA_MIN_DELTA, ATTENTION_RULE, CLASS_SUCCESS_BANDS, CLASS_SUMMARY_MIN_COMPLETED, CURRENT_LEVEL_SESSIONS, KIND_THRESHOLDS, LEVEL_TREND_BASIS, LIVE_TREND_RULE,
  MIN_CELL_SIZE, MISCONCEPTION_RULE, TREND_LABEL_MIN_DELTA, TREND_WINDOWS, contentVectorLabel,
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
export const CAVEAT_AGE_NORM = 'משווים לרמה המיועדת לשכבה בסולם השיעורים, לא למבחן ארצי. הטווח נועד להקשר בלבד ואינו ציון.'
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
  /* יחידת הספירה של מגמת רמה היא משחק (פעם ששיחקו), לא הדמיה (התוכן) — G1: אחידות מונחים */
  level_trend: ['משחק אחד', 'משחקים'],
  class_concept_improvement: ['תלמיד/ה אחד/ת', 'תלמידים'],
  memory_random_pattern: ['משחק זיכרון אחד', 'משחקי זיכרון'],
  position_bias: ['שאלה אחת', 'שאלות'],
  reading_skip: ['שקף אחד', 'שקפים'],
  cross_subject_dip: ['מקצוע אחד', 'מקצועות'],
}
export const unitCount = (kind: FindingKind, n: number): string => (n === 1 ? KIND_UNIT[kind][0] : `${n} ${KIND_UNIT[kind][1]}`)
/* משחקים (פעמים ששיחקו) — היחידה במסכי האנליטיקה והתדריך. "הדמיה" שמורה לתוכן עצמו. */
export const playsCount = (n: number): string => unitCount('level_trend', n)
/* נוסח "שיעורים" לאותה יחידה — נשאר רק לסיכום ה-AI (aiSummaryBasis / aiFactLevel), שבדיקותיו נעולות; ליישר יחד איתן */
export const sessionsCount = (n: number): string => (n === 1 ? 'שיעור אחד' : `${n} שיעורים`)

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
/* כשההצלחה כמעט לא השתנתה בין שתי התקופות, אחוזי ההצלחה לא מוצגים (הם היו נראים כסתירה לשינוי ברמה) */
export const LEVEL_TREND_STEADY_SUCCESS_NOTE = 'המערכת מתאימה את הקושי להצלחה של התלמיד/ה, ולכן אחוז ההצלחה נשאר דומה גם כשהרמה משתנה.'

/* ── ממצא מדווח ── */
export function narrateFinding(e: Evidence, c: NarrativeCtx = {}): string {
  const name = who(c)
  switch (e.kind) {
    case 'level_trend': {
      const m = monthName(e.changeDate)
      /* G1 (UX#7): שני אחוזים שווים ("70% לעומת 70%") סותרים "ירידה". המערכת מתאימה את הקושי כך שההצלחה נשארת דומה, ולכן כשההפרש קטן — אומרים זאת במקום להציג את המספרים */
      const successGap = Math.abs(pct0(e.successAfter) - pct0(e.successBefore))
      const rates = successGap >= Math.round(LIVE_TREND_RULE.minRawShift * 100)
        ? `ההצלחה הממוצעת ב-${e.sessionsAfter} המשחקים האחרונים — ${pct0(e.successAfter)}%, לעומת ${pct0(e.successBefore)}% ב-${e.sessionsBefore} המשחקים שלפניהם.`
        : LEVEL_TREND_STEADY_SUCCESS_NOTE
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
      return `${name}${inSubject(c)}: ב-${e.scenes} שקפים המעבר לשקף הבא היה מהיר במיוחד — כ-${wordsPerSecond(e.msPerWord)} מילים בשנייה, לעומת כ-${wordsPerSecond(e.classMedianMsPerWord)} אצל רוב הכיתה. ייתכן שהטקסט נקרא בחטף; כדאי לבדוק בשיחה קצרה או בצפייה בשיעור.`
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
      return `${e.randomLikelihood >= 0.9 ? 'נראה' : 'ייתכן'} שחלק גדול מהלחיצות במשחק הזיכרון${sub} אקראיות`
    case 'position_bias':
      return `נצפה שהתשובה הראשונה נבחרה ב-${countOf(e.firstChoices, e.items)} שאלות${sub}`
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
  return hasLinkedQuest ? `${base} יש שיעור ממוקד לטעות הזאת.` : base
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
  return `ב${subjectName} הרמה הנוכחית (${fmt1(level)}) גבוהה מהרמה המיועדת לשכבה בסולם השיעורים (${fmt1(normCenter)}).`
}
export function narrateDifficultyBelow(subjectName: string, level: number, normCenter: number): string {
  return `ב${subjectName} הרמה הנוכחית (${fmt1(level)}) נמוכה מהרמה המיועדת לשכבה בסולם השיעורים (${fmt1(normCenter)}); זו נקודת ייחוס להקשר ולא מדד ליכולת.`
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
      return `מומלץ להציע קריאה מוקרנת או הקראה בקול של טקסט השיעור, ולבחון אם קצב הקריאה משתנה.`
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
    case 'level_trend': return playsCount(e.sessionsBefore + e.sessionsAfter)
    case 'class_concept_improvement': return unitCount('class_concept_improvement', e.studentsCount)
    case 'memory_random_pattern': return unitCount('memory_random_pattern', e.games)
    case 'position_bias': return unitCount('position_bias', e.items)
    case 'reading_skip': return unitCount('reading_skip', e.scenes)
    case 'cross_subject_dip': return unitCount('cross_subject_dip', e.subjects.length)
  }
}
export const narrateEvidenceWindow = (startIso: string, endIso: string, sessions: number, subject?: string): string =>
  `${subject ? `${subject} — ` : ''}${monthYear(startIso) === monthYear(endIso) ? `מבוסס על ${playsCount(sessions)}, ב${monthYear(startIso)}` : basisLine(playsCount(sessions), startIso, endIso)}`
export const basedOnSessions = (sessions: number): string => `מבוסס על ${sessionsCount(sessions)}`
/* בתדריך ובמסכי האנליטיקה: משחקים */
export const basedOnPlays = (plays: number): string => `מבוסס על ${playsCount(plays)}`
export const basedOnChallenges = (n: number): string => (n === 1 ? 'מבוסס על אתגר אחד בתחום' : `מבוסס על ${n} אתגרים בתחום`)

/* ── משוב לתלמיד/ה — צמיחה בלבד, בלי השוואה לאחרים ובלי תוויות ── */
export function narrateFeedbackGrowth(subjectName: string, deltaLevels: number, sinceIso: string): string {
  return `שיפור ב${subjectName}! מאז ${monthName(sinceIso)} עלייה של ${levelsWord(deltaLevels)}. כל הכבוד על ההתמדה.`
}
export function narrateFeedbackStreak(subjectNames: string, sessions: number): string {
  return `${sessions} שיעורים הושלמו ב${subjectNames} לאחרונה. הרצף הזה מראה התמדה.`
}
export function narrateFeedbackNextStep(subjectName: string, conceptTitle: string | null): string {
  return conceptTitle
    ? `הצעד הבא ב${subjectName}: עוד תרגול קצר ב${conceptTitle}. כל תרגול מקרב להצלחה.`
    : `הצעד הבא ב${subjectName}: להמשיך לשחק ולנסות אתגרים חדשים. כל ניסיון מלמד משהו.`
}
/* פתיח תצוגת "כך התלמיד/ה רואה" — מופיע למורה בלבד, מעל מה שהתלמיד/ה רואה */
export const FEEDBACK_INTRO_TEXT = 'כך נראה המסך לתלמיד/ה. אין בו השוואה לתלמידים אחרים.'
export function narrateFeedbackHeadline(firstName: string, hasGrowth: boolean): string {
  return hasGrowth ? `שלום ${firstName}, הנה מה שהשתפר לאחרונה` : `שלום ${firstName}, הנה סיכום הפעילות`
}

/* ══════════════════════════════════════════════════════════════════════════
   משפטי סיכום למסכים החדשים (כניסה / סקירת כיתה / מקצוע / תלמיד / מנהל)
   ══════════════════════════════════════════════════════════════════════════ */
/* G1 (UX#9): "אין תלמידים לתשומת לב" נשמע כמו "בדקנו והכול בסדר" — אומרים אותו רק כשיש בסיס נתונים מספיק (thin = אין) */
const attentionSentence = (n: number, thin = false): string =>
  n === 0 ? (thin ? ATTENTION_THIN_TEXT : 'אין כרגע תלמידים לתשומת לב.') : `${attentionBadgeText(n)}.`
const POSITION_SHORT: Record<Position, string> = { above: 'מעל הטווח המיועד לשכבה', within: 'בתוכו', below: 'מתחתיו' }

export interface OverviewSummaryInput {
  className: string; above: number; within: number; below: number; attentionStudents: number
  /* G1: אין מספיק תלמידים שאפשר היה לבדוק עבורם שינוי — "אין תלמידים לתשומת לב" אינו נאמר */
  attentionThin?: boolean
  /* G1: משחקים שהתלמידים כבר שיחקו ולא נכללו (בהדמיות בלי מקצוע / בלי רמה לפי מקצוע) — המצב הריק אומר זאת במקום "כשיסיימו" */
  gap?: CoverageGap | null
}
/* משפט הסיכום של "סקירת הכיתה" (מחנך) */
export function narrateOverviewSummary(i: OverviewSummaryInput): string {
  const measured = i.above + i.within + i.below
  if (measured === 0) return `בכיתה ${i.className}: ${NO_DATA_YET} על הרמה במקצועות. ${gapReason(i.gap) ?? 'התמונה תופיע כשתלמידים יסיימו שיעורים.'}${i.attentionStudents > 0 ? ` ${attentionSentence(i.attentionStudents)}` : ''}`
  /* מקצוע אחד נמדד: "מתוך 1 מקצועות" אינו עברית — המשפט אומר זאת במילים */
  if (measured === 1) {
    const only = i.above ? 'above' : i.within ? 'within' : 'below'
    return `בכיתה ${i.className} נמדד מקצוע אחד, והרמה בו ${POSITION_TEXT[only]}. ${attentionSentence(i.attentionStudents, i.attentionThin)}`
  }
  const parts: string[] = []
  let first = true
  for (const [n, p] of [[i.above, 'above'], [i.within, 'within'], [i.below, 'below']] as const) {
    if (!n) continue
    parts.push(`${n} ${first ? POSITION_TEXT[p] : POSITION_SHORT[p]}`)
    first = false
  }
  return `בכיתה ${i.className}, מתוך ${measured} מקצועות: ${parts.join(', ')}. ${attentionSentence(i.attentionStudents, i.attentionThin)}`
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

export interface SubjectHeadlineInput {
  className: string; subject: string; position: Position | null; trend: Trend; attentionStudents: number
  attentionThin?: boolean
  gap?: CoverageGap | null
}
/* משפט הסיכום של מקצוע בכיתה */
export function narrateSubjectHeadline(i: SubjectHeadlineInput): string {
  if (!i.position) return `בכיתה ${i.className}: ${NO_DATA_YET} על הרמה ב${i.subject}. ${gapReason(i.gap) ?? 'התמונה תופיע כשתלמידים יסיימו שיעורים.'}${i.attentionStudents > 0 ? ` ${attentionSentence(i.attentionStudents)}` : ''}`
  const joiner = trendConnective(i.position, i.trend)
  /* "ו" נצמד למילה ("והמגמה"); "אך" עומד לבדו ("אך המגמה") */
  const trendClause = joiner && i.trend !== 'insufficient' ? `, ${joiner === 'ו' ? `ו${TREND_CLAUSE[i.trend]}` : `אך ${TREND_CLAUSE[i.trend]}`}` : ''
  return `בכיתה ${i.className} הרמה ב${i.subject} ${POSITION_TEXT[i.position]}${trendClause}. ${attentionSentence(i.attentionStudents, i.attentionThin)}`
}

export interface StudentHeadlineInput {
  firstName: string
  attention: number
  positive: number
  crossSubject: boolean
  /* הממצא החשוב ביותר בטון "תשומת לב" (גוף משפט מ-narrateShortBody, בלי שם); כשחסר — ניסוח כללי */
  topAttention?: string | null
  /* G1 (UX#9): false = בשום מקצוע גלוי לא נבדקה מגמה (אין עדיין מספיק נתונים) — לא אומרים "אין דבר חריג". חסר = true (כמו תמיד) */
  hasBasis?: boolean
  gap?: CoverageGap | null
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
  if (i.hasBasis === false) {
    const reason = gapReason(i.gap)
    return reason ? `${i.firstName}: עוד אין מספיק נתונים כדי לזהות שינוי. ${reason}` : `עוד אין מספיק נתונים כדי לזהות שינוי אצל ${i.firstName}.`
  }
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
export interface StudentsTabInput {
  total: number; improving: number; steady: number; declining: number
  /* G1 (UX#10): כמה משחקים במקצוע צריך לתלמיד/ה כדי שתיבדק מגמה — כשידוע, הניסוח אומר כמה חסר במקום משפט כללי */
  needPlays?: number
}
/* "20 מתוך 22 תלמידים בירידה." — הקבוצה הגדולה ראשונה, ואחריה השאר.
   G1 (UX#20): בלי לוכסנים — "אחד בירידה ואחד משתפר, ועל אחד עוד אין מספיק נתונים" (לשון זכר כללית, כמו "אחד מהם") */
export function narrateStudentsTabSummary(i: StudentsTabInput): string {
  if (i.total <= 0) return EMPTY_TEXT.noStudents
  const measured = i.improving + i.steady + i.declining
  if (measured === 0) {
    return i.needPlays && i.needPlays > 0
      ? `עוד אין מגמות לתלמידים. מגמה נבדקת כשיש לפחות ${i.needPlays} משחקים במקצוע.`
      : `${NO_DATA_YET} על מגמות התלמידים. הן יופיעו כשתלמידים יסיימו עוד שיעורים.`
  }
  const count = (n: number): string => (n === 1 ? 'אחד' : `${n} תלמידים`)
  /* סדר ההשוואה בשוויון: ירידה, אחר כך שיפור, אחר כך יציבות — מה שדורש תשומת לב קודם */
  const groups = [
    { n: i.declining, label: () => 'בירידה' },
    { n: i.improving, label: (n: number) => (n === 1 ? 'משתפר' : 'משתפרים') },
    { n: i.steady, label: (n: number) => (n === 1 ? 'יציב' : 'יציבים') },
  ].filter((g) => g.n > 0).sort((a, b) => b.n - a.n)
  const [first, ...others] = groups
  const lead = first.n === i.total && i.total > 1 ? `כל ${i.total} התלמידים ${first.label(first.n)}`
    : first.n === 1 ? `תלמיד אחד מתוך ${i.total} ${first.label(1)}` : `${countOf(first.n, i.total)} תלמידים ${first.label(first.n)}`
  const unknown = i.total - measured
  const tail = [
    others.length ? `, ${joinSubjectNames(others.map((g) => `${count(g.n)} ${g.label(g.n)}`))}` : '',
    unknown > 0 ? `, ועל ${count(unknown)} ${NO_DATA_YET_SHORT}` : '',
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
  /* G1 (UX#8): אותו סף כמו תווית המגמה (TREND_LABEL_MIN_DELTA) — שינוי קטן ממנו אינו "עלייה" או "ירידה", אחרת הבנר סותר את "מגמת הכיתה: יציבה" */
  if (Math.abs(delta) < TREND_LABEL_MIN_DELTA - 1e-9) return `הרמה הממוצעת של הכיתה כמעט לא השתנתה מאז ${since}.`
  return `הרמה הממוצעת ${delta > 0 ? 'עלתה' : 'ירדה'} ${byLevels(delta)} מאז ${since}.`
}

export interface ErrorsTabInput {
  /* שמות הטעויות הנפוצות בכיתה, מהנפוצה ביותר */
  common: string[]
  /* האם יש לפחות טעות אחת עם מספיק נתונים לדיווח */
  anyReported: boolean
  /* כמה שמות לקרוא במשפט (השאר: "ועוד N") */
  maxTitles: number
  /* G1 (UX#1): false = הקטלוג ריק (נתוני אמת בלי תיוג) — התצוגה לא פעילה בחשבון, ולא מבטיחים ש"יופיעו כשיצטברו תשובות". חסר = true */
  catalogReady?: boolean
}
/* "2 טעויות נפוצות: "א" ו"ב"." */
export function narrateErrorsTabSummary(i: ErrorsTabInput): string {
  if (i.catalogReady === false) return CATALOG_UNTAGGED_TEXT.errorsTabSummary
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
export const ADMIN_HIDDEN_CELL_TEXT = `הנתון הזה לא מוצג כי הוא מבוסס על פחות מ-${MIN_CELL_SIZE} תלמידים, כדי לשמור על פרטיות`
export function narrateAdminGradeSummary(gradeLabel: string, above: number, within: number, below: number): string {
  const shown = above + within + below
  if (!shown) return `בשכבה ${gradeLabel}: ${NO_DATA_YET}.`
  /* מקצוע אחד: "1 מתוך 1 מקצועות" אינו עברית */
  if (shown === 1) return `בשכבה ${gradeLabel} נמדד מקצוע אחד, והרמה בו ${POSITION_TEXT[above ? 'above' : within ? 'within' : 'below']}.`
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
  difficulties: 'נקודות לשיחה',
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
  noFindings: 'בינתיים לא נמצא דפוס בולט בנתונים שיש עד עכשיו. אם יתברר משהו, הוא יופיע כאן.',
  noProgress: 'עוד אין מספיק שיעורים כדי להציג התקדמות. הגרף יופיע כאן כשתלמידים יסיימו כמה שיעורים.',
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
    'הממצאים מבוססים על תשובות ופעילות בשיעורים בלבד. כל דפוס מדווח רק לאחר שעמד בסף מינימום של תצפיות, בתיקון Benjamini-Hochberg לבדיקות מרובות ובגודל אפקט מינימלי. המערכת אינה מאבחנת ואינה קובעת את סיבות ההתנהגות.',
  /* שורות ראיה טכניות לממצא: N, חלון, p מתוקן, גודל אפקט */
  evidenceLines: evidenceLinesTechnical,
  /* תווית פריט בסעיף "איך חישבנו?" בתדריך — שם הדפוס (+ מקצוע) */
  itemLabel: (kind: FindingKind, subject?: string | null): string => `${KIND_NOUN[kind]}${subject ? ` ב${subject}` : ''}`,
  /* הסברי החישוב בשפה פשוטה (כולל הספים מהקונפיג) — מוצגים מאחורי "איך חישבנו?" בכל מסך */
  lines: [
    `הרמה הנוכחית במקצוע = ממוצע הרמה ב-${CURRENT_LEVEL_SESSIONS} המשחקים האחרונים.`,
    /* G1: מה נכנס לתוצאות — המשחקים שכבר שוחקו בהדמיה בלי מקצוע לא יצטרפו בדיעבד */
    'משחק נכלל בתוצאות רק אם השיעור כבר היה משויך למקצוע כשהתלמיד/ה שיחק/ה בו. שיוך מקצוע בדיעבד אינו מוסיף משחקים שכבר שוחקו, כי הרמה שלהם חושבה בלי מקצוע.',
    `הטווח המיועד לשכבה = הרמה המיועדת לשכבה בסולם השיעורים, פלוס מינוס ${AGE_NORM.bandHalfWidth}. זו נקודת ייחוס להקשר, לא מבחן ולא ציון.`,
    /* ── FX1a: שינוי ברמה (מגמה) בחשבון אמיתי — מתאר את השיטה בפועל (engine.peerRelativePoints / LIVE_TREND_RULE) ── */
    `שינוי ברמה (מגמה) של תלמיד/ה: משווים את ${TREND_WINDOWS.recentDays} ימי הלימוד האחרונים לתקופה שלפניהם (עד ${TREND_WINDOWS.recentDays + TREND_WINDOWS.priorDays} ימי לימוד אחורה). בחשבון אמיתי בודקים את ההצלחה של התלמיד/ה ביחס לשאר הכיתה באותו שיעור, ולא את הרמה עצמה: הרמה מושפעת גם מקושי השיעורים שנבחרו, ולכן שיעור קל או קשה במיוחד לא נראה כשינוי של תלמיד/ה. כל שיעור נספר פעם אחת (המשחק הראשון של התלמיד/ה בו), ורק אם עוד ${LIVE_TREND_RULE.minPeers} תלמידים לפחות סיימו אותו.`,
    `שינוי מוצג רק אם יש לפחות ${KIND_THRESHOLDS.level_trend.minN} משחקים בכל אחת משתי התקופות, ההפרש ביחס לכיתה הוא לפחות ${Math.round(LIVE_TREND_RULE.minRelativeShift * 100)} נקודות אחוז והוא חריג גם לעומת השינוי של שאר תלמידי הכיתה, וגם ההצלחה וגם הרמה זזו באותו כיוון (הרמה — בהפרש של ${LEVEL_TREND_BASIS.minDeltaLevels} רמה לפחות). מי שנבדק/ה ולא נמצא אצלו/ה שינוי כזה מסומן/ת "יציב/ה" — זו בדיקה זהירה, ושינוי קטן עשוי שלא להתגלות. מי שאין לו/ה מספיק משחקים בשיעורים משותפים עם הכיתה מסומן/ת "${NO_DATA_YET}".`,
    'בחשבון אמיתי אין מגמה לכיתה, לשכבה או למקצוע שלמים: ההשוואה נעשית בתוך הכיתה, ולכן אי אפשר להבדיל בין שינוי של הכיתה כולה לבין שינוי בקושי השיעורים.',
    `בנתוני ההדגמה המגמה מחושבת כהפרש בין ממוצע הרמה ב-${TREND_WINDOWS.recentDays} ימי הלימוד האחרונים לבין הממוצע ב-90 עד 150 ימי הלימוד שלפניהם; הפרש של ${TREND_LABEL_MIN_DELTA} רמה או יותר נחשב עלייה או ירידה.`,
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
  share >= CLASS_SUCCESS_BANDS.most ? 'רוב הכיתה הצליחה.' : share >= CLASS_SUCCESS_BANDS.some ? 'חלק מהכיתה התקשה.' : 'הכיתה התקשתה בשיעור.'
/* כשעדיין לא כולם סיימו: המשפט מדבר רק על מי שסיימו (אחרי "עד עכשיו סיימו X מתוך Y.") */
const partialLead = (share: number): string =>
  share >= CLASS_SUCCESS_BANDS.most ? 'רובם הצליחו.' : share >= CLASS_SUCCESS_BANDS.some ? 'חלקם התקשו.' : 'הם התקשו בשיעור.'
const partialLeadShort = (share: number): string =>
  share >= CLASS_SUCCESS_BANDS.most ? 'רוב מי שסיימו עד עכשיו הצליחו.' : share >= CLASS_SUCCESS_BANDS.some ? 'חלק ממי שסיימו עד עכשיו התקשו.' : 'מי שסיימו עד עכשיו התקשו בשיעור.'

/* מספיק תוצאות כדי לסכם את הכיתה במשפט כללי: כולם סיימו, או לפחות CLASS_SUMMARY_MIN_COMPLETED */
const canSummarize = (i: ClassSummaryInput): boolean => i.completed >= i.total || i.completed >= CLASS_SUMMARY_MIN_COMPLETED

/* משפט אחיד לכל רמה (כיתה / רשימה / תלמיד/ה): עוד אין תוצאות, ומה יקרה */
export const NO_RESULTS_YET = 'התוצאות יופיעו כאן כשיסיימו.'

const noChallengesLine = (i: ClassSummaryInput): string => `${countNb(i.completed, i.total)} סיימו את השיעור; אין בו אתגרים שאפשר למדוד.`

/* משפט הסיכום של מסך ההדמיה (מצב "כל הכיתה") */
export function narrateClassSummary(i: ClassSummaryInput): string {
  if (i.totalChallenges === 0 && i.completed > 0) return noChallengesLine(i)
  if (i.completed === 0 || i.avgSolvedShare === null) {
    return i.inProgress > 0
      ? `${i.inProgress === 1 ? 'אחד התלמידים באמצע' : `${i.inProgress} תלמידים באמצע`} השיעור. ${NO_RESULTS_YET}`
      : `עוד אף תלמיד לא התחיל את השיעור. ${NO_RESULTS_YET}`
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
  if (i.totalChallenges === 0 && i.completed > 0) return `${countNb(i.completed, i.total)} סיימו את השיעור.`
  if (i.completed === 0 || i.avgSolvedShare === null) {
    return i.inProgress > 0 ? 'התלמידים באמצע השיעור — עוד אין תוצאות.' : `עוד לא התחילו. ${NO_RESULTS_YET}`
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
  if (i.status === 'not_started') return `${i.firstName} עוד לא התחיל/ה את השיעור. ${NO_RESULTS_YET}`
  if (i.status === 'in_progress') {
    return i.attempted > 0
      ? `${i.firstName} באמצע השיעור: פתר/ה ${countNb(i.solved, i.attempted)} ${challengesWord(i.attempted)} עד עכשיו.`
      : `${i.firstName} באמצע השיעור. ${NO_RESULTS_YET}`
  }
  if (i.totalChallenges === 0) return `${i.firstName} סיים/ה את השיעור; אין בו אתגרים שאפשר למדוד.`
  let s = `${i.firstName} פתר/ה ${countNb(i.solved, i.totalChallenges)} ${challengesWord(i.totalChallenges)}.`
  if (i.gaveUp > 0) s += ` ויתר/ה על ${i.gaveUp}.`
  /* "עוד לא התחיל/ה" כבר נאמר במשפט עצמו (not_started); כאן רק סיבות למי שסיים/ה */
  const why = (i.attentionReasons ?? []).filter((r) => r !== 'not_started').map(attentionReasonText)
  if (why.length > 0) s += ` לתשומת לב: ${why.join(', ')}.`
  return s
}

/* תרגול חזרה: המטלה שנשלחה אינה של ההדמיה שביקשו ממנה חזרה */
export const ERR_REVIEW_WRONG_QUEST = 'המטלה אינה שייכת לשיעור זה'

export const detailAvailableLine = (iso: string): string => `פירוט התשובות זמין לשיעורים שנשלחו מ-${dateHe(iso)}`
export const slideFactText = (order: number, words: number, seconds: number): string => `בשקף ${order} (${words} מילים) עבר/ה אחרי ${seconds} שניות`

export const RESULTS_TEXT = {
  listTitle: 'מה התלמידים עשו בשיעורים ששלחתי?',
  emptyList: 'עוד לא שלחת שיעורים לתלמידים. שליחה נעשית מספריית השיעורים.',
  emptyListCta: 'לספריית השיעורים',
  noMatch: 'לא נמצאו שליחות שמתאימות לסינון.',
  classQuestion: 'איך הכיתה הצליחה בשיעור?',
  studentQuestion: 'איך התלמיד/ה הצליח/ה בשיעור?',
  noCommonErrors: 'אין עדיין טעויות נפוצות מתויגות בשיעור הזה.',
  noChallengeData: 'עדיין אין תוצאות לאתגר הזה. הן יופיעו כאן כשתלמידים יסיימו.',
  howWeCalcLabel: 'איך חישבנו?',
} as const

/* שורות "איך חישבנו?" לתוצאות — המקום היחיד שבו מותר פירוט חישובי */
export function howWeCalcResultsLines(): string[] {
  return [
    `אתגר נחשב ל"הצליחו" כשהתלמיד/ה פתר/ה אותו. "ויתרו" = לחצו על "ויתור על האתגר" או סגרו את האתגר בלי לענות.`,
    `תלמיד/ה מופיע/ה ב"תשומת לב" אם: עוד לא התחיל/ה, או ויתר/ה על ${ATTENTION_RULE.gaveUpAtLeast} אתגרים או יותר, או סיים/ה והצליח/ה בפחות מחצי מהאתגרים. זה כלל עובדתי בלבד — הוא לא מסביר למה.`,
    'התוצאות נספרות לפי המשחק האחרון שהושלם של כל תלמיד/ה בשיעור.',
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
  const sent = total === 1 ? 'שיעור אחד נשלח' : `${total} שיעורים נשלחו`
  const w = Math.min(Math.max(0, withAttention), total)
  const attention =
    total === 1 ? (w > 0 ? 'יש בו תלמידים לתשומת לב' : 'אין בו תלמידים לתשומת לב')
      : w === 0 ? 'אין בהם תלמידים לתשומת לב'
        : w === total ? 'בכולם יש תלמידים לתשומת לב'
          : w === 1 ? 'באחד מהם יש תלמידים לתשומת לב'
            : `ב-${w} מהם יש תלמידים לתשומת לב`
  return `${sent}; ${attention}.`
}

export const LOCKED_SUBJECT_TEXT = 'זמין למורה המקצוע ולמחנך/ת'

/* ── DONUT: "במבט אחד" במסך ההגשה — שני הדונאטים (מי סיים · כמה אתגרים הצליחו מי שסיימו) ── */
/* ספי הדונאט השני נגזרים מהתצורה הקיימת, בלי מספרים חדשים: "במעט" = אותו כלל כמו "לתשומת לב" (ATTENTION_RULE.solvedShareBelow),
   "ברוב" = אותו כלל כמו "רוב הכיתה הצליחה" (CLASS_SUCCESS_BANDS.most). כך אין שלושה ספים סותרים באותו מסך. */
export const SUCCESS_DONUT_BANDS = { low: ATTENTION_RULE.solvedShareBelow, high: CLASS_SUCCESS_BANDS.most } as const

export const DONUT_TEXT = {
  completionTitle: 'מי סיים את השיעור?',
  completionFinished: 'סיימו',
  completionMiddle: 'באמצע',
  completionNotStarted: 'עוד לא התחילו',
  completionEmpty: 'עוד אין תלמידים בכיתה הזאת.',
  completionEmptyNext: 'כשיצטרפו תלמידים לכיתה, תראו כאן מי סיים.',
  successTitle: 'כמה אתגרים הצליחו התלמידים שסיימו?',
  bandHigh: 'הצליחו ברוב האתגרים',
  bandMid: 'הצליחו בחלק מהאתגרים',
  bandLow: 'הצליחו במעט מהאתגרים',
  successEmpty: 'עוד אין מספיק תלמידים שסיימו כדי להראות התפלגות.',
  successEmptyNext: `הוא יופיע כאן כשיסיימו לפחות ${CLASS_SUMMARY_MIN_COMPLETED} תלמידים.`,
  successNoChallenges: 'בשיעור הזה אין אתגרים שאפשר למדוד.',
  successNoChallengesNext: 'התפלגות ההצלחה תופיע בשיעורים שיש בהם אתגרים.',
  emptyDefault: 'עוד אין נתונים להצגה.',
  emptyDefaultNext: 'הם יופיעו כאן כשתלמידים יסיימו.',
  centerStudents: 'תלמידים',
  centerFinished: 'סיימו',
  nobody: 'אף אחד',
} as const

/* שורת הספירה במקרא: "14 מתוך 25 (56%)" — "X מתוך Y" קודם, האחוז רק בנוסף. אפס → "אף אחד" */
export const donutLegendCount = (count: number, total: number, pct: number): string =>
  count <= 0 ? DONUT_TEXT.nobody : `${countNb(count, total)} (${pct}%)`

/* תיאור הדונאט לקוראי מסך: "מי סיים את ההדמיה? 14 מתוך 25 סיימו, 6 מתוך 25 באמצע, 5 מתוך 25 עוד לא התחילו" */
export const donutAriaLabel = (title: string, parts: { label: string; count: number }[], total: number): string =>
  `${title} ${parts.map((p) => `${countNb(p.count, total)} ${p.label}`).join(', ')}`

/* שורת עזר גלויה מתחת לגרף השני: מה זה "ברוב" ו"במעט" (הספים מהתצורה, לא רק מאחורי "איך חישבנו?").
   ספים מוכרים נכתבים במילים ("3 מכל 4", "ממחצית"); אחרים — באחוזים. */
export function donutBandsHelp(bands: { low: number; high: number } = SUCCESS_DONUT_BANDS): string {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9
  const high = near(bands.high, 0.75) ? '3 מכל 4 אתגרים או יותר' : `${Math.round(bands.high * 100)}% מהאתגרים או יותר`
  const low = near(bands.low, 0.5) ? 'פחות ממחצית האתגרים' : `פחות מ-${Math.round(bands.low * 100)}% מהאתגרים`
  return `ברוב: ${high}. במעט: ${low}. בחלק: כל מה שביניהם.`
}

/* שורות "איך חישבנו?" של שני הדונאטים — הספים מגיעים מהקורא (ברירת מחדל: SUCCESS_DONUT_BANDS) */
export function howWeCalcSuccessBandsLines(bands: { low: number; high: number } = SUCCESS_DONUT_BANDS): string[] {
  const low = Math.round(bands.low * 100)
  const high = Math.round(bands.high * 100)
  return [
    `"${DONUT_TEXT.completionTitle}" סופר את כל תלמידי הכיתה לפי המשחק האחרון של כל אחד/ת: סיימו, באמצע (התחילו ולא סיימו) או עוד לא התחילו.`,
    `"${DONUT_TEXT.successTitle}" סופר רק תלמידים שסיימו. לכל תלמיד/ה בודקים כמה אתגרים פתר/ה מתוך כל האתגרים בשיעור.`,
    `"${DONUT_TEXT.bandHigh}" = ${high}% מהאתגרים או יותר. "${DONUT_TEXT.bandLow}" = פחות מ-${low}% (אותו כלל כמו "לתשומת לב"). "${DONUT_TEXT.bandMid}" = בין ${low}% ל-${high}%.`,
    `הגרף השני מופיע כשסיימו לפחות ${CLASS_SUMMARY_MIN_COMPLETED} תלמידים, כדי שלא יסכם את הכיתה לפי תלמיד/ה בודד/ת.`,
  ]
}

/* ── AI_SUMMARY: סיכום מילולי של ד״ר הולו (תלמיד · כיתה · מקצוע בכיתה · הגשה) ──
   · ה-AI מנסח רק מרשימת עובדות סגורות. כל העובדות (aiFact*) נבנות כאן מתבניות ובלי שם תלמיד/מורה (חוק 12).
   · התבנית הדטרמיניסטית (כש-AI אינו זמין או נכשל בבדיקה) וכל הטקסטים שבממשק חיים כאן. הפרומפט חי ב-server/src/lib/aiSummary/prompt.ts.
   · ניסוח תצפיתי וזהיר בלבד (חוקים 1, 7): מתארים מה נצפה, לא מה גרם לכך. */
export type AiSummaryScopeKey = 'student' | 'class' | 'class_subject' | 'submission'
export type AiSummaryUnit = 'sessions' | 'students'

export const AI_SUMMARY_TEXT = {
  heading: 'סיכום מילולי',
  headingByScope: {
    /* שם אחד לסיכום: "סיכום מד״ר הולו" — כמו הכפתור שפותח אותו (AI_SUMMARY_PANEL_TEXT.openButton) */
    student: 'סיכום מד״ר הולו על התלמיד/ה',
    class: 'סיכום מד״ר הולו על הכיתה',
    class_subject: 'סיכום מד״ר הולו על המקצוע בכיתה',
    submission: 'סיכום מד״ר הולו על השיעור',
  },
  label: {
    ai: 'נכתב על ידי ד״ר הולו (בינה מלאכותית)',
    template: 'סיכום אוטומטי מהנתונים',
    demo: 'סיכום הדגמה',
  },
  notice: {
    /* מוצג אחרי ניסיון כתיבה בבינה מלאכותית שלא הצליח (תקלה או בדיקת פלט): אומרים מה קרה, לא רק מה מוצג */
    template: 'ד״ר הולו לא הצליח לנסח הפעם סיכום, ולכן זה סיכום אוטומטי מהנתונים, שלא נכתב בבינה מלאכותית. אפשר לנסות שוב.',
    demo: 'זה סיכום הדגמה: הוא נבנה אוטומטית מנתוני ההדגמה ואינו נשמר.',
  },
  editedBadge: 'נערך על ידך',
  howWrittenTitle: 'איך נכתב הסיכום?',
  /* מה לעשות: הסיכום נעלם עם סגירת המסך, ולכן שומרים אותו בייצוא או בהדפסה */
  persistenceNote: 'הסיכום לא נשמר במערכת, והוא ייעלם כשתסגרו את המסך. כדי לשמור אותו, ייצאו ל-Word או הדפיסו לפני שתסגרו. אם תערכו אותו, גם העריכה תישמר רק עד סגירת המסך.',
  /* כפתורים ומצבים בממשק — כל כפתור עם מילה */
  ui: {
    generate: 'כתבו לי סיכום',
    writing: 'ד״ר הולו כותב, זה לוקח כחצי דקה',
    regenerate: 'כתיבה מחדש',
    edit: 'עריכה',
    save: 'שמירה',
    cancel: 'ביטול',
    revert: 'חזרה לטקסט של ד״ר הולו',
    exportWord: 'ייצוא ל-Word',
    print: 'הדפסה',
    retryAi: 'נסו שוב עם ד״ר הולו',
    close: 'סגירה',
  },
  /* שורות הייצוא ל-Word */
  exportLine: {
    ai: 'נוצר בעזרת בינה מלאכותית',
    aiEdited: 'נוצר בעזרת בינה מלאכותית ונערך על ידי המורה',
    template: 'סיכום אוטומטי מהנתונים',
    demo: 'סיכום הדגמה',
  },
  /* התבנית הדטרמיניסטית (fallback) — הפתיח והחיבורים; העובדות עצמן מגיעות מ-aiFact* */
  template: {
    openingTail: 'זה מה שעולה מהנתונים:',
    strengthsLead: 'מה שבולט לטובה:',
    attentionLead: 'מה כדאי לבדוק:',
    nothingToCheck: 'לא נצפה כרגע משהו חריג שדורש בדיקה.',
    step: {
      student: 'צעד אפשרי: שיחה קצרה עם התלמיד/ה, ואם צריך שיעור חזרה ממוקד. אפשר לבדוק שוב בעוד כמה שבועות.',
      class: 'צעד אפשרי: להקדיש חלק משיעור לחזרה על התחום המאתגר, ולבדוק שוב בעוד כמה שבועות.',
      class_subject: 'צעד אפשרי: להקדיש חלק משיעור לחזרה על הטעות הנפוצה, ולבדוק שוב בעוד כמה שבועות.',
      submission: 'צעד אפשרי: לחזור בכיתה על האתגר שהכי הרבה תלמידים התקשו בו, או ליצור שיעור חזרה.',
    },
  },
} as const

/* הודעות שגיאה בנתיב הסיכום */
export const ERR_SUMMARY_NOT_CONNECTED = 'הסיכום המילולי עדיין אינו מופעל בחשבון זה'
export const ERR_SUMMARY_NOT_FOUND = 'הסיכום לא נמצא'
export const ERR_SUMMARY_BAD_REQUEST = 'הבקשה לסיכום אינה תקינה'
export const ERR_SUMMARY_DEMO_EDIT = 'סיכום הדגמה אינו נשמר, ולכן אי אפשר לערוך אותו'
export const ERR_SUMMARY_EMPTY_EDIT = 'אי אפשר לשמור סיכום ריק. כדי לחזור לטקסט של ד״ר הולו לחצו על "חזרה לטקסט של ד״ר הולו".'
export const ERR_SUMMARY_LIMIT_DAILY = 'הגעתם למספר הסיכומים המרבי להיום. אפשר להמשיך מחר.'
export const ERR_SUMMARY_COOLDOWN = 'הסיכום נכתב לפני רגע. אפשר לכתוב מחדש בעוד כמה שניות.'

/* "שם התלמיד/ה לא נשלח לבינה המלאכותית" — לפי ההיקף */
export const aiSummaryPrivacyNote = (scope: AiSummaryScopeKey): string =>
  scope === 'student' ? 'שם התלמיד/ה לא נשלח לבינה המלאכותית.' : 'שמות התלמידים לא נשלחים לבינה המלאכותית.'
/* ההסבר מעל הכפתור "כתבו לי סיכום" */
export const aiSummaryGenerateHint = (scope: AiSummaryScopeKey): string =>
  `הבינה המלאכותית (ד״ר הולו) תכתוב 2-3 פסקאות מהנתונים שכבר מופיעים במסך. ${aiSummaryPrivacyNote(scope)}`

/* "אין מספיק נתונים": מה קורה ומה יקרה (עיקרון 9) */
export function aiSummaryNotEnough(scope: AiSummaryScopeKey, min: number): { text: string; whatNext: string } {
  switch (scope) {
    case 'student':
      return { text: 'עוד אין מספיק נתונים לסיכום על התלמיד/ה.', whatNext: `הסיכום יהיה זמין אחרי ${min === 1 ? 'שיעור אחד' : `${min} שיעורים`} לפחות.` }
    case 'class':
      return { text: 'עוד אין מספיק נתונים לסיכום על הכיתה.', whatNext: `הסיכום יהיה זמין כשיהיו נתונים על ${min === 1 ? 'תלמיד/ה אחד/ת' : `${min} תלמידים`} לפחות.` }
    case 'class_subject':
      return { text: 'עוד אין מספיק נתונים לסיכום על המקצוע בכיתה.', whatNext: `הסיכום יהיה זמין כשיהיו נתונים על ${min === 1 ? 'תלמיד/ה אחד/ת' : `${min} תלמידים`} לפחות.` }
    case 'submission':
      return { text: 'עוד אין מספיק תלמידים שסיימו כדי לסכם את השיעור.', whatNext: `הסיכום יהיה זמין כשיסיימו לפחות ${min === 1 ? 'תלמיד/ה אחד/ת' : `${min} תלמידים`}.` }
  }
}

/* "מבוסס על 14 הדמיות" / "מבוסס על 22 תלמידים" / "מבוסס על 18 תלמידים שסיימו" — יחידה נכונה לכל היקף */
export function aiSummaryBasis(scope: AiSummaryScopeKey, unit: AiSummaryUnit, n: number): string {
  if (unit === 'sessions') return basedOnSessions(n)
  if (scope === 'submission') return n === 1 ? 'מבוסס על תלמיד/ה אחד/ת שסיים/ה' : `מבוסס על ${n} תלמידים שסיימו`
  return `מבוסס על ${studentsWord(n)}`
}

/* שורות "איך נכתב הסיכום?" — במילים פשוטות מה נשלח ומה לא; המודל וגרסת ההנחיה בסוף */
export function aiSummaryHowWritten(i: { scope: AiSummaryScopeKey; writtenBy: 'ai' | 'template'; demo: boolean; model?: string | null; promptVersion?: string | null }): string[] {
  if (i.writtenBy === 'template') {
    /* סיכום הדגמה נבנה מראש בלי בינה מלאכותית. סיכום אוטומטי אצל מורה אמיתי נבנה רק אחרי שניסיון לכתוב אותו בבינה מלאכותית נכשל או נפסל — וההסבר אומר זאת */
    if (i.demo) return ['זה סיכום הדגמה. הוא נבנה אוטומטית מנתוני ההדגמה, בלי בינה מלאכותית, ואינו נשמר.', 'שום מידע על תלמידים לא נשלח החוצה כדי לבנות אותו.']
    return [
      'הסיכום נבנה אוטומטית מהעובדות שחושבו במערכת.',
      'קודם נעשה ניסיון לכתוב אותו בעזרת בינה מלאכותית. הניסיון לא הצליח או לא עבר את הבדיקה האוטומטית, ולכן מוצג כאן סיכום אוטומטי במקומו.',
      ...aiSummaryWhatIsSent(i.scope),
    ]
  }
  const lines = [
    'ד״ר הולו כתב את הסיכום מתוך רשימת עובדות שחושבו במערכת מהנתונים שמופיעים במסך. הוא לא רואה את הנתונים המלאים.',
    ...aiSummaryWhatIsSent(i.scope),
    'לפני שהסיכום מוצג המערכת בודקת אותו: כל מספר חייב להופיע בעובדות, אין הסברים לסיבות, אין תוויות על תלמידים והניסוח זהיר. אם הבדיקה נכשלת מוצג סיכום אוטומטי במקומו.',
  ]
  if (i.model) lines.push(`המודל שכתב: ${i.model}${i.promptVersion ? `. גרסת ההנחיה: ${i.promptVersion}` : ''}.`)
  return lines
}

/* מה נשלח לבינה המלאכותית ומה לא — במילים פשוטות, והצהרה שנאכפת בקוד (inputs.ts: ניקוי טקסט חופשי לפני שהוא נכנס לעובדה) */
export function aiSummaryWhatIsSent(scope: AiSummaryScopeKey): string[] {
  const lines = [
    aiSummaryPrivacyNote(scope),
    'מה נשלח לבינה המלאכותית: רק רשימת עובדות שחושבו במערכת (למשל רמות, מגמות וספירות כמו "11 מתוך 24"), שמות המקצועות והתחומים, כותרות של אתגרים ויעדי למידה, ושכבת הגיל.',
    'מה לא נשלח: שמות תלמידים, מספרי זיהוי, שמות מורים, שם או מספר הכיתה ותאריכים מדויקים. אם בכותרת של אתגר או של יעד מופיעים שם, כתובת אימייל או מספר טלפון, הם מוסרים לפני השליחה.',
  ]
  if (scope === 'student') lines.push('אם הוגדר מגדר לתלמיד/ה, נשלחת רק ההנחיה לכתוב בלשון זכר או בלשון נקבה.')
  return lines
}

/* פתיח התבנית: "מבוסס על 14 הדמיות. זה מה שעולה מהנתונים:" */
export const aiTemplateOpening = (scope: AiSummaryScopeKey, unit: AiSummaryUnit, n: number): string =>
  `${aiSummaryBasis(scope, unit, n)}. ${AI_SUMMARY_TEXT.template.openingTail}`

/* ── עובדות ל-AI ולתבנית: כל עובדה היא משפט אחד שמסתיים בנקודה, בלי שם תלמיד/מורה ובלי מזהה ── */
const factPosition = (p: Position | null): string => (p ? ` (${POSITION_TEXT[p]})` : '')

/* תלמיד/ה: רמה נוכחית במקצוע, מיקום מול הטווח המיועד לשכבה, ומספר ההדמיות שהיא מבוססת עליהן */
export const aiFactLevel = (subject: string, level: number, position: Position | null, sessions: number): string =>
  `ב${subject} הרמה הנוכחית היא ${fmt1(level)}${factPosition(position)}, על סמך ${sessionsCount(sessions)}.`
export const aiFactTrend = (subject: string, trend: Trend, group = false): string =>
  `ב${subject} המגמה האחרונה: ${(group ? GROUP_TREND_TEXT : TREND_TEXT)[trend]}.`
export function aiFactAreas(subject: string, strong: string[], challenging: string[]): string {
  const parts: string[] = []
  if (strong.length) parts.push(`התחומים החזקים: ${strong.join(', ')}`)
  if (challenging.length) parts.push(`התחומים המאתגרים: ${challenging.join(', ')}`)
  return `ב${subject} ${parts.join('; ')}.`
}
export const aiFactError = (subject: string, title: string, hits: number, exposures: number): string =>
  `ב${subject} טעות נפוצה: "${title}" — ${countOf(hits, exposures)} שאלות.`

/* כיתה / מקצוע בכיתה */
export const aiFactClassLevel = (subject: string, level: number, position: Position | null, students: number): string =>
  `ב${subject} הרמה הממוצעת בכיתה היא ${fmt1(level)}${factPosition(position)}, על סמך נתוני ${studentsWord(students)}.`
export const aiFactClassAttention = (subject: string, alerts: number, students: number): string =>
  `ב${subject} ${countOf(alerts, students)} תלמידים לתשומת לב.`
export function aiFactPositionSplit(subject: string, above: number, within: number, below: number, total: number): string {
  const parts: string[] = []
  if (above > 0) parts.push(`${above} מעל הטווח המיועד`)
  if (within > 0) parts.push(`${within} בתוכו`)
  if (below > 0) parts.push(`${below} מתחתיו`)
  return `ב${subject} מתוך ${total} תלמידים: ${joinSubjectNames(parts)}.`
}
export function aiFactTrendSplit(subject: string, improving: number, steady: number, declining: number, total: number): string {
  const parts: string[] = []
  if (improving > 0) parts.push(`${improving} בעלייה`)
  if (steady > 0) parts.push(`${steady} יציבים`)
  if (declining > 0) parts.push(`${declining} בירידה`)
  return `ב${subject} מגמת התלמידים (מתוך ${total}): ${joinSubjectNames(parts)}.`
}
export const aiFactMisconception = (subject: string, title: string, countText: string): string =>
  `ב${subject} טעות נפוצה בכיתה: "${title}" — ${countText}.`

/* הגשה (שליחה של הדמיה לכיתה) */
const AI_BAND_WORDS = { high: 'הצליחו ברוב האתגרים', mid: 'הצליחו בחלק מהאתגרים', low: 'הצליחו במעט' } as const
export function aiFactCompletion(total: number, completed: number, inProgress: number, notStarted: number): string {
  const parts: string[] = []
  if (completed > 0) parts.push(`${completed} סיימו`)
  if (inProgress > 0) parts.push(`${inProgress} באמצע`)
  if (notStarted > 0) parts.push(`${notStarted} עוד לא התחילו`)
  return `מתוך ${total} תלמידים: ${joinSubjectNames(parts)}.`
}
export function aiFactSuccessBands(basis: number, high: number, mid: number, low: number): string {
  const parts: string[] = []
  if (high > 0) parts.push(`${high} ${AI_BAND_WORDS.high}`)
  if (mid > 0) parts.push(`${mid} ${AI_BAND_WORDS.mid}`)
  if (low > 0) parts.push(`${low} ${AI_BAND_WORDS.low}`)
  return `מבין ${basis} התלמידים שסיימו: ${joinSubjectNames(parts)}.`
}
export const aiFactChallenge = (order: number, typeLabel: string, title: string, attempted: number, solved: number, gaveUp: number): string =>
  `אתגר ${order} (${typeLabel}${title ? `, "${title}"` : ''}): ${countOf(solved, attempted)} הצליחו${gaveUp > 0 ? `, ${gaveUp} ויתרו` : ''}.`
export const aiFactCommonError = (title: string, students: number, exposed: number): string =>
  `טעות נפוצה בשיעור: "${title}" — ${countOf(students, exposed)} תלמידים.`
export const aiFactObjective = (text: string, levelText: string, solved: number, attempted: number): string =>
  `היעד "${text}": ${levelText} (${countOf(solved, attempted)} תלמידים).`
export const aiFactAttentionCount = (n: number, total: number): string => `${countOf(n, total)} תלמידים לתשומת לב.`

/* ── V2_CORE: ספק משותף (הדגמה וחי) — הודעות מצב, פרטיות מנהל וכיסוי נתונים ── */
export const ERR_V2_DISABLED = 'האנליטיקה החדשה אינה זמינה בחשבון זה'
export const ERR_V2_UNAVAILABLE = 'השירות אינו זמין לרגע — נסו שוב בעוד כמה שניות'
export const ERR_V2_BAD_SUBJECT = 'מקצוע לא מוכר'
export const ERR_V2_BAD_SCOPE = 'היקף לא תקין'
/* תא שכולו כיתה אחת: המספר היה מזהה כיתה, ולכן הוא מוסתר (כמו תא קטן מדי) */
export const ADMIN_HIDDEN_CELL_SINGLE_CLASS_TEXT = 'הנתון הזה לא מוצג כי הוא מבוסס על כיתה אחת בלבד, כדי לשמור על פרטיות'
/* כשיש שכבה קטנה מהסף היא אינה מוצגת, ולכן גם סך התלמידים והכיתות אינו מפורסם (חיסור היה חושף אותה) */
export function narrateAdminSchoolPartial(grades: number): string {
  return grades === 1 ? 'התוצאות מוצגות לשכבה אחת בבית הספר.' : `התוצאות מוצגות ל-${grades} שכבות בבית הספר.`
}
/* משחקים בהדמיות שעוד לא שויך להן מקצוע אינם נכנסים לתוצאות (לא מנחשים מקצוע) — המורה צריך לדעת למה חסר משהו ומה עושים */
export function narrateUnclassifiedNote(plays: number): string {
  const what = plays === 1 ? 'משחק אחד בשיעור שעוד לא שויך לו מקצוע לא נכלל' : `${plays} משחקים בשיעורים שעוד לא שויך להם מקצוע לא נכללו`
  /* G1: שיוך בדיעבד לא מחזיר משחקים שכבר שוחקו (הרמה שלהם חושבה בלי מקצוע) — לא מבטיחים שהתוצאות "יתווספו" */
  return `${what} כאן. משחקים שכבר שוחקו לא ייכללו גם אחרי שיוך מקצוע, כי הרמה שלהם חושבה בלי מקצוע. כדי שמשחקים חדשים ייספרו, שייכו מקצוע לשיעורים שיצרתם, בספרייה.`
}
/* ── LIVE_DATA: נתוני אמת — המתנה לטעינה וכיסוי תיוג ── */
export const ERR_ANALYSIS_WARMING = 'אנחנו מרכזים את התוצאות של הכיתה. נסו שוב בעוד דקה.'
export const ERR_ANALYSIS_UNAVAILABLE = 'לא הצלחנו לטעון את התוצאות כרגע. נסו שוב בעוד כמה שניות.'
/* הדמיות עוד לא תויגו לטעויות נפוצות ולתחומי תוכן (רשימות סגורות ובדוקות בלבד) — אומרים מה קורה ומה יקרה */
export const LIVE_COVERAGE_UNTAGGED = 'טעויות נפוצות (טעויות שחוזרות אצל כמה תלמידים) ותחומים חזקים ומאתגרים (חלוקת הרמה לנושאים) עדיין לא פעילים בחשבון שלכם. אין מה לעשות מצדכם כדי להפעיל אותם. בינתיים מוצגות הרמות והמגמות.'
/* ── G1 (UX#15): מצב ריק כן אצל מנהל — תא מוצג רק עם מספיק תלמידים ומספיק כיתות, ולא מבטיחים ש"יופיע כשיסיימו" ── */
export const ADMIN_MIN_CELL_CLASSES = 2 /* שווה ל-MIN_CELL_CLASSES ב-adminPrivacy.ts (נאכף בטסט) */
export function narrateAdminNoResults(o: { minStudents?: number; minClasses?: number; singleClassPerGrade?: boolean } = {}): string {
  const rule = `תוצאות של שכבה ומקצוע מוצגות רק כשיש בהן לפחות ${o.minStudents ?? MIN_CELL_SIZE} תלמידים ולפחות ${o.minClasses ?? ADMIN_MIN_CELL_CLASSES} כיתות, כדי שלא יהיה אפשר לזהות כיתה או מורה.`
  return o.singleClassPerGrade
    ? `עוד אין תוצאות להציג מבית הספר. בבית ספר עם כיתה אחת בשכבה לא מוצגות תוצאות לפי שכבה. ${rule}`
    : `עוד אין תוצאות להציג מבית הספר. ${rule}`
}
export const ADMIN_NO_RESULTS_TEXT = narrateAdminNoResults()
/* ── V2_CLIENT: מסכי האנליטיקה אצל מורה אמיתי — שגיאות בעברית פשוטה, מצבי "עוד אין תוצאות" והתצוגה הקודמת ── */
export const ERR_V2_UNAUTHORIZED = 'ההתחברות פגה. התחברו שוב כדי להמשיך.'
export const ERR_V2_FORBIDDEN = 'אין לכם הרשאה לצפות בזה. אפשר לראות רק כיתות ותלמידים שאתם מלמדים.'
export const ERR_V2_NOT_FOUND = 'לא מצאנו את מה שחיפשתם. ייתכן שזה לא שייך לכיתות שלכם, או שהקישור ישן.'
export const ERR_V2_RATE_LIMIT = 'נעשו הרבה בקשות בזמן קצר. חכו רגע ונסו שוב.'
export const ERR_V2_BAD_REQUEST = 'הבקשה אינה תקינה. חזרו לבחירת הכיתה ונסו שוב.'
export const ERR_V2_GENERIC = 'משהו השתבש בטעינת התוצאות. אפשר לנסות שוב.'
export const V2_CLIENT_TEXT = {
  /* מורה מקצועי/ת בכיתה שבה עוד אין מקצוע פתוח לו/לה */
  noOpenSubject: {
    title: 'עוד אין תוצאות במקצוע שלכם בכיתה הזאת.',
    whatNext: 'הן יופיעו כאן כשתלמידי הכיתה ישחקו בשיעורים במקצוע שלכם. אם המקצוע שלכם עוד לא הוגדר בכיתה הזאת, פנו למנהל/ת בית הספר. את המקצוע מגדירים בניהול הכיתות.',
  },
  noOpenSubjectStudent: {
    title: 'עוד אין תוצאות במקצוע שלכם אצל התלמיד/ה הזה/זו.',
    whatNext: 'הן יופיעו כאן אחרי שיושלמו שיעורים במקצוע שלכם.',
  },
  classNotFound: { title: 'לא מצאנו את הכיתה הזאת.', whatNext: 'ייתכן שהקישור ישן, או שהכיתה אינה ברשימה שלכם. אפשר לבחור כיתה מחדש.' },
  entry: {
    noResultsBadge: 'עוד אין תוצאות',
    noResultsAtAll: 'עוד אין תוצאות באף כיתה. הן יופיעו כאן כשתלמידים יסיימו שיעורים שמשויך להם מקצוע.',
    noClasses: { title: 'עוד לא שויכתם לכיתות.', whatNext: 'בקשו ממנהל/ת בית הספר לשייך אתכם לכיתה. התוצאות יופיעו כאן כשתלמידי הכיתה ישחקו בשיעורים. אם אתם משויכים לכיתה ועדיין לא רואים אותה, ייתכן שלא הוגדרה לה שכבה — גם את זה מגדירים בניהול הכיתות, דרך מנהל/ת בית הספר.' },
    assignSubjects: 'שייכו מקצוע לשיעורים',
    previousViewSentence: 'גרף ההתקדמות הכללי, כפי שהיה עד עכשיו, זמין בתצוגה הקודמת.',
    /* בראש המסך (כשאין תוצאות באף כיתה): אומרים שזה מה שאפשר לראות בינתיים */
    previousViewSentenceTop: 'בינתיים אפשר לראות את גרף ההתקדמות הכללי של התלמידים, כפי שהיה עד עכשיו.',
    previousView: 'גרף ההתקדמות הכללי (התצוגה הקודמת)',
    /* כרטיס כיתה: מילת פעולה גלויה בכותרת, והתפקיד של הצופה בכיתה הזאת (מחנך/ת בכיתה אחת ומורה מקצועי בשנייה — ההבדל גלוי לפני הלחיצה) */
    openClassHomeroom: 'לסקירת הכיתה',
    openClassSubject: 'לתוצאות הכיתה',
    roleHomeroom: 'מחנך/ת',
    roleSubject: (subjectNames: string): string => `מורה מקצוע: ${subjectNames}`,
    /* "ועוד 2 תלמידים בכיתה" — קישור אל רשימת התלמידים של הכיתה */
    seeAllStudents: 'לכל התלמידים בכיתה',
    /* שיוך לכיתה בלי מקצוע פתוח: הסיבה האמיתית, במקום "עוד אין תוצאות" (שאומר שלא שיחקו) */
    noOpenSubjectBadge: 'המקצוע שלכם עוד לא הוגדר',
  },
  /* מסך "התצוגה הקודמת": שם בנתיב החזרה, ומילת החזרה לתצוגה החדשה */
  previous: {
    crumb: 'התצוגה הקודמת', backToNew: 'חזרה לתצוגה החדשה',
    /* הערת הקשר בראש המסך הישן: מסבירה מה זה ושהוא זמני, בלי לשכתב אותו */
    notice: 'זו התצוגה הקודמת של האנליטיקה, והיא תוסר בעתיד. התוצאות המלאות נמצאות בתצוגה החדשה.',
  },
  briefingEmpty: { title: 'עוד אין מספיק נתונים להכנה לישיבה.', whatNext: 'ההכנה לישיבה תתמלא כשתלמידים יסיימו כמה שיעורים.' },
  feedbackEmpty: { title: 'עוד אין משוב להציג לתלמיד/ה.', whatNext: 'המשוב יופיע כאן אחרי שיהיו כמה שיעורים שהושלמו.' },
  focusedQuest: { exists: 'כבר קיים שיעור ממוקד לטעות הזאת:', none: 'עוד אין שיעור ממוקד לטעות הזאת.' },
  /* ניהול הכיתה: הסיכום הפדגוגי של הכיתה נמצא באנליטיקה (מחנך/ת הכיתה בלבד) */
  classSummary: { title: 'סיכום פדגוגי לכיתה', sentence: 'הסיכום של ד״ר הולו על הכיתה נמצא במסך האנליטיקה של הכיתה.', open: 'פתיחת הסיכום' },
  noStudentsInSubject: 'עוד אין תלמידים להצגה במקצוע הזה. הם יופיעו כאן כשתלמידי הכיתה יסיימו שיעורים במקצוע.',
  areasDash: 'מקף (—) אומר שהנתון עוד לא נמדד.',
  adminNoResults: ADMIN_NO_RESULTS_TEXT,
  studentNoResults: (firstName: string): string => `עוד אין תוצאות על ${firstName}. הן יופיעו כאן אחרי כמה משחקים בשיעורים ששויך להם מקצוע.`,
} as const
/* ── V2_ROSTER_LINK: רוסטר הניהול — אין עמוד התקדמות / סיכום אישי באנליטיקה לתלמידים ולכיתות המוצגים. אומרים מה קורה ומה אפשר לעשות ── */
export const V2_ROSTER_LINK_TEXT = {
  student: {
    demo_org: 'אלה תלמידי הדגמה, ולכן אין להם עמוד התקדמות או סיכום אישי. בלשונית ״אנליטיקה״ מוצגת כיתת הדגמה נפרדת.',
    unavailable: 'עמוד ההתקדמות והסיכום האישי של התלמידים אינם זמינים כרגע. אפשר לנסות שוב מאוחר יותר.',
  },
  cls: {
    demo_org: 'זו כיתת הדגמה, ולכן אין לה סיכום פדגוגי. בלשונית ״אנליטיקה״ מוצגת כיתת הדגמה נפרדת.',
    unavailable: 'הסיכום הפדגוגי של הכיתה אינו זמין כרגע. אפשר לנסות שוב מאוחר יותר.',
  },
} as const
/* ── V2_CONFIG_FALLBACK: מסכי האנליטיקה החדשים לא נטענו אצל מורה — מוצג גרף ההתקדמות הכללי, עם הסבר וכפתור "נסו שוב" ── */
export const V2_CONFIG_FALLBACK_TEXT = {
  notice: 'לא הצלחנו לטעון עכשיו את מסכי התוצאות החדשים, ולכן מוצג כאן גרף ההתקדמות הכללי. אפשר לנסות שוב.',
} as const
/* ── AI_SUMMARY_CLIENT: הפאנל של הסיכום המילולי בלקוח — מצבים, שגיאות וייצוא (הכפתורים והתוויות הכלליות ב-AI_SUMMARY_TEXT) ── */
export const AI_SUMMARY_PANEL_TEXT = {
  /* הכפתור שפותח את הסיכום ממסך תלמיד/כיתה */
  openButton: 'סיכום מד״ר הולו (בינה מלאכותית)',
  loading: 'טוענים את הסיכום…',
  saving: 'שומרים…',
  retry: 'נסו שוב',
  /* הכרטיס המוטמע במסך צפוף: פותח/סוגר את הטקסט */
  read: 'קריאת הסיכום',
  hide: 'הסתרת הסיכום',
  editFieldLabel: 'עריכת הסיכום',
  editHint: 'אפשר לשנות את הניסוח. כדי להתחיל פסקה חדשה, השאירו שורה ריקה.',
  /* מורה מקצועי/ת: הסיכום מתייחס רק למה שהוא/היא רשאי/ת לראות */
  subjectOnly: 'הסיכום מתייחס רק למקצועות שאתם מלמדים בכיתה הזאת.',
  classLabel: (name: string): string => `כיתה ${name}`,
  /* מסמך הייצוא/ההדפסה: הכותרת מורכבת מהיקף + שם (השם מגיע מהמסך, לא מהבינה המלאכותית) */
  doc: {
    brand: 'HoloAcademy',
    title: (heading: string, name: string): string => (name ? `${heading}: ${name}` : heading),
    /* התאריך במסמך הוא תאריך הכתיבה של הסיכום (AI_SUMMARY_HARDENING_TEXT.writtenOn), לא יום הייצוא */
  },
} as const

/* ── AI_SUMMARY_HARDENING: סיכום ישן ("ייתכן שהנתונים השתנו"), אישור כתיבה מחדש על סיכום ערוך, ייצוא מתוארך להפרשת הנתיב הישן ──
   · כתיבה מחדש מוחקת את עריכת המורה, ולכן דורשת אישור במילים (שני כפתורים), וגם השרת אוכף (409) — עריכה מלשונית אחרת נתפסת שם.
   · תאריך הכתיבה מוצג בולט ומודפס במסמך הייצוא: מסמך מיוצא מתאר את מצב הנתונים ביום הכתיבה, לא ביום הייצוא. */
export const ERR_SUMMARY_EDIT_EXISTS = 'בסיכום הזה יש עריכה שלכם, וכתיבה מחדש תמחק אותה. כדי להמשיך צריך לאשר את המחיקה.'
export const ERR_LEGACY_SUMMARY_MOVED = 'הסיכום עבר למסך התלמיד/ה והכיתה באנליטיקה'
export const AI_SUMMARY_HARDENING_TEXT = {
  stale: 'ייתכן שהנתונים השתנו מאז שהסיכום נכתב. אפשר לכתוב אותו מחדש.',
  writtenOn: (date: string): string => `נכתב בתאריך ${date}`,
  confirmRegenerate: {
    title: 'לכתוב את הסיכום מחדש?',
    body: 'הכתיבה מחדש תמחק את העריכה שלכם, ולא יהיה אפשר להחזיר אותה. הסיכום החדש ייכתב מהנתונים העדכניים.',
    confirm: 'כתיבה מחדש ומחיקת העריכה שלי',
    cancel: 'ביטול, להשאיר את העריכה שלי',
  },
  /* הפנייה מהפאנל הקודם של התלמיד/ה אל הסיכום החדש */
  legacyMoved: { sentence: 'הסיכום של ד״ר הולו על התלמיד/ה עבר למסך התלמיד/ה באנליטיקה.', open: 'פתיחת הסיכום באנליטיקה' },
} as const

/* שגיאות הפאנל (כשהשרת לא החזיר הודעה בעברית) */
export const ERR_SUMMARY_LOAD = 'לא הצלחנו להביא את הסיכום. אפשר לנסות שוב.'
export const ERR_SUMMARY_WRITE = 'לא הצלחנו לכתוב את הסיכום. אפשר לנסות שוב.'
export const ERR_SUMMARY_SAVE = 'לא הצלחנו לשמור את העריכה. אפשר לנסות שוב.'

/* ── FX1B_PRIVACY_COVERAGE: דומיננטיות כיתה בתא מנהל · מה חסר בתוצאות ולמה (כיתה בלי שכבה / שלא נטענה / משחקים בלי רמה) ── */
/* תא שנשען בעיקר על כיתה אחת: תורם בודד מכיתה אחרת לא מסתיר שהמספר הוא בפועל כיתה (ומורה) מזוהים */
export const ADMIN_HIDDEN_CELL_DOMINANT_CLASS_TEXT = 'הנתון הזה לא מוצג כי הוא מבוסס בעיקר על כיתה אחת, כדי לשמור על פרטיות'
export interface CoverageGapsInput {
  /* כיתות בהיקף שלא הוגדרה להן שכבה (לא מופיעות במסכים) */
  ungradedClasses: number
  /* שמות הכיתות האלה (שם כיתה אינו פרט על תלמיד). אופציונלי; מופיעים במשפט רק עד 3 ורק כשמספרם זהה ל-ungradedClasses. למנהל לא מעבירים שמות */
  ungradedClassNames?: readonly string[]
  /* כיתות שהטעינה שלהן נכשלה בתשתית (חולף) / עדיין נמשכת (שאר הכיתות מוצגות) */
  notLoadedClasses: number
  loadingClasses: number
  /* כיתות שהחישוב נכשל על הנתונים שלהן (לא יעבור בניסיון חוזר) — אופציונלי */
  dataErrorClasses?: number
  /* משחקים בהדמיות עם מקצוע שלא חושבה להם רמה (אין רמה בכלל, או שחושבה לא לפי המקצוע), ולכן אינם נכללים ברמות ובמגמות */
  playsWithoutLevel: number
}
const classesPhrase = (n: number, one: string, many: (n: number) => string): string => (n === 1 ? one : many(n))
/* משפטים קצרים ובעברית פשוטה: מה חסר, למה, ומה עושים / מה יקרה. בלי שמות תלמידים. */
export function narrateCoverageGaps(i: CoverageGapsInput): string[] {
  const out: string[] = []
  if (i.ungradedClasses > 0) {
    const names = (i.ungradedClassNames ?? []).map((n) => n.trim())
    const named = names.length === i.ungradedClasses && names.length <= 3 && names.every((n) => n.length > 0)
    out.push(named
      ? (names.length === 1
        ? `לכיתה ${names[0]} לא הוגדרה שכבה, ולכן היא לא מופיעה כאן. הגדירו לה שכבה בניהול הכיתות.`
        : `לכיתות ${joinSubjectNames(names)} לא הוגדרה שכבה, ולכן הן לא מופיעות כאן. הגדירו להן שכבה בניהול הכיתות.`)
      : classesPhrase(i.ungradedClasses,
        'לכיתה אחת לא הוגדרה שכבה, ולכן היא לא מופיעה כאן. הגדירו לה שכבה בניהול הכיתות.',
        (n) => `ל-${n} כיתות לא הוגדרה שכבה, ולכן הן לא מופיעות כאן. הגדירו להן שכבה בניהול הכיתות.`))
  }
  if (i.loadingClasses > 0) {
    out.push(classesPhrase(i.loadingClasses,
      'כיתה אחת עדיין נטענת, ולכן היא עוד לא מופיעה כאן. רעננו את הדף בעוד דקה.',
      (n) => `${n} כיתות עדיין נטענות, ולכן הן עוד לא מופיעות כאן. רעננו את הדף בעוד דקה.`))
  }
  if (i.notLoadedClasses > 0) {
    out.push(classesPhrase(i.notLoadedClasses,
      'לא הצלחנו לטעון כיתה אחת, ולכן היא חסרה כאן. שאר הכיתות מוצגות כרגיל. נסו שוב בעוד כמה דקות.',
      (n) => `לא הצלחנו לטעון ${n} כיתות, ולכן הן חסרות כאן. שאר הכיתות מוצגות כרגיל. נסו שוב בעוד כמה דקות.`))
  }
  const dataErrors = i.dataErrorClasses ?? 0
  if (dataErrors > 0) {
    out.push(classesPhrase(dataErrors,
      'לא הצלחנו לחשב את התוצאות של כיתה אחת, ולכן היא חסרה כאן. שאר הכיתות מוצגות כרגיל. אם זה חוזר גם בעוד כמה דקות, כדאי לדווח לנו.',
      (n) => `לא הצלחנו לחשב את התוצאות של ${n} כיתות, ולכן הן חסרות כאן. שאר הכיתות מוצגות כרגיל. אם זה חוזר גם בעוד כמה דקות, כדאי לדווח לנו.`))
  }
  if (i.playsWithoutLevel > 0) out.push(playsWithoutLevelSentence(i.playsWithoutLevel))
  return out
}

/* ── G2_CLIENT: שיוך מקצוע בספרייה · הערת כיסוי במסכי כיתה/תלמיד · תוכן שעוד לא תויג · משוב והכנה לישיבה ──
   · הספרייה מסוננת ל"הדמיות בלי מקצוע" (?filter=nosubject) — היעד של הכפתור "שייכו מקצוע להדמיות" באנליטיקה.
   · תוכן שעוד לא תויג: אומרים מה חסר באמת (התיוג עוד לא בוצע בחשבון) ומה יקרה כשיבוצע — לא מבטיחים "כשיצטברו תשובות". */
export const LIBRARY_ASSIGN_TEXT = {
  filterGroupLabel: 'סינון השיעורים שלי',
  allChip: 'כל השיעורים',
  noSubjectChip: (n: number): string => `ללא מקצוע (${n})`,
  intro: 'אלה השיעורים שעוד לא שויכו למקצוע. בחרו מקצוע ליד כל אחד, כדי שמשחקים חדשים בשיעור ייכללו בתוצאות ובאנליטיקה.',
  noneLeft: { title: 'כל השיעורים שלכם כבר משויכים למקצוע.', whatNext: 'התוצאות שלהם יופיעו באנליטיקה כשתלמידים ישחקו בהם.' },
  selectLabel: 'שיוך למקצוע',
  selectPlaceholder: 'בחרו מקצוע…',
  /* אומר את האמת על שיוך בדיעבד: משחקים חדשים ייכללו; משחקים שכבר שוחקו לא (הרמה שלהם חושבה בלי מקצוע) — לא מבטיחים "הנתונים יופיעו" */
  saved: 'המקצוע נשמר. משחקים חדשים בשיעור הזה ייכללו באנליטיקה; משחקים שכבר שוחקו בו לא ייכללו.',
  backToAnalytics: 'חזרה לאנליטיקה',
  dismiss: 'סגירה',
  noMatches: 'אין תוצאות לחיפוש או לסינון',
} as const

/* מצב שיעור שנשלח + תאריך יעד (CLAUDE.md "תאריך יעד ומצב שיעור"). המצב עצמו מגיע מהשרת (lessonState) — כאן רק הניסוח. */
export const LESSON_STATE_TEXT = {
  active_now: { label: 'פעיל עכשיו', hint: 'תלמידים שיחקו בשיעור ב-5 הדקות האחרונות.' },
  open: { label: 'פתוח להגשה', hint: 'מועד ההגשה עוד לא הגיע.' },
  ended: { label: 'ההגשה הסתיימה', hint: 'מועד ההגשה עבר. השיעור לא ננעל — מי שיסיימו אותו עכשיו יסומנו "באיחור".' },
} as const
export const ERR_DUE_NOT_ALLOWED = 'רק מי ששלחו את השיעור או מחנכי הכיתה יכולים לשנות את מועד ההגשה.'
export const ERR_DUE_INVALID = 'תאריך לא תקין. בחרו יום מלא (יום-חודש-שנה).'
export const ERR_DUE_PAST = 'בחרו תאריך מהיום והלאה.'
export const ERR_DUE_UNAVAILABLE = 'שינוי מועד הגשה עוד לא זמין במערכת. נסו שוב מאוחר יותר.'
export const ERR_DUE_DEMO = 'מצב הדגמה — אי אפשר לשנות מועד הגשה. הירשמו כמורים כדי לשלוח שיעורים לכיתות אמיתיות.'
export const LESSON_DUE_TEXT = {
  dueLine: (iso: string): string => `להגשה עד ${dateHe(iso)}`,
  endedLine: (iso: string): string => `ההגשה הסתיימה ב-${dateHe(iso)}`,
  noDue: 'ללא מועד הגשה',
  late: 'באיחור',
  lateCount: (n: number, completed: number): string => `באיחור: ${countNb(n, completed)}`,
  changeButton: 'שינוי מועד הגשה',
  fieldLabel: 'מועד הגשה חדש',
  fieldHint: 'המועד נגמר בסוף היום שנבחר (23:59). השיעור לא ננעל אחריו.',
  save: 'שמירה',
  cancel: 'ביטול',
  saved: (iso: string): string => `מועד ההגשה עודכן: ${dateHe(iso)}.`,
  saveFailed: 'לא הצלחנו לשמור את מועד ההגשה. נסו שוב בעוד רגע.',
  sendFieldLabel: 'להגשה עד',
  sendFieldHint: 'ברירת המחדל: שבוע מהיום. אפשר לשנות. השיעור לא ננעל אחרי המועד — מי שיסיימו אחריו יסומנו "באיחור".',
  pastDay: 'בחרו תאריך מהיום והלאה.',
} as const

/* מסכי כיתה/תלמיד: כשיש משחקים בהדמיות בלי מקצוע, מצב ריק שאומר "עוד לא שיחקו" היה שקרי — מוסיפים את ההסבר האמיתי */
export const V2_COVERAGE_TEXT = {
  emptyHint: 'אם התלמידים כבר שיחקו, ייתכן שהשיעורים לא היו משויכים למקצוע בזמן המשחק — ראו ההסבר למעלה.',
  classOverviewEmpty: {
    title: (className: string): string => `עוד אין נתונים על כיתה ${className}.`,
    whatNext: 'הסקירה תופיע כאן כשתלמידי הכיתה ישחקו בשיעורים.',
  },
} as const
export const withCoverageHint = (text: string, hasCoverageNote: boolean): string => (hasCoverageNote ? `${text} ${V2_COVERAGE_TEXT.emptyHint}` : text)

/* תוכן ההדמיות עוד לא תויג: המשפטים עצמם ב-CATALOG_UNTAGGED_TEXT (מקור יחיד); כאן רק תוויות המסך — כותרת הכרטיס שמחליף את "תחומים" ו"טעויות נפוצות",
   והסיבה שמוצגת בתוך הטאב החסום (עיקרון 10: אפור + מנעול + הסבר גלוי) */
export const V2_UNTAGGED_TEXT = {
  cardTitle: 'תחומים וטעויות נפוצות',
  tabLockedReason: 'לא פעיל בחשבון הזה',
} as const

/* שכבות-על: משוב אישי לתלמיד/ה (טיוטה למסירה) והכנה לישיבה פדגוגית */
export const V2_SHEETS_TEXT = {
  feedback: {
    title: 'משוב אישי לתלמיד/ה — טיוטה למסירה',
    intro: 'זו טיוטה של משוב אישי. אפשר להדפיס אותה ולמסור אותה לתלמיד/ה, או להראות אותה על המסך. המערכת לא שולחת אותה לתלמיד/ה, ואין בה השוואה לתלמידים אחרים.',
    kind: { growth: 'צמיחה', streak: 'התמדה', next_step: 'הצעד הבא' },
  },
  briefing: {
    student: 'מסמך להדפסה לישיבה פדגוגית על התלמיד/ה. אפשר להשתמש בו גם לישיבת תל״א (תכנית לימודים אישית).',
    class: 'מסמך להדפסה לישיבה פדגוגית על הכיתה.',
    emptySection: { strengths: 'עוד לא זוהתה חוזקה בולטת בנתונים שיש עד עכשיו.', difficulties: 'עוד לא זוהתה נקודה לשיחה בנתונים שיש עד עכשיו.', fallback: 'אין כאן פריטים עדיין.' },
  },
} as const

/* ── G1_EMPTY_TRUTH: אמת במצבים ריקים (נתוני אמת) ──
   · משחקים שכבר שוחקו ולא נכללו (בהדמיות בלי מקצוע / בלי רמה לפי מקצוע) — המצב הריק אומר זאת, ולא "כשיסיימו".
   · קטלוג לא פעיל (אין תיוג): טעויות נפוצות ותחומים אינם פעילים בחשבון; אין הבטחת תאריך ואין מה לעשות מצד המורה.
   · "אין חריג / אין תלמידים לתשומת לב" נאמר רק עם בסיס נתונים. */

/* משחקים שלא נכללו בהיקף מסוים (כיתה / תלמיד/ה): בהדמיות בלי מקצוע, ובהדמיות עם מקצוע שלא חושבה להן רמה לפי מקצוע */
export interface CoverageGap { unclassified: number; withoutLevel: number }

export const NO_DATA_YET_SHORT = 'עוד אין מספיק נתונים'
export const ATTENTION_THIN_TEXT = 'עוד אין מספיק נתונים כדי לזהות תלמידים לתשומת לב.'

/* משפט הסיבה האמיתית למצב ריק (כיתה / תלמיד/ה), או null כשאין פער כיסוי. כשיש משחקים בהדמיות בלי מקצוע — הפעולה היא שיוך מקצוע (למשחקים חדשים) */
export function gapReason(gap: CoverageGap | null | undefined): string | null {
  if (!gap) return null
  if (gap.unclassified > 0) return 'המשחקים שכבר שוחקו נמצאים בשיעורים שעוד לא שויך להם מקצוע, ולכן לא נכללו. כדי שמשחקים חדשים ייספרו, שייכו מקצוע לשיעורים שיצרתם, בספרייה.'
  if (gap.withoutLevel > 0) return 'המשחקים שכבר שוחקו לא נכללו, כי לא חושבה להם רמה לפי מקצוע. משחקים חדשים ייכללו כרגיל.'
  return null
}

/* "משחק אחד לא נכלל ברמות ובמגמות כי לא חושבה לו רמה" (נאמר גם בהערת הכיתות וגם בהערה הממוקדת) */
export function playsWithoutLevelSentence(plays: number): string {
  return plays === 1
    ? 'משחק אחד לא נכלל ברמות ובמגמות כי לא חושבה לו רמה. משחקים חדשים ייכללו כרגיל.'
    : `${plays} משחקים לא נכללו ברמות ובמגמות כי לא חושבה להם רמה. משחקים חדשים ייכללו כרגיל.`
}

/* הערת כיסוי ממוקדת למסך כיתה / תלמיד/ה — אותם משפטים כמו הערת הכניסה, בהיקף המסך. null כשאין פער */
export function narrateScopedCoverageNote(gap: CoverageGap | null | undefined): string | null {
  if (!gap) return null
  const parts: string[] = []
  if (gap.unclassified > 0) parts.push(narrateUnclassifiedNote(gap.unclassified))
  if (gap.withoutLevel > 0) parts.push(playsWithoutLevelSentence(gap.withoutLevel))
  return parts.length > 0 ? parts.join(' ') : null
}

/* קטלוג ריק (אין תיוג של תוכן ההדמיות): תצוגות שתלויות בו לא פעילות בחשבון. משפט אחד לכל משטח, בלי הבטחת תאריך ובלי פעולה מצד המורה */
export const CATALOG_UNTAGGED_TEXT = {
  /* catalogNote בחוזה: משפט כללי אחד (מה זה, שזה לא פעיל, שאין מה לעשות) */
  note: LIVE_COVERAGE_UNTAGGED,
  /* משפט הלשונית "טעויות נפוצות" (tabSummaries.misconceptions) */
  errorsTabSummary: 'טעויות נפוצות עדיין לא פעילות בחשבון שלכם, ואין מה לעשות מצדכם. בינתיים מוצגות הרמות והמגמות.',
  /* מצב ריק של טעויות נפוצות (מנהל / תלמיד/ה) */
  errorsEmpty: {
    title: 'טעויות נפוצות עדיין לא פעילות בחשבון שלכם.',
    whatNext: 'זו תצוגה של טעויות שחוזרות אצל כמה תלמידים באותו נושא. אין מה לעשות מצדכם כדי להפעיל אותה. בינתיים אפשר לראות את הרמות והמגמות בלשוניות האחרות.',
  },
  whatToTeach: 'המלצות לשיעור הבא נבנות מהטעויות הנפוצות, והן עדיין לא פעילות בחשבון שלכם. אין מה לעשות מצדכם.',
  areas: 'תחומים חזקים ומאתגרים (חלוקת הרמה לנושאים) עדיין לא פעילים בחשבון שלכם. אין מה לעשות מצדכם.',
  areasDash: 'מקף (—) אומר שהנתון עוד לא נמדד.',
} as const

/* בחשבון אמיתי אין מגמה לכיתה / מקצוע שלמים (ההשוואה היא בתוך הכיתה) — לא "אין עדיין מספיק נתונים", שמבטיח שזה יגיע */
export const GROUP_TREND_NOT_SHOWN_TEXT = 'לא מוצגת מגמה לכיתה כולה'

/* עמודת מגמה: "אין עדיין מספיק נתונים" הכללי מוחלף בכמה יש וכמה צריך (needMoreLine בגרסה קצרה לתא בטבלה) */
export const narrateTrendNeedMore = (plays: number, need: number): string => `עוד אין מגמה: יש ${playsCount(plays)}, וצריך לפחות ${need}`

/* כרטיס כיתה בכניסה בלי תלמידים לתשומת לב: וי ירוק רק עם בסיס נתונים. assessed = מי שאפשר היה לבדוק אצלו שינוי, total = תלמידי הכיתה */
export const narrateEntryBasisNote = (assessed: number, total: number): string =>
  assessed <= 0 ? 'עוד אין מספיק נתונים כדי לזהות שינוי.' : `נתונים על ${countOf(assessed, total)} תלמידים — עוד מוקדם לדעת.`

/* מורה ששויך לכיתה בלי מקצוע (ובלי חינוך): אומרים את האמת — יש תלמידים, ואין מקצוע מוגדר — ולמי לפנות */
export function narrateNoOpenSubjectNote(classNames: readonly string[]): string {
  const names = classNames.map((n) => n.trim()).filter((n) => n.length > 0)
  const count = Math.max(1, classNames.length)
  const multi = count > 1
  const where = names.length === 0 || names.length > 3 ? (multi ? `ל-${count} כיתות` : 'לכיתה') : names.length === 1 ? `לכיתה ${names[0]}` : `לכיתות ${joinSubjectNames(names)}`
  return `אתם משויכים ${where} אבל עוד לא הוגדר לכם ${multi ? 'בהן' : 'בה'} מקצוע, ולכן אין לכם נתונים ${multi ? 'בהן' : 'בה'}. את המקצוע מגדירים בניהול הכיתות — פנו למנהל/ת בית הספר.`
}

/* מנהל: משחקים בהדמיות בלי מקצוע (סך בית הספר). מספר קטן מהסף לא מפורסם */
export function narrateAdminUnclassifiedNote(plays: number): string {
  const how = plays < MIN_CELL_SIZE ? 'כמה משחקים' : `${plays} משחקים`
  return `${how} בשיעורים שעוד לא שויך להם מקצוע לא נכללו בתוצאות. כדי שמשחקים חדשים ייספרו, צריך לשייך מקצוע לשיעורים בספריית השיעורים.`
}
/* מנהל: "נתונים שלא מוצגים" — ללא "תא", ובצורת רבים/יחיד נכונה */
export const narrateAdminHiddenNote = (n: number): string =>
  n === 1 ? 'נתון אחד לא מוצג כי יש בו מעט תלמידים או כיתה אחת בלבד.' : `${n} נתונים לא מוצגים כי יש בהם מעט תלמידים או כיתה אחת בלבד.`
/* מנהל: גודל שכבה — "כיתה אחת · 6 תלמידים" / "2 כיתות · 52 תלמידים" */
export const narrateGradeSize = (classCount: number, studentCount: number): string =>
  `${classCount === 1 ? 'כיתה אחת' : `${classCount} כיתות`} · ${studentCount === 1 ? 'תלמיד אחד' : `${studentCount} תלמידים`}`
