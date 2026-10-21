/* ──────────────────────────────────────────────────────────────────────────
   רוסטר הניהול ← מסכי האנליטיקה. כפתורי "התקדמות" ו"סיכום פדגוגי" ברוסטר (וסיכום הכיתה בניהול הכיתה) מנווטים לעמוד התלמיד/ה
   או הכיתה באנליטיקה. השרת (GET /api/staff/students, /classes) אומר אם העמוד קיים (v2Linked) ולמה לא (v2UnlinkedReason):
   ארגון הדגמה מחזיר תלמידי DB פיקטיביים שעולם ההדגמה של האנליטיקה לא מכיר — ניווט אליהם היה נגמר ב"לא נמצא".
   כשאין עמוד: מסתירים את הכפתורים ואומרים במילים למה (עיקרון 9) — לא מנווטים. שדה חסר (שרת ישן) = יש עמוד, כמו שהיה.
   טהור — בלי DOM ובלי רשת.
   ────────────────────────────────────────────────────────────────────────── */
import { V2_ROSTER_LINK_TEXT } from '../../shared/lib/findingsNarrative'

export type V2UnlinkedReason = 'demo_org' | 'unavailable'

/** מה שהשרת מוסיף לתגובות הרוסטר (בכל תגובת /students, ובכל שורת כיתה ב-/classes) */
export interface V2LinkInfo {
  v2Linked?: boolean
  v2UnlinkedReason?: V2UnlinkedReason | null
}

const isLinked = (link: V2LinkInfo): boolean => link.v2Linked !== false
const reasonOf = (link: V2LinkInfo): V2UnlinkedReason => (link.v2UnlinkedReason === 'demo_org' ? 'demo_org' : 'unavailable')

/* מנהלים (אגרגטים בלבד): אין להם פריטים ברמת תלמיד בכלל — הכפתורים מוסתרים לפי התפקיד, בלי משפט (נאכף גם בשרת) */
const AGGREGATE_ROLES: readonly string[] = ['admin', 'municipal_admin']

/** כפתורי האנליטיקה בשורת תלמיד/ה: האם להציג, ואם לא — המשפט שמסביר למה (null = אין מה להסביר) */
export function rosterAnalyticsLinks(p: { role: string | null; link: V2LinkInfo }): { show: boolean; note: string | null } {
  if (p.role !== null && AGGREGATE_ROLES.includes(p.role)) return { show: false, note: null }
  if (isLinked(p.link)) return { show: true, note: null }
  return { show: false, note: V2_ROSTER_LINK_TEXT.student[reasonOf(p.link)] }
}

/** סיכום הכיתה בניהול הכיתה: null = אפשר לפתוח; אחרת המשפט שמחליף את הכפתור */
export function classSummaryNote(link: V2LinkInfo): string | null {
  return isLinked(link) ? null : V2_ROSTER_LINK_TEXT.cls[reasonOf(link)]
}
