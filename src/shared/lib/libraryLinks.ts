/* ──────────────────────────────────────────────────────────────────────────
   קישורים בין האנליטיקה לספריית ההדמיות. מקור יחיד לכתובת הספרייה המסוננת ל"הדמיות בלי מקצוע" ולפרמטר שלה:
   הכפתור "שייכו מקצוע להדמיות" באנליטיקה מוביל לכתובת הזאת, והספרייה קוראת את אותו פרמטר.
   טהור (בלי DOM ובלי רשת), כדי שהלוגיקה תיבדק בלי לרנדר.
   ────────────────────────────────────────────────────────────────────────── */

export const LIBRARY_PATH = '/creator/library'
export const LIBRARY_FILTER_PARAM = 'filter'
export const LIBRARY_NOSUBJECT_VALUE = 'nosubject'
export const LIBRARY_NOSUBJECT_HREF = `${LIBRARY_PATH}?${LIBRARY_FILTER_PARAM}=${LIBRARY_NOSUBJECT_VALUE}`

/** האם הכתובת מבקשת את הספרייה המסוננת ל"הדמיות בלי מקצוע" (?filter=nosubject) */
export function wantsNoSubjectFilter(params: Pick<URLSearchParams, 'get'>): boolean {
  return params.get(LIBRARY_FILTER_PARAM) === LIBRARY_NOSUBJECT_VALUE
}

/** פרמטרי כתובת חדשים אחרי הדלקה/כיבוי של הסינון (שאר הפרמטרים נשמרים) */
export function withNoSubjectFilter(params: URLSearchParams, on: boolean): URLSearchParams {
  const next = new URLSearchParams(params)
  if (on) next.set(LIBRARY_FILTER_PARAM, LIBRARY_NOSUBJECT_VALUE)
  else next.delete(LIBRARY_FILTER_PARAM)
  return next
}

/** סינון "הספרייה שלי": שם (חיפוש), מקצוע שנבחר בסרגל הסינון, ו"ללא מקצוע".
    subject = שם המקצוע בעברית או null ("לא סווג"); unclassifiedLabel = התווית של "לא סווג" בסרגל המקצועות. */
export interface MineFilter { query: string; subjects: Record<string, boolean>; onlyNoSubject: boolean; unclassifiedLabel: string }

export function filterMine<Q extends { title: string; subject?: string | null }>(quests: readonly Q[], f: MineFilter): Q[] {
  const q = f.query.trim().toLowerCase()
  const picked = Object.keys(f.subjects).filter((k) => f.subjects[k])
  return quests.filter((it) => {
    if (f.onlyNoSubject && it.subject) return false
    if (picked.length > 0 && !f.subjects[it.subject ?? f.unclassifiedLabel]) return false
    if (q && !it.title.toLowerCase().includes(q)) return false
    return true
  })
}

/** כמה הדמיות עוד לא שויכו למקצוע (המספר שבצ'יפ "ללא מקצוע (N)") */
export const countNoSubject = (quests: readonly { subject?: string | null }[]): number => quests.filter((q) => !q.subject).length
