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

export const RADIUS = { sm: 10, md: 14, lg: 18 } as const
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const

/* רוחב התוכן במסך 1366: padding צדדי של 24px משני הצדדים */
export const GUTTER = 24
/* רווח בתחתית העמוד (מתחת לאזור התוכן). קטן מהרווח הצדדי כדי שכל טאב ייכנס במסך אחד ב-1366×768 */
export const PAGE_BOTTOM = 16
export const CONTENT_MAX_WIDTH = 1500

/* פלטה סמנטית — רק טוקני הערכה (var(--tN)). ערכי הטוקנים נמדדו בשתי הערכות:
   text/textSoft/muted/accent/good/warn/bad ≥ 4.5:1 על רקע האולפן; controlBorder ≥ 3:1. */
export const T = {
  text: 'var(--t68)',
  textSoft: 'var(--t12)',
  muted: 'var(--t6)',
  accent: 'var(--t15)',
  accentStrong: 'var(--t1)',
  good: 'var(--t3)',
  warn: 'var(--t4)',
  bad: 'var(--t5)',
  violet: 'var(--t54)',
  /** גבול דקורטיבי של כרטיס (לא נושא משמעות) */
  border: 'var(--t26)',
  /** גבול של פקד אינטראקטיבי (≥ 3:1 מול הרקע, בבהיר ובכהה) */
  controlBorder: 'var(--t22)',
  surface: 'var(--t25)',
  surfaceSoft: 'var(--t70)',
  /** מילוי עדין של פקד נבחר/מודגש */
  accentFill: 'var(--t20)',
  grid: 'var(--t62)',
  axis: 'var(--t63)',
  pointFill: 'var(--t61)',
  /** טקסט על גרדיאנט-מבטא (לא בשימוש בערכה עצמה — לכפתורי מילוי מלאים) */
  onAccent: 'var(--t-on-accent)',
  studioBg: 'var(--t-studio-bg)',
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
