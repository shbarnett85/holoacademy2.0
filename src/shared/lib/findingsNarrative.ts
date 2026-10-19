/* ──────────────────────────────────────────────────────────────────────────
   findingsNarrative — מודול התבניות היחיד לטקסט בשפה טבעית באנליטיקה החדשה (שלב D).
   · ספק ההדגמה והמנוע האמיתי (שלבים 5–7) מייצרים ממצאים כמבנה נתונים, ורק כאן הם הופכים לטקסט.
   · אסור טקסט קשיח ב-fixtures: כל משפט שמוצג למשתמש על ממצא/המלצה/תדריך/משוב נבנה מכאן.
   · חוק 7: ניסוח תצפיתי והסתברותי בלבד — לא שיפוטי, לא תווית. מגמה ולא פסק דין.
   · חוק 1: ה-AI אינו מאבחן; התבניות מתארות נתונים שכבר חושבו.
   pure: ללא DOM/Node, ללא Date.now() — התאריכים מגיעים מהקורא.
   ────────────────────────────────────────────────────────────────────────── */
import type { Evidence, InsufficientReason } from '../types/analyticsV2'
import type { FindingKind } from './analyticsConfig'
import { contentVectorLabel } from './analyticsConfig'
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

/* ── הסתייגויות קבועות (חוקים 7, 11) ── */
export const CAVEAT_AGE_NORM = 'משווים לרמה המיועדת לשכבה בסולם ההדמיות, לא למבחן ארצי. הרצועה נועדה להקשר בלבד ואינה ציון.'
export const CAVEAT_CROSS_SUBJECT = 'הרמות של מקצועות שונים אינן ניתנות להשוואה ישירה: לכל מקצוע סולם תוכן משלו, ואין כאן ציון מאוחד. ההשוואה זה לצד זה נועדה להצגת תמונה, לא לדירוג.'
export const CAVEAT_TREND = 'המערכת מתארת מגמות שנצפו בנתונים ואינה קובעת את סיבותיהן. כל מגמה היא נקודת התחלה לשיחה ולא פסק דין.'

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

/* ── שמות הדפוסים לניסוח "אין מספיק נתונים" ── */
const KIND_NOUN: Record<FindingKind, string> = {
  level_trend: 'מגמת רמה',
  class_concept_improvement: 'שינוי כיתתי',
  memory_random_pattern: 'דפוס לחיצות במשחק הזיכרון',
  position_bias: 'דפוס בחירת מיקום',
  reading_skip: 'דפוס קריאה',
  cross_subject_dip: 'מגמה חוצת-מקצועות',
}

export function narrateInsufficient(kind: FindingKind, reason: InsufficientReason, n: number, minN: number, c: NarrativeCtx = {}): string {
  const head = `אין עדיין מספיק נתונים לדווח על ${KIND_NOUN[kind]}${inSubject(c)}`
  if (reason === 'n_below_min') return `${head}: נאספו ${n} תצפיות ומינימום הדיווח הוא ${minN}. המערכת לא מסיקה מסקנות מדגימה כה קטנה.`
  return `${head}: הנתונים שנאספו (${n} תצפיות) אינם מאפשרים עדיין להבחין בדפוס באופן מהימן, ולכן לא מדווח כאן אירוע.`
}

/* ── ממצא מדווח ── */
export function narrateFinding(e: Evidence, c: NarrativeCtx = {}): string {
  const name = who(c)
  switch (e.kind) {
    case 'level_trend': {
      const m = monthName(e.changeDate)
      if (e.direction === 'down') {
        return `${name}${inSubject(c)}: מחודש ${m} נצפתה ירידה ברמה, מ-${fmt1(e.fromLevel)} ל-${fmt1(e.toLevel)} (${levelsWord(e.deltaLevels)}). ההצלחה הממוצעת ב-${e.sessionsAfter} ההדמיות האחרונות עומדת על ${pct0(e.successAfter)}%, לעומת ${pct0(e.successBefore)}% ב-${e.sessionsBefore} ההדמיות שקדמו להן. זוהי מגמה שנצפתה; הנתונים אינם מסבירים את סיבתה.`
      }
      return `${name}${inSubject(c)}: מחודש ${m} נצפתה עלייה ברמה, מ-${fmt1(e.fromLevel)} ל-${fmt1(e.toLevel)} (${levelsWord(e.deltaLevels)}). ההצלחה הממוצעת ב-${e.sessionsAfter} ההדמיות האחרונות עומדת על ${pct0(e.successAfter)}%, לעומת ${pct0(e.successBefore)}% ב-${e.sessionsBefore} ההדמיות שקדמו להן.`
    }
    case 'class_concept_improvement': {
      const since = `${termLabel(e.term)} (${monthYear(e.sinceDate)})`
      return `${c.className ? `בכיתה ${c.className} ` : 'בכיתה '}נצפה שיפור ממוצע של ${fmt1(e.meanDelta)} רמות לתלמיד/ה ב${e.conceptTitle}${inSubject(c) ? ` (${c.subjectName})` : ''} מאז תחילת ${since}: ${e.improvedCount} מתוך ${e.studentsCount} תלמידים השתפרו.`
    }
    case 'memory_random_pattern': {
      const lik = pct0(e.randomLikelihood)
      const strength = e.randomLikelihood >= 0.9 ? 'בסבירות גבוהה' : 'בסבירות בינונית'
      return `${name}${inSubject(c)}: ב-${e.games} משחקי זיכרון (${e.turns} תורות) שיעור איתור זוג שכבר נחשף היה ${pct0(e.observedRate)}%, לעומת כ-${pct0(e.attentiveRate)}% בקשב רגיל וכ-${pct0(e.randomRate)}% בניחוש אקראי. דפוס הלחיצות תואם ${strength} לחיצות אקראיות (${lik}% לפי השוואת שתי ההשערות); זו תצפית על הדפוס ולא קביעה לגבי הסיבה.`
    }
    case 'position_bias':
      return `${name}${inSubject(c)}: ב-${e.items} פריטי בחירה מרובה נבחרה האפשרות הראשונה ב-${pct0(e.observedShare)}% מהמקרים, לעומת כ-${pct0(e.expectedShare)}% הצפויים כשמיקום התשובה אינו משפיע. הנתונים תואמים נטייה לבחור באפשרות הראשונה, ללא קשר לתוכנה.`
    case 'reading_skip':
      return `${name}${inSubject(c)}: זמן המעבר בין שקפים (כ-${Math.round(e.msPerWord)} אלפיות שנייה למילה, ב-${e.scenes} שקפים) קצר משמעותית מחציון הכיתה (${Math.round(e.classMedianMsPerWord)}) ואינו תואם לאורך הטקסט. ייתכן שהקריאה מדולגת; מומלץ לבדוק זאת בשיחה או בצפייה בהדמיה.`
    case 'cross_subject_dip': {
      const list = joinSubjectNames(e.subjects.map((s) => subjectName(s.code)))
      return `${name}: מחודש ${monthName(e.startDate)} נצפתה ירידה מקבילה בכמה מקצועות. דפוס מקביל כזה מופיע לעיתים כשהגורם אינו קשור למקצוע בודד, ועל כן מוצג כהתרעה מוקדמת לבדיקה ולשיחה, בלי הנחה לגבי הסיבה. (${list})`
    }
  }
}

/* שם המקצוע לרשימת cross_subject — הקורא מספק מחרוזת מוכנה */
export function joinSubjectNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return names.slice(0, -1).join(', ') + ' ו' + names[names.length - 1]
}

/* ── תפיסות שגויות והמלצות ── */
export interface MisconceptionNarrativeInput {
  titleHe: string
  conceptTitle: string
  studentsShowing: number
  studentsExposed: number
  sharePct: number
  minHits: number
  gradeLabel?: string
}

export function narrateRecommendation(m: MisconceptionNarrativeInput, hasLinkedQuest: boolean): string {
  const base = `מומלץ להקדיש חלק מהשיעור הבא ל${m.conceptTitle}: ${m.studentsShowing} מתוך ${m.studentsExposed} תלמידים (${m.sharePct}%) בחרו שוב ושוב במסיח שמבטא את התפיסה "${m.titleHe}" (לפחות ${m.minHits} פריטים לתלמיד).`
  return hasLinkedQuest ? `${base} קיימת הדמיה ממוקדת לתפיסה זו.` : base
}

export function narrateAdminMisconception(titleHe: string, sharePct: number, gradeLabel: string): string {
  return `${sharePct}% מתלמידי שכבה ${gradeLabel} נטו לבחור במסיח שמבטא את התפיסה "${titleHe}".`
}

/* ── תדריך (ישיבה פדגוגית + בסיס ראייתי) ── */
export function narrateStrengthAbove(subjectName: string, level: number, normCenter: number): string {
  return `ב${subjectName} הרמה הנוכחית (${fmt1(level)}) גבוהה מהרמה המיועדת לשכבה בסולם ההדמיות (${fmt1(normCenter)}).`
}
export function narrateDifficultyBelow(subjectName: string, level: number, normCenter: number): string {
  return `ב${subjectName} הרמה הנוכחית (${fmt1(level)}) נמוכה מהרמה המיועדת לשכבה בסולם ההדמיות (${fmt1(normCenter)}); זו נקודת ייחוס להקשר ולא מדד לכשירות.`
}
export function narrateVectorStrength(vectorKey: string, subjectName: string, level: number): string {
  return `ב${subjectName}, בווקטור "${contentVectorLabel(vectorKey)}" נמדדה רמה ${fmt1(level)}.`
}
export function narrateVectorGap(vectorKey: string, subjectName: string, level: number, subjectLevel: number): string {
  return `ב${subjectName}, בווקטור "${contentVectorLabel(vectorKey)}" נמדדה רמה ${fmt1(level)}, נמוכה מהרמה הכללית במקצוע (${fmt1(subjectLevel)}).`
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
export function narrateEvidenceWindow(startIso: string, endIso: string, sessions: number, subject?: string): string {
  return `${subject ? `${subject} — ` : ''}חלון הנתונים: ${monthYear(startIso)} עד ${monthYear(endIso)} · ${sessions} הדמיות שהושלמו.`
}
/* ירידה ברמה — ניסוח קצר לסעיף "קשיים" בתדריך (הפירוט המלא בסעיף "מגמה") */
export function narrateDifficultyFromTrend(subjectName: string, changeIso: string, deltaLevels: number): string {
  return `ב${subjectName}: ירידה של ${levelsWord(deltaLevels)} ברמה מאז ${monthName(changeIso)} (הפירוט והראיות בסעיף המגמה).`
}
export const EVIDENCE_METHOD_NOTE =
  'הממצאים מבוססים על תשובות ופעילות בהדמיות בלבד. כל דפוס מדווח רק לאחר שעמד בסף מינימום של תצפיות, בתיקון Benjamini-Hochberg לבדיקות מרובות ובגודל אפקט מינימלי. המערכת אינה מאבחנת ואינה קובעת את סיבות ההתנהגות.'
export const EVIDENCE_LIMITS_NOTE =
  'מידע שאינו זמין למערכת: התנהגות בכיתה, ציונים במבחנים, ידע קודם והקשר אישי או משפחתי. יש להצליב את הנתונים עם התרשמות המורה לפני כל החלטה.'

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

/* ── שורות ראיה קצרות לתדריך (חלון, N, p מתוקן, גודל אפקט) ── */
export function evidenceLines(n: number, pAdj: number | null, effect: number | null, startIso: string, endIso: string): string[] {
  const out = [`N = ${n}`, `חלון: ${monthYear(startIso)} – ${monthYear(endIso)}`]
  if (pAdj !== null) out.push(`p מתוקן (BH) = ${pAdj < 0.001 ? '< 0.001' : (Math.round(pAdj * 1000) / 1000).toString()}`)
  if (effect !== null) out.push(`גודל אפקט = ${fmt1(effect)}`)
  return out
}

/* ── כותרות תדריך, הודעות שגיאה ושורות ראיה (כל טקסט שמוצג — מכאן) ── */
export const BRIEFING_SECTION_TITLES = {
  strengths: 'חוזקות',
  difficulties: 'קשיים (עם ראיות)',
  trend: 'מגמה',
  recommendations: 'המלצות',
  unknowns: 'מה עדיין לא ידוע',
  evidence_basis: 'בסיס ראייתי לתל״א',
} as const
export const briefingTitleStudent = (name: string): string => `תדריך לישיבה פדגוגית — ${name}`
export const briefingTitleClass = (className: string): string => `תדריך כיתתי לישיבה פדגוגית — כיתה ${className}`
export const ERR_AGGREGATE_ONLY = 'נתוני תלמידים ברמה האישית אינם זמינים לתפקיד זה — רק תמונות רחבות ומגמות'
export const ERR_NO_ACCESS = 'אין הרשאה לצפות בנתון זה'
export const ERR_NOT_FOUND = 'לא נמצא'
export const normBandLine = (low: number, high: number): string => `רצועת הנורמה: ${low}–${high}`
export const needMoreLine = (n: number, minN: number): string => `N = ${n}, נדרש לפחות ${minN}`
export const exposuresLine = (minExposures: number): string => `${minExposures}+ חשיפות לתלמיד`
