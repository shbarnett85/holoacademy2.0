/* ──────────────────────────────────────────────────────────────────────────
   teacherUi — טוקנים משותפים לערכת הממשק של מסכי המורה (תוצאות, אנליטיקה).
   מקור יחיד לגדלים ולצבעים של הערכה. העקרונות מחייבים (CLAUDE.md, "עקרונות ממשק למסכי מורה"):
   גוף טקסט 16px לפחות · טקסט משני 14px לפחות · אזור לחיצה 44px לפחות · ניגודיות AA בבהיר ובכהה ·
   צבע לעולם לא לבד (תמיד אייקון + מילה). הצבעים הם טוקני הערכה var(--tN) בלבד — אין צבע מוחלט.
   ────────────────────────────────────────────────────────────────────────── */

/** גודל מינימלי לאזור לחיצה (px) — גובה לכל כפתור/טאב/קישור פעיל */
export const MIN_TARGET = 44
/** גוף טקסט (px) */
export const BODY = 16
/** טקסט משני / תוויות עזר (px) — לעולם לא קטן מזה */
export const SMALL = 14
/** משפט הסיכום (px) */
export const SENTENCE = 18
/** כותרת המסך — השאלה (px) */
export const H1 = 24

/* משטחי מורה ומנהל: רדיוס 12 */
export const RADIUS = { sm: 8, md: 12, lg: 12 } as const
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const

/* רוחב התוכן במסך 1366: padding צדדי של 24px משני הצדדים */
export const GUTTER = 24
/* רווח בתחתית העמוד (מתחת לאזור התוכן). קטן מהרווח הצדדי כדי שכל טאב ייכנס במסך אחד ב-1366×768 */
export const PAGE_BOTTOM = 16
export const CONTENT_MAX_WIDTH = 1500

/* פלטה סמנטית — רק טוקני הערכה (var(--tN)). ערכי הטוקנים נמדדו בשתי הערכות:
   text/textSoft/muted/accent/good/warn/bad ≥ 4.5:1 על רקע האולפן; controlBorder ≥ 3:1. */
export const T = {
  text: 'var(--color-ink)',
  textSoft: 'var(--color-ink)',
  muted: 'var(--color-muted)',
  accent: 'var(--color-machine-deep)',
  accentStrong: 'var(--color-machine-deep)',
  good: 'var(--color-correct)',
  warn: 'var(--color-human-deep)',
  bad: 'var(--color-wrong)',
  violet: 'var(--color-machine-deep)',
  /** גבול דקורטיבי של כרטיס (לא נושא משמעות) */
  border: 'var(--color-line-strong)',
  /** גבול של פקד אינטראקטיבי (≥ 3:1 מול הרקע, בבהיר ובכהה) */
  controlBorder: 'var(--color-ink)',
  surface: 'var(--color-surface)',
  surfaceSoft: 'var(--color-surface)',
  /** מילוי עדין של פקד נבחר/מודגש */
  accentFill: 'var(--color-machine-tint)',
  grid: 'var(--color-line)',
  axis: 'var(--color-muted)',
  pointFill: 'var(--color-surface)',
  /** טקסט על גרדיאנט-מבטא (לא בשימוש בערכה עצמה — לכפתורי מילוי מלאים) */
  onAccent: 'var(--color-ink)',
  studioBg: 'var(--color-machine-bg)',
  /* רקע עמוד שלם (עם רשת הנקודות); studioBg הוא הצבע האחיד, לפסים ולשכבות מעל העמוד */
  pageBg: 'var(--page-background)',
  /** קו מתאר וצל קשיח של משטח (מסכי מורה ומנהל) */
  line: 'var(--border-staff)',
  shadow: 'var(--shadow-staff)',
  /** אזור שבו ה-AI מציע */
  aiFill: 'var(--color-machine-tint)',
  /** ממצא על תלמיד/ה: רקע וטקסט */
  findingFill: 'var(--color-human-tint)',
  findingText: 'var(--color-human-deep)',
  /** שם ואווטאר */
  nameFill: 'var(--color-human-soft)',
  /** מילוי של התקדמות */
  progress: 'var(--color-human)',
} as const

export type Tone = 'positive' | 'attention' | 'neutral' | 'error'

/* טון = צבע + אייקון + מילה. הצבע לעולם לא מופיע בלעדיו (עיקרון 7). */
export const TONE_META: Record<Tone, { color: string; word: string }> = {
  positive: { color: T.good, word: 'חיובי' },
  attention: { color: T.warn, word: 'לתשומת לב' },
  error: { color: T.bad, word: 'שגיאה' },
  neutral: { color: T.muted, word: 'ללא שיפוט' },
}

export const FONT = 'var(--font-display)'
