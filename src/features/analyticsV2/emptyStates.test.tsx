/* מצבי "עוד אין תוצאות" ושגיאות במסכי האנליטיקה אצל מורה אמיתי (עיקרון 9): מרנדרים את המסכים עם נתוני אמת דלים (dataState='insufficient'),
   בלי רשת — useV2 מוחלף בתשובות קבועות. בודקים מה כתוב על המסך, לא איך הוא נראה. */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { V2_CLIENT_TEXT, ERR_ANALYSIS_WARMING, ERR_V2_FORBIDDEN, ERR_V2_NOT_FOUND } from '../../shared/lib/findingsNarrative'
import type { AnalyticsConfig, Entry, Roster } from '../../shared/types/analyticsV2'
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

const render = (el: React.ReactElement, e: V2Env): string =>
  renderToStaticMarkup(<MemoryRouter><V2Context.Provider value={e}>{el}</V2Context.Provider></MemoryRouter>)

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

  it('הדמיות בלי מקצוע: המשפט מהחוזה + כפתור אל הספרייה', () => {
    h.responses['/entry'] = ok<Entry>({ ...ENTRY_BASE, unclassifiedCount: 3, coverageNote: 'משפט הסבר מהשרת' })
    const html = render(<EntryScreen />, env())
    expect(html).toContain('משפט הסבר מהשרת')
    expect(html).toContain('href="/creator/library"')
    expect(html).toContain(V2_CLIENT_TEXT.entry.assignSubjects)
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
    expect(html).toContain('הן יופיעו כאן כשתלמידי הכיתה יסיימו הדמיות במקצוע שלך')
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
