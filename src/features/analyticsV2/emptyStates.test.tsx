/* מצבי "עוד אין תוצאות" ושגיאות במסכי האנליטיקה אצל מורה אמיתי (עיקרון 9): מרנדרים את המסכים עם נתוני אמת דלים (dataState='insufficient'),
   בלי רשת — useV2 מוחלף בתשובות קבועות. בודקים מה כתוב על המסך, לא איך הוא נראה. */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { V2_CLIENT_TEXT, V2_COVERAGE_TEXT, ERR_ANALYSIS_WARMING, ERR_V2_FORBIDDEN, ERR_V2_NOT_FOUND } from '../../shared/lib/findingsNarrative'
import { LIBRARY_NOSUBJECT_HREF } from '../../shared/lib/libraryLinks'
import type { AnalyticsConfig, ClassOverview, ClassSubjectView, Entry, Roster, StudentOverview } from '../../shared/types/analyticsV2'
import { V2Context } from './context'
import type { V2Env } from './context'
import { V2Error } from './errors'
import type { V2State } from './v2api'

vi.mock('../creator/StudioTopBar', () => ({ default: () => null }))

const h = vi.hoisted(() => ({ responses: {} as Record<string, unknown> }))
vi.mock('./v2api', async (orig) => ({
  ...(await orig<typeof import('./v2api')>()),
  useV2: (path: string | null) => h.responses[path ?? ''] ?? { data: null, dataState: null, loading: true, error: null, reload: () => {} },
}))

import ClassScreen from './ClassScreen'
import EntryScreen from './EntryScreen'
import StudentScreen from './StudentScreen'
import { ErrorBlock } from './ui'

const ok = <T,>(data: T, dataState: 'ok' | 'insufficient' = 'ok'): V2State<T> => ({ data, dataState, loading: false, error: null, reload: () => {} })
const failed = <T,>(error: V2Error): V2State<T> => ({ data: null, dataState: null, loading: false, error, reload: () => {} })

const CFG = { enabled: true, lens: 'subject_teacher', availableLenses: ['subject_teacher'], subjects: [], classes: [], dataNotice: null, curriculumNotice: null } as unknown as AnalyticsConfig
const ENTRY_BASE: Entry = { classes: [], alerts: [], alertsTotal: 0, alertsTitle: 'דורש תשומת לב', alertsMore: null, unclassifiedCount: 0, coverageNote: null }
const subj = (code: string, nameHe: string) => ({ code, nameHe }) as never

const env = (over: Partial<V2Env> = {}): V2Env => ({
  cfg: CFG, lens: 'subject_teacher', guest: false, subject: null, params: {}, href: (p, q = {}) => {
    const s = new URLSearchParams(Object.entries(q).filter(([, v]) => !!v) as [string, string][]).toString()
    return s ? `${p}?${s}` : p
  },
  goLens: () => {}, openBriefing: () => {}, openFeedback: () => {},
  roster: ok<Roster>({ classes: [], students: [] }),
  isHomeroomClass: () => false, canSeePreviousView: false, summary: null, openSummary: () => {}, closeSummary: () => {},
  ...over,
})

const render = (el: React.ReactElement, e: V2Env, url = '/'): string =>
  renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><V2Context.Provider value={e}>{el}</V2Context.Provider></MemoryRouter>)

describe('מסך הכניסה', () => {
  it('כיתה בלי תוצאות: תג ניטרלי "עוד אין תוצאות", לא "אין תלמידים לתשומת לב"', () => {
    h.responses['/entry'] = ok<Entry>({ ...ENTRY_BASE, classes: [{ id: 'c1', name: 'ו׳1', gradeLabel: 'ו׳', studentCount: 24, attentionCount: 0, hasResults: false }] }, 'insufficient')
    const html = render(<EntryScreen />, env())
    expect(html).toContain(V2_CLIENT_TEXT.entry.noResultsBadge)
    expect(html).not.toContain('אין תלמידים לתשומת לב')
    expect(html).toContain('data-class-id="c1"')
  })

  it('אין תוצאות באף כיתה: משפט אחד שאומר מה קורה ומה יקרה', () => {
    h.responses['/entry'] = ok<Entry>({ ...ENTRY_BASE, classes: [{ id: 'c1', name: 'ו׳1', gradeLabel: 'ו׳', studentCount: 24, attentionCount: 0, hasResults: false }] }, 'insufficient')
    expect(render(<EntryScreen />, env())).toContain(V2_CLIENT_TEXT.entry.noResultsAtAll)
  })

  it('כיתה עם תוצאות ובלי התרעות: "אין תלמידים לתשומת לב" נשאר (הדיווח החיובי), ובלי משפט "עוד אין תוצאות"', () => {
    h.responses['/entry'] = ok<Entry>({ ...ENTRY_BASE, classes: [{ id: 'c1', name: 'ו׳1', gradeLabel: 'ו׳', studentCount: 24, attentionCount: 0, hasResults: true }] })
    const html = render(<EntryScreen />, env())
    expect(html).toContain('אין תלמידים לתשומת לב')
    expect(html).not.toContain(V2_CLIENT_TEXT.entry.noResultsAtAll)
  })

  it('מורה בלי כיתות: מצב ריק מלא עם מה לעשות ומה יקרה', () => {
    h.responses['/entry'] = ok<Entry>(ENTRY_BASE, 'insufficient')
    const html = render(<EntryScreen />, env())
    expect(html).toContain('data-empty-state')
    expect(html).toContain(V2_CLIENT_TEXT.entry.noClasses.title)
    expect(html).toContain('בקשו ממנהל/ת בית הספר לשייך אתכם לכיתה')
    expect(html).toContain('התוצאות יופיעו כאן')
  })

  it('שיעורים בלי מקצוע: המשפט מהחוזה + כפתור אל הספרייה', () => {
    h.responses['/entry'] = ok<Entry>({ ...ENTRY_BASE, unclassifiedCount: 3, coverageNote: 'משפט הסבר מהשרת' })
    const html = render(<EntryScreen />, env())
    expect(html).toContain('משפט הסבר מהשרת')
    /* הקישור מוביל לספרייה **מסוננת** ל"הדמיות בלי מקצוע", לא לספרייה כולה */
    expect(html).toContain(`href="${LIBRARY_NOSUBJECT_HREF}"`)
    expect(LIBRARY_NOSUBJECT_HREF).toBe('/creator/library?filter=nosubject')
    expect(html).toContain(V2_CLIENT_TEXT.entry.assignSubjects)
  })

  it('הערת כיסוי שאינה על שיעורים בלי מקצוע (unclassifiedCount=0): המשפט מוצג, בלי כפתור לספרייה (הוא היה מטעה)', () => {
    h.responses['/entry'] = ok<Entry>({ ...ENTRY_BASE, unclassifiedCount: 0, coverageNote: 'לכיתה אחת לא הוגדרה שכבה.' })
    const html = render(<EntryScreen />, env())
    expect(html).toContain('לכיתה אחת לא הוגדרה שכבה.')
    expect(html).not.toContain('/creator/library')
  })

  it('"התצוגה הקודמת": מורה אמיתי רואה משפט וכפתור; אורח/מנהל/ת לא', () => {
    h.responses['/entry'] = ok<Entry>(ENTRY_BASE)
    const real = render(<EntryScreen />, env({ canSeePreviousView: true }))
    expect(real).toContain(V2_CLIENT_TEXT.entry.previousView)
    expect(real).toContain(V2_CLIENT_TEXT.entry.previousViewSentence)
    expect(real).toContain('href="/analytics?view=previous"')
    expect(render(<EntryScreen />, env({ canSeePreviousView: false }))).not.toContain(V2_CLIENT_TEXT.entry.previousView)
  })

  it('שגיאת שרת בכניסה: הודעה בעברית פשוטה לפי הסטטוס, עם "נסו שוב" כשיש טעם', () => {
    h.responses['/entry'] = failed(new V2Error(503, ERR_ANALYSIS_WARMING))
    const html = render(<EntryScreen />, env())
    expect(html).toContain(ERR_ANALYSIS_WARMING)
    expect(html).toContain('נסו שוב')
  })
})

describe('ErrorBlock', () => {
  const block = (e: V2Error, backTo?: string): string => render(<ErrorBlock error={e} onRetry={() => {}} backTo={backTo} />, env())
  it('403: הודעת ההרשאה, בלי "נסו שוב", עם נתיב חזרה', () => {
    const html = block(new V2Error(403, 'Forbidden'), '/analytics')
    expect(html).toContain(ERR_V2_FORBIDDEN)
    expect(html).not.toContain('נסו שוב')
    expect(html).toContain('href="/analytics"')
  })
  it('404: "לא מצאנו", בלי "נסו שוב"', () => {
    const html = block(new V2Error(404, 'לא נמצא'))
    expect(html).toContain(ERR_V2_NOT_FOUND)
    expect(html).not.toContain('נסו שוב')
  })
  it('503 (מרכזים תוצאות): ההודעה כפי שהיא + "נסו שוב"', () => {
    const html = block(new V2Error(503, ERR_ANALYSIS_WARMING))
    expect(html).toContain(ERR_ANALYSIS_WARMING)
    expect(html).toContain('נסו שוב')
  })
})

describe('מסך הכיתה', () => {
  const cls = (over: Partial<Roster['classes'][number]>): Roster['classes'][number] =>
    ({ id: 'c1', name: 'ה׳2', gradeLabel: 'ה׳', grade: 5, studentCount: 20, isHomeroom: false, subjects: [], lockedSubjects: [], ...over })
  const classPage = (c: Roster['classes'][number], e: Partial<V2Env> = {}): string =>
    render(<ClassScreen classId="c1" />, env({ roster: ok<Roster>({ classes: [c], students: [] }), ...e }))
  const selected = (html: string): string | null => /data-tab-id="([^"]+)"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-tab-id="([^"]+)"/.exec(html)?.slice(1).find(Boolean) ?? null

  it('מורה מקצועי בלי מקצוע פתוח: "עוד אין תוצאות במקצוע שלך" ומה יקרה — לא "אין הרשאה"', () => {
    const html = classPage(cls({ subjects: [], lockedSubjects: [subj('math', 'מתמטיקה')] }))
    expect(html).toContain(V2_CLIENT_TEXT.noOpenSubject.title)
    expect(html).toContain(V2_CLIENT_TEXT.noOpenSubject.whatNext)
    expect(html).not.toContain('אין הרשאה')
  })

  it('מורה מעורב: lens=subject_teacher אבל מחנך בכיתה הזאת → "סקירה" פתוחה ונבחרת', () => {
    const html = classPage(cls({ isHomeroom: true, subjects: [subj('math', 'מתמטיקה')] }), { lens: 'subject_teacher' })
    expect(selected(html)).toBe('overview')
  })

  it('מורה מעורב: lens=homeroom אבל מקצועי בכיתה הזאת → "סקירה" חסומה, המקצוע שלו נבחר', () => {
    const html = classPage(cls({ isHomeroom: false, subjects: [subj('history', 'היסטוריה')], lockedSubjects: [subj('math', 'מתמטיקה')] }), { lens: 'homeroom' })
    expect(selected(html)).toBe('history')
    expect(html).toContain('זמין למחנך/ת הכיתה')
  })

  it('כיתה שאינה ברשימה: מצב ריק עם נתיב חזרה', () => {
    const html = render(<ClassScreen classId="nope" />, env({ roster: ok<Roster>({ classes: [], students: [] }) }))
    expect(html).toContain(V2_CLIENT_TEXT.classNotFound.title)
    expect(html).toContain('חזרה לבחירת כיתה')
  })

  it('כשל בטעינת הכיתות: שגיאה בעברית פשוטה, לא "לא מצאנו את הכיתה"', () => {
    const html = render(<ClassScreen classId="c1" />, env({ roster: failed<Roster>(new V2Error(500, '')) }))
    expect(html).toContain('משהו השתבש בטעינת התוצאות')
    expect(html).not.toContain(V2_CLIENT_TEXT.classNotFound.title)
  })
})

/* ── G2: כרטיס כיתה (מילת פעולה + תפקיד), "ועוד N", "התצוגה הקודמת", הערת כיסוי ── */
const rcls = (over: Partial<Roster['classes'][number]>): Roster['classes'][number] =>
  ({ id: 'c1', name: 'ו׳1', gradeLabel: 'ו׳', grade: 6, studentCount: 24, isHomeroom: false, subjects: [], lockedSubjects: [], ...over })
const eclass = (over: Partial<Entry['classes'][number]> = {}): Entry['classes'][number] =>
  ({ id: 'c1', name: 'ו׳1', gradeLabel: 'ו׳', studentCount: 24, attentionCount: 0, hasResults: true, ...over })
const entryPage = (entry: Partial<Entry>, classes: Roster['classes'], e: Partial<V2Env> = {}): string => {
  h.responses['/entry'] = ok<Entry>({ ...ENTRY_BASE, ...entry })
  return render(<EntryScreen />, env({ roster: ok<Roster>({ classes, students: [] }), ...e }))
}
/* הטקסט שבתוך אלמנט עם attribute נתון */
const textOf = (html: string, attr: string): string[] => [...html.matchAll(new RegExp(`<[a-z]+ [^>]*${attr}[^>]*>([\\s\\S]*?)</(?:span|div|p)>`, 'g'))].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('מסך הכניסה — כרטיס כיתה: מילת פעולה גלויה ותפקיד', () => {
  it('מחנך: "לסקירת הכיתה" בכותרת הכרטיס (עם קו תחתון וחץ) ותג "מחנך/ת"', () => {
    const html = entryPage({ classes: [eclass()] }, [rcls({ isHomeroom: true, subjects: [subj('math', 'מתמטיקה'), subj('hebrew', 'עברית')] })])
    expect(textOf(html, 'data-choice-action')).toEqual([V2_CLIENT_TEXT.entry.openClassHomeroom])
    expect(html).toMatch(/data-choice-action[^>]*text-decoration:underline/)
    expect(textOf(html, 'data-class-role')).toEqual([V2_CLIENT_TEXT.entry.roleHomeroom])
  })

  it('מורה מקצוע: "לתוצאות הכיתה" ותג "מורה מקצוע: מתמטיקה"', () => {
    const html = entryPage({ classes: [eclass()] }, [rcls({ subjects: [subj('math', 'מתמטיקה')] })])
    expect(textOf(html, 'data-choice-action')).toEqual([V2_CLIENT_TEXT.entry.openClassSubject])
    expect(textOf(html, 'data-class-role')).toEqual(['מורה מקצוע: מתמטיקה'])
  })

  it('מורה מעורב (מחנכת בכיתה אחת, מורה מקצועית בשנייה): ההבדל גלוי בכרטיסים לפני הלחיצה', () => {
    const html = entryPage({ classes: [eclass({ id: 'c1', name: 'ו׳1' }), eclass({ id: 'c2', name: 'ה׳2' })] }, [
      rcls({ id: 'c1', name: 'ו׳1', isHomeroom: true, subjects: [subj('math', 'מתמטיקה')] }),
      rcls({ id: 'c2', name: 'ה׳2', subjects: [subj('history', 'היסטוריה')], lockedSubjects: [subj('math', 'מתמטיקה')] }),
    ])
    expect(textOf(html, 'data-class-role')).toEqual(['מחנך/ת', 'מורה מקצוע: היסטוריה'])
    expect(textOf(html, 'data-choice-action')).toEqual([V2_CLIENT_TEXT.entry.openClassHomeroom, V2_CLIENT_TEXT.entry.openClassSubject])
  })

  it('כמה מקצועות למורה מקצועי: מופרדים בפסיק, בסדר הקבוע של המערכת (עברית לפני מתמטיקה); בלי מקצוע פתוח — אין תג תפקיד', () => {
    expect(textOf(entryPage({ classes: [eclass()] }, [rcls({ subjects: [subj('math', 'מתמטיקה'), subj('hebrew', 'עברית')] })]), 'data-class-role')).toEqual(['מורה מקצוע: עברית, מתמטיקה'])
    expect(textOf(entryPage({ classes: [eclass()] }, [rcls({})]), 'data-class-role')).toEqual([])
  })

  it('מילת הפעולה והתפקיד בלי אימוג׳י, והכותרת היא קישור אמיתי', () => {
    const html = entryPage({ classes: [eclass()] }, [rcls({ isHomeroom: true, subjects: [subj('math', 'מתמטיקה')] })])
    /* אייקוני המקצועות הקיימים (כדורי המקצוע) הם סימנים גרפיים של המערכת; הבדיקה היא על מה שנוסף כאן: מילת הפעולה והתפקיד */
    for (const t of [...textOf(html, 'data-choice-action'), ...textOf(html, 'data-class-role')]) expect(/\p{Extended_Pictographic}/u.test(t), t).toBe(false)
    expect(html).toContain('href="/analytics/class/c1"')
  })
})

describe('מסך הכניסה — "ועוד N תלמידים בכיתה"', () => {
  const alert = { studentId: 's1', studentName: 'נועה כהן', classId: 'c1', className: 'ו׳1', text: 'משפט התרעה.' }
  it('כשכל ההמשך בכיתה אחת: קישור "לכל התלמידים בכיתה" אל טאב התלמידים של המקצוע הראשון שלה', () => {
    const html = entryPage({ classes: [eclass({ attentionCount: 4 })], alerts: [alert], alertsTotal: 4, alertsMore: 'ועוד 3 תלמידים בכיתה' },
      [rcls({ subjects: [subj('math', 'מתמטיקה')] })])
    expect(html).toContain('ועוד 3 תלמידים בכיתה')
    const m = /<a [^>]*href="([^"]+)"[^>]*>לכל התלמידים בכיתה/.exec(html)
    expect(m, 'קישור "לכל התלמידים בכיתה"').not.toBeNull()
    expect(m![1]).toBe('/analytics/class/c1?tab=math&amp;sub=students')
  })

  it('כשההמשך פזור על כמה כיתות: הטקסט נשאר, בלי קישור (אין יעד אחד שמתאים)', () => {
    const html = entryPage({ classes: [eclass({ id: 'c1', attentionCount: 2 }), eclass({ id: 'c2', name: 'ה׳2', attentionCount: 3 })], alerts: [alert], alertsTotal: 5, alertsMore: 'ועוד 4 תלמידים בכיתות' },
      [rcls({ id: 'c1' }), rcls({ id: 'c2', name: 'ה׳2' })])
    expect(html).toContain('ועוד 4 תלמידים בכיתות')
    expect(html).not.toContain(V2_CLIENT_TEXT.entry.seeAllStudents)
  })
})

describe('מסך הכניסה — "גרף ההתקדמות הכללי (התצוגה הקודמת)"', () => {
  const rowAt = (html: string): number => html.indexOf('data-previous-view-row')
  it('אין תוצאות באף כיתה: כפתור גלוי בראש המסך (לפני כרטיסי הכיתות), עם מילים', () => {
    const html = entryPage({ classes: [eclass({ hasResults: false })] }, [rcls({})], { canSeePreviousView: true })
    expect(rowAt(html)).toBeGreaterThan(-1)
    expect(rowAt(html)).toBeLessThan(html.indexOf('data-class-id'))
    expect(html).toContain('href="/analytics?view=previous"')
    expect(html).toContain('גרף ההתקדמות הכללי (התצוגה הקודמת)')
    /* בראש המסך המשפט אומר שזה מה שאפשר לראות בינתיים */
    expect(html).toContain(V2_CLIENT_TEXT.entry.previousViewSentenceTop)
    expect(html).not.toContain(V2_CLIENT_TEXT.entry.previousViewSentence)
    expect((html.match(/data-previous-view-row/g) ?? []).length, 'מופיע פעם אחת בלבד').toBe(1)
  })

  it('יש תוצאות: בתחתית המסך, אחרי כרטיסי הכיתות', () => {
    const html = entryPage({ classes: [eclass({ hasResults: true })] }, [rcls({})], { canSeePreviousView: true })
    expect(rowAt(html)).toBeGreaterThan(html.indexOf('data-class-id'))
    expect(html).toContain(V2_CLIENT_TEXT.entry.previousViewSentence)
    expect((html.match(/data-previous-view-row/g) ?? []).length).toBe(1)
  })

  it('כיתה אחת עם תוצאות מבין כמה: עדיין בתחתית (הראשי הוא החדש)', () => {
    const html = entryPage({ classes: [eclass({ id: 'c1', hasResults: false }), eclass({ id: 'c2', name: 'ה׳2', hasResults: true })] }, [rcls({ id: 'c1' }), rcls({ id: 'c2', name: 'ה׳2' })], { canSeePreviousView: true })
    expect(rowAt(html)).toBeGreaterThan(html.lastIndexOf('data-class-id'))
  })

  it('מורה בלי כיתות: המצב הריק הוא הראשי והכפתור בתחתית; אורח/מנהל/ת — לא מוצג בכלל', () => {
    const none = entryPage({ classes: [] }, [], { canSeePreviousView: true })
    expect(rowAt(none)).toBeGreaterThan(none.indexOf('data-empty-state'))
    expect(entryPage({ classes: [eclass({ hasResults: false })] }, [rcls({})], { canSeePreviousView: false })).not.toContain('data-previous-view-row')
  })
})

describe('הערת כיסוי במסכי כיתה / מקצוע / תלמיד/ה', () => {
  const NOTE = 'שני משחקים בשיעורים שעוד לא שויך להם מקצוע לא נכללו כאן.'
  const withNote = <T,>(d: T, note: string | null | undefined): T => ({ ...d, coverageNote: note })
  const overview = (rows: ClassOverview['rows']): ClassOverview => ({
    class: { id: 'c1', name: 'ה׳2', gradeLabel: 'ה׳', studentCount: 20 }, summary: 'משפט סיכום.', rows,
    caveats: { ageNorm: 'א', crossSubject: 'ב', trend: 'ג' },
  })
  const homeroom = (): Roster['classes'][number] => rcls({ id: 'c1', name: 'ה׳2', isHomeroom: true, subjects: [subj('math', 'מתמטיקה')] })
  const classPage = (url: string): string => render(<ClassScreen classId="c1" />, env({ roster: ok<Roster>({ classes: [homeroom()], students: [] }), isHomeroomClass: () => true }), url)

  it('סקירת כיתה ריקה עם הערה: ההערה + כפתור לספרייה המסוננת מעל, והמצב הריק לא מבטיח "כשישחקו" בלי להזכיר אותה', () => {
    h.responses['/class/c1/overview'] = ok(withNote(overview([]), NOTE), 'insufficient')
    const html = classPage('/analytics/class/c1')
    expect(html).toContain('data-coverage-note')
    expect(html).toContain(NOTE)
    expect(html).toContain(`href="${LIBRARY_NOSUBJECT_HREF}"`)
    expect(html.indexOf('data-coverage-note')).toBeLessThan(html.indexOf('data-empty-state'))
    expect(html).toContain(V2_COVERAGE_TEXT.emptyHint)
    expect(html).toContain(V2_COVERAGE_TEXT.classOverviewEmpty.whatNext)
  })

  it('בלי הערה (null או חסר): אין כרטיס, אין כפתור, ואין משפט "ראו ההסבר למעלה"', () => {
    for (const note of [null, undefined]) {
      h.responses['/class/c1/overview'] = ok(withNote(overview([]), note), 'insufficient')
      const html = classPage('/analytics/class/c1')
      expect(html).not.toContain('data-coverage-note')
      expect(html).not.toContain(V2_COVERAGE_TEXT.emptyHint)
      expect(html).not.toContain('/creator/library')
    }
  })

  it('מקצוע בכיתה (טאב תלמידים ריק): ההערה מעל המצב הריק', () => {
    const view = withNote({
      class: { id: 'c1', name: 'ה׳2', gradeLabel: 'ה׳', studentCount: 20 }, subject: { code: 'math', nameHe: 'מתמטיקה' }, students: [],
      tabSummaries: { misconceptions: 'ט', progress: 'ה', students: 'עוד אין תלמידים להצגה.' }, studentFindings: [],
    } as unknown as ClassSubjectView, NOTE)
    h.responses['/class/c1/subject/math'] = ok(view, 'insufficient')
    const html = classPage('/analytics/class/c1?tab=math&sub=students')
    expect(html).toContain(NOTE)
    expect(html).toContain(`href="${LIBRARY_NOSUBJECT_HREF}"`)
    expect(html).toContain(V2_COVERAGE_TEXT.emptyHint)
  })

  it('תלמיד/ה בלי פאנלים: ההערה מעל המצב הריק (שמזכיר שייתכן שהשיעורים לא היו משויכים למקצוע)', () => {
    const st = { student: { id: 's1', displayName: 'נועה כהן', classId: 'c1', className: 'ה׳2', grade: 5, gradeLabel: 'ה׳' }, summary: 'ס', access: 'full', panels: [], crossSubject: [], caveats: { ageNorm: 'א', crossSubject: 'ב', trend: 'ג' } } as StudentOverview
    h.responses['/student/s1'] = ok(withNote(st, NOTE), 'insufficient')
    const html = render(<StudentScreen studentId="s1" />, env(), '/analytics/student/s1?class=c1')
    expect(html).toContain(NOTE)
    expect(html).toContain(`href="${LIBRARY_NOSUBJECT_HREF}"`)
    expect(html).toContain(V2_COVERAGE_TEXT.emptyHint)
  })
})
