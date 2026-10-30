/* סצנת "הסיפור נשאר פתוח" (pure): מה נחשב ניסוח ישן שצריך המרה, ומה חייב להתקיים בטקסט החדש. */
export interface EndingText { title?: string; narrative?: string; drHoloDialog?: string; [k: string]: unknown }

/* הביטויים האלה אסורים בממשק ובתוכן */
export const FORBIDDEN_ENDING_RE = /הסיום הטוב|הסיום הרע|סיום טוב|סיום רע|סוף טוב|סוף רע/

/* ניסוח של כישלון או של טון קודר */
const FAILURE_RE = /נכשל|הפסד|לא הצלחת|לצערי|כישלון|אכזב|מאוכזב|חבל ש|לא עמדת|נגמר הסיכוי/
/* אוצר המילים של המנגנון לא נכנס לסצנה */
const MECHANIC_RE = /גביש|קריסטל|רסיס|נקודות/
/* סימן שהטקסט כבר מדבר על סיפור פתוח */
const OPEN_RE = /תובנ/
const INVITE_RE = /שוב|נחזור|חזרו|ננסה|נמשיך|המשיכו|עוד פעם/

const textOf = (e: EndingText): string => [e.title, e.narrative, e.drHoloDialog].filter(Boolean).join(' ')

/* האם צריך לשכתב: כישלון, ביטוי אסור, אוצר מילים של המנגנון, או שאין בו "תובנות" והזמנה לשחק שוב */
export function needsEndingRewrite(e: EndingText | null | undefined): boolean {
  if (!e) return false
  const t = textOf(e)
  if (FORBIDDEN_ENDING_RE.test(t) || FAILURE_RE.test(t) || MECHANIC_RE.test(t)) return true
  return !(OPEN_RE.test(t) && INVITE_RE.test(t))
}

const words = (s: string | undefined): number => (s ?? '').trim().split(/\s+/).filter(Boolean).length

/* מה לא תקין בטקסט שהוחזר. null = תקין */
export function endingProblem(e: EndingText): string | null {
  const t = textOf(e)
  if (!e.title?.trim() || !e.narrative?.trim()) return 'חסרה כותרת או נרטיב'
  if (FORBIDDEN_ENDING_RE.test(t)) return 'ביטוי אסור'
  if (FAILURE_RE.test(t)) return 'ניסוח של כישלון'
  if (MECHANIC_RE.test(t)) return 'אוצר מילים של מנגנון המשחק'
  if (!OPEN_RE.test(t)) return 'חסר "תובנות"'
  if (!INVITE_RE.test(t)) return 'חסרה הזמנה לשחק שוב'
  if (/בואו ת/.test(t)) return 'צירוף שגוי ("בואו ת…" במקום "בואו נ…")'
  if (words(e.narrative) > 35 || words(e.drHoloDialog) > 22 || words(e.title) > 7) return 'ארוך מדי'
  return null
}
