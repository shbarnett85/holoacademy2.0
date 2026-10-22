import { describe, expect, it } from 'vitest'
import { LIBRARY_NOSUBJECT_HREF, countNoSubject, filterMine, wantsNoSubjectFilter, withNoSubjectFilter } from './libraryLinks'

/* הקישור מהאנליטיקה לספרייה המסוננת ל"הדמיות בלי מקצוע", והסינון של "הספרייה שלי" — לוגיקה טהורה */

const Q = [
  { id: 'a', title: 'צף או שוקע?', subject: 'מדעים' },
  { id: 'b', title: 'המהפכה הצרפתית', subject: 'היסטוריה' },
  { id: 'c', title: 'שברים בפיצה', subject: null },
  { id: 'd', title: 'מסע טיפת המים', subject: undefined },
]
const F = { query: '', subjects: {}, onlyNoSubject: false, unclassifiedLabel: 'לא סווג' }

describe('הכתובת של הספרייה המסוננת', () => {
  it('מובילה ל-/creator/library עם filter=nosubject', () => {
    expect(LIBRARY_NOSUBJECT_HREF).toBe('/creator/library?filter=nosubject')
  })

  it('wantsNoSubjectFilter: רק הערך nosubject; ערך אחר או חסר — לא', () => {
    expect(wantsNoSubjectFilter(new URLSearchParams('filter=nosubject'))).toBe(true)
    expect(wantsNoSubjectFilter(new URLSearchParams('filter=other'))).toBe(false)
    expect(wantsNoSubjectFilter(new URLSearchParams(''))).toBe(false)
    expect(wantsNoSubjectFilter(new URLSearchParams(LIBRARY_NOSUBJECT_HREF.split('?')[1]))).toBe(true)
  })

  it('withNoSubjectFilter: מדליק/מכבה את הפרמטר ושומר פרמטרים אחרים, בלי לשנות את המקור', () => {
    const base = new URLSearchParams('x=1')
    expect(withNoSubjectFilter(base, true).toString()).toBe('x=1&filter=nosubject')
    expect(withNoSubjectFilter(new URLSearchParams('x=1&filter=nosubject'), false).toString()).toBe('x=1')
    expect(base.toString()).toBe('x=1')
  })
})

describe('"הספרייה שלי": ספירה וסינון', () => {
  it('countNoSubject: כמה הדמיות עוד לא שויכו למקצוע (null וחסר נספרים; מקצוע בעברית — לא)', () => {
    expect(countNoSubject(Q)).toBe(2)
    expect(countNoSubject([])).toBe(0)
  })

  it('בלי סינון: הכול, בסדר המקורי', () => {
    expect(filterMine(Q, F).map((q) => q.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ללא מקצוע: רק הדמיות בלי מקצוע', () => {
    expect(filterMine(Q, { ...F, onlyNoSubject: true }).map((q) => q.id)).toEqual(['c', 'd'])
  })

  it('מקצוע שנבחר בסרגל הסינון מסנן גם את "הספרייה שלי"; "לא סווג" מתאים להדמיות בלי מקצוע', () => {
    expect(filterMine(Q, { ...F, subjects: { מדעים: true } }).map((q) => q.id)).toEqual(['a'])
    expect(filterMine(Q, { ...F, subjects: { מדעים: true, היסטוריה: true } }).map((q) => q.id)).toEqual(['a', 'b'])
    expect(filterMine(Q, { ...F, subjects: { 'לא סווג': true } }).map((q) => q.id)).toEqual(['c', 'd'])
  })

  it('מקצוע שכובה (false) אינו מסנן', () => {
    expect(filterMine(Q, { ...F, subjects: { מדעים: false } }).map((q) => q.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('חיפוש לפי שם משתלב עם ללא-מקצוע ועם מקצוע (וגם)', () => {
    expect(filterMine(Q, { ...F, query: ' מים ' }).map((q) => q.id)).toEqual(['d'])
    expect(filterMine(Q, { ...F, query: 'שברים', onlyNoSubject: true }).map((q) => q.id)).toEqual(['c'])
    expect(filterMine(Q, { ...F, query: 'שברים', subjects: { מדעים: true } })).toEqual([])
  })
})
