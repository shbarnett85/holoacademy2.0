/* ──────────────────────────────────────────────────────────────────────────
   הערת כיסוי (coverageNote) מתשובת שרת: משחקים בהיקף המסך (כיתה / מקצוע / תלמיד/ה) שלא נכללו — בהדמיות בלי מקצוע או בלי רמה — ומה עושים.
   שדה אופציונלי בחוזה (ClassOverview / ClassSubjectView / StudentOverview): מחרוזת לא ריקה, או null/חסר = אין פער.
   ────────────────────────────────────────────────────────────────────────── */

export function coverageNoteOf(d: { coverageNote?: string | null } | null | undefined): string | null {
  const v = d?.coverageNote
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}
