/* תוכן ההדמיות עוד לא תויג (catalogReady=false) ושדות "אמת במצבים ריקים" של החוזה: מה נראה על המסך ומה לא.
   מרנדרים את המסכים עם נתוני אמת דלים, בלי רשת — useV2 מוחלף בתשובות קבועות. בודקים מה כתוב ומה חסר, לא איך זה נראה. */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CATALOG_UNTAGGED_TEXT, V2_CLIENT_TEXT, V2_UNTAGGED_TEXT, narrateAdminHiddenNote, narrateGradeSize } from '../../shared/lib/findingsNarrative'
import type { AdminOverview, AnalyticsConfig, ClassOverview, ClassSubjectView, Entry, Roster, StudentOverview } from '../../shared/types/analyticsV2'
import { V2Context } from './context'
import type { V2Env } from './context'
import { catalogEmptyOf, catalogNoteOf } from './catalog'
import type { V2State } from './v2api'

vi.mock('../creator/StudioTopBar', () => ({ default: () => null }))

const h = vi.hoisted(() => ({ responses: {} as Record<string, unknown> }))
vi.mock('./v2api', async (orig) => ({
  ...(await orig<typeof import('./v2api')>()),
  useV2: (path: string | null) => h.responses[path ?? ''] ?? { data: null, dataState: null, loading: true, error: null, reload: () => {} },
}))

import AdminScreen from './AdminScreen'
import ClassScreen from './ClassScreen'
import EntryScreen from './EntryScreen'
import StudentScreen from './StudentScreen'

const ok = <T,>(data: T, dataState: 'ok' | 'insufficient' = 'ok'): V2State<T> => ({ data, dataState, loading: false, error: null, reload: () => {} })
const CFG = { enabled: true, lens: 'homeroom', availableLenses: ['homeroom'], subjects: [], classes: [], dataNotice: null, curriculumNotice: null } as unknown as AnalyticsConfig
const subj = (code: string, nameHe: string) => ({ code, nameHe }) as never
const env = (over: Partial<V2Env> = {}): V2Env => ({
  cfg: CFG, lens: 'homeroom', guest: false, subject: null, params: {}, href: (p, q = {}) => {
    const s = new URLSearchParams(Object.entries(q).filter(([, v]) => !!v) as [string, string][]).toString()
    return s ? `${p}?${s}` : p
  },
  goLens: () => {}, openBriefing: () => {}, openFeedback: () => {},
  roster: ok<Roster>({ classes: [], students: [] }),
  isHomeroomClass: () => true, canSeePreviousView: false, summary: null, openSummary: () => {}, closeSummary: () => {},
  ...over,
})
const render = (el: React.ReactElement, e: V2Env, url = '/'): string =>
  renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><V2Context.Provider value={e}>{el}</V2Context.Provider></MemoryRouter>)
const text = (html: string): string => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const UNTAGGED = { catalogReady: false, catalogNote: CATALOG_UNTAGGED_TEXT.note } as const
const homeroom = (): Roster['classes'][number] => ({ id: 'c1', name: 'ה׳2', gradeLabel: 'ה׳', grade: 5, studentCount: 20, isHomeroom: true, subjects: [subj('math', 'מתמטיקה'), subj('hebrew', 'עברית')], lockedSubjects: [] })
const classPage = (url: string): string => render(<ClassScreen classId="c1" />, env({ roster: ok<Roster>({ classes: [homeroom()], students: [] }) }), url)

const AGE = { gradeLabel: 'ה׳', center: 10, low: 8.5, high: 11.5 }
const row = (code: string, nameHe: string): ClassOverview['rows'][number] => ({
  subject: subj(code, nameHe), level: 9.7, ageNorm: AGE, positionVsNorm: 'within', positionText: 'בתוך הטווח המיועד', trend: 'steady', trendText: 'יציבה',
  strongAreas: [], challengingAreas: [], alerts: 0, alertTexts: [],
})
const overview = (over: Partial<ClassOverview> = {}): ClassOverview => ({
  class: { id: 'c1', name: 'ה׳2', gradeLabel: 'ה׳', studentCount: 20 }, summary: 'משפט סיכום.', rows: [row('math', 'מתמטיקה'), row('hebrew', 'עברית')],
  caveats: { ageNorm: 'הטווח להקשר בלבד.', crossSubject: 'אין להשוות בין מקצועות.', trend: 'ג' }, ...over,
})

describe('catalog.ts — הלוגיקה הטהורה', () => {
  it('catalogEmptyOf: רק catalogReady=false; חסר / true / null — כרגיל', () => {
    expect(catalogEmptyOf({ catalogReady: false })).toBe(true)
    expect(catalogEmptyOf({ catalogReady: true })).toBe(false)
    expect(catalogEmptyOf({})).toBe(false)
    expect(catalogEmptyOf(null)).toBe(false)
    expect(catalogEmptyOf(undefined)).toBe(false)
  })
  it('catalogNoteOf: המשפט מהחוזה, ובלעדיו הנוסח הכללי', () => {
    expect(catalogNoteOf({ catalogNote: 'משפט מהשרת' })).toBe('משפט מהשרת')
    expect(catalogNoteOf({ catalogNote: null })).toBe(CATALOG_UNTAGGED_TEXT.note)
    expect(catalogNoteOf({})).toBe(CATALOG_UNTAGGED_TEXT.note)
  })
})

describe('סקירת כיתה — תוכן שעוד לא תויג', () => {
  it('עמודות "תחומים חזקים/מאתגרים" לא מוצגות (היו "—" תמיד), ומשפט אחד אומר למה; שאר העמודות נשארות', () => {
    h.responses['/class/c1/overview'] = ok(overview(UNTAGGED))
    const html = classPage('/analytics/class/c1')
    expect(html).not.toContain('>תחומים חזקים</th>')
    expect(html).not.toContain('>תחומים מאתגרים</th>')
    expect(html).toContain('data-catalog-note')
    expect(text(html)).toContain(CATALOG_UNTAGGED_TEXT.note)
    /* מה שכן נמדד נשאר: מקצוע, רמה, מיקום מול הטווח, מגמה, תשומת לב */
    for (const w of ['מקצוע', 'רמה', 'מול הטווח המיועד', 'מגמה', 'לתשומת לב']) expect(html, w).toContain(`>${w}</th>`)
    /* ואין הסבר "מקף אומר…" — אין עמודות עם מקפים */
    expect(html).not.toContain(V2_CLIENT_TEXT.areasDash)
  })

  it('קטלוג פעיל (או שדה חסר): העמודות מוצגות, בלי משפט תיוג', () => {
    for (const extra of [{ catalogReady: true }, {}]) {
      h.responses['/class/c1/overview'] = ok(overview(extra))
      const html = classPage('/analytics/class/c1')
      expect(html).toContain('>תחומים חזקים</th>')
      expect(html).toContain('>תחומים מאתגרים</th>')
      expect(html).not.toContain('data-catalog-note')
    }
  })
})

describe('מקצוע בכיתה — "טעויות נפוצות" לא פעיל בחשבון', () => {
  const view = (over: Partial<ClassSubjectView> = {}): ClassSubjectView => ({
    class: { id: 'c1', name: 'ה׳2', gradeLabel: 'ה׳', studentCount: 20 }, subject: subj('math', 'מתמטיקה'), classLevel: { mean: 9.7, ageNorm: AGE },
    summary: { headline: 'הכותרת.', recent: [], whatToTeach: [] },
    tabSummaries: { misconceptions: CATALOG_UNTAGGED_TEXT.errorsTabSummary, progress: 'ה', students: 'ט' },
    misconceptions: [], recommendations: [], progress: { series: [], ageNorm: AGE, events: [] }, classFindings: [], studentFindings: [], students: [],
    trend: 'steady', trendText: 'יציבה', otherSubjects: [], caveats: { ageNorm: 'א', crossSubject: 'ב', trend: 'ג' }, ...over,
  } as ClassSubjectView)
  const tabs = (html: string): { id: string; locked: boolean; reason: string }[] =>
    [...html.matchAll(/<button\b[^>]*data-tab-id="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)]
      .filter((m) => /id="sub-tab-/.test(m[0]))
      .map((m) => ({ id: m[1], locked: /aria-disabled="true"/.test(m[0]), reason: text(m[2]) }))

  it('הטאב "טעויות נפוצות" אפור עם מנעול והסיבה גלויה בתוכו; שלושת האחרים פעילים', () => {
    h.responses['/class/c1/subject/math'] = ok(view(UNTAGGED))
    const t = tabs(classPage('/analytics/class/c1?tab=math&sub=summary'))
    expect(t.map((x) => x.id)).toEqual(['summary', 'errors', 'progress', 'students'])
    expect(t.map((x) => x.locked)).toEqual([false, true, false, false])
    expect(t[1].reason).toContain(V2_UNTAGGED_TEXT.tabLockedReason)
    expect(t[1].reason).toContain('טעויות נפוצות')
  })

  it('קטלוג פעיל: אף טאב לא חסום', () => {
    h.responses['/class/c1/subject/math'] = ok(view({ catalogReady: true }))
    expect(tabs(classPage('/analytics/class/c1?tab=math&sub=summary')).every((x) => !x.locked)).toBe(true)
  })

  it('טאב "סיכום": במקום "יופיעו כשיצטברו תשובות" — ההמלצות לא פעילות בחשבון (בלי הבטחה)', () => {
    h.responses['/class/c1/subject/math'] = ok(view(UNTAGGED))
    const html = classPage('/analytics/class/c1?tab=math&sub=summary')
    expect(text(html)).toContain(CATALOG_UNTAGGED_TEXT.whatToTeach)
    expect(text(html)).not.toContain('הן יופיעו כאן כשיצטברו מספיק תשובות')
  })

  it('הגעה לטאב בכתובת: משפט הסיכום והסבר אחד — לא אותו משפט פעמיים', () => {
    h.responses['/class/c1/subject/math'] = ok(view(UNTAGGED))
    const html = classPage('/analytics/class/c1?tab=math&sub=errors')
    expect(text(html)).toContain(CATALOG_UNTAGGED_TEXT.errorsTabSummary)
    expect(text(html)).toContain(CATALOG_UNTAGGED_TEXT.errorsEmpty.whatNext)
    expect(text(html).split(CATALOG_UNTAGGED_TEXT.errorsEmpty.title).length - 1, 'הכותרת של מצב-הריק הכפול לא מוצגת בנוסף למשפט הסיכום').toBe(0)
    expect(html).not.toContain('data-empty-state')
  })
})

describe('תלמיד/ה — תוכן שעוד לא תויג', () => {
  const panel = (code: string, nameHe: string) => ({
    access: 'visible', subject: subj(code, nameHe), currentLevel: 9.7, levelSeries: [], ageNorm: AGE, positionVsNorm: 'within', positionText: 'בתוך הטווח המיועד',
    trend: 'insufficient', trendText: 'אין עדיין מספיק נתונים', areas: { strong: [], challenging: [] }, commonErrors: [], sessionsCount: 6, contentVectors: [], behaviorVectors: [], findings: [],
  })
  const student = (over: Partial<StudentOverview> = {}): StudentOverview => ({
    student: { id: 's1', displayName: 'נועה כהן', classId: 'c1', className: 'ה׳2', grade: 5, gradeLabel: 'ה׳' }, summary: 'ס', access: 'full',
    panels: [panel('math', 'מתמטיקה')], crossSubject: [], caveats: { ageNorm: 'א', crossSubject: 'ב', trend: 'ג' }, ...over,
  } as StudentOverview)
  const page = (url: string): string => render(<StudentScreen studentId="s1" />, env(), url)

  it('סקירה: בלי עמודות תחומים, עם משפט אחד', () => {
    h.responses['/student/s1'] = ok(student(UNTAGGED))
    const html = page('/analytics/student/s1?class=c1&tab=overview')
    expect(html).not.toContain('>תחומים חזקים</th>')
    expect(text(html)).toContain(CATALOG_UNTAGGED_TEXT.note)
  })

  it('מקצוע: כרטיס אחד "תחומים וטעויות נפוצות" עם המשפט — במקום שני כרטיסים ריקים שמבטיחים', () => {
    h.responses['/student/s1'] = ok(student(UNTAGGED))
    const html = page('/analytics/student/s1?class=c1&tab=math')
    expect(html).toContain(`aria-label="${V2_UNTAGGED_TEXT.cardTitle}"`)
    expect(text(html)).toContain(CATALOG_UNTAGGED_TEXT.note)
    expect(html).not.toContain('aria-label="תחומים"')
    expect(text(html)).not.toContain('הן יופיעו כאן כשיצטברו מספיק תשובות')
  })

  it('קטלוג פעיל: שני הכרטיסים כרגיל', () => {
    h.responses['/student/s1'] = ok(student())
    const html = page('/analytics/student/s1?class=c1&tab=math')
    expect(html).toContain('aria-label="תחומים"')
    expect(html).toContain('aria-label="טעויות נפוצות"')
    expect(html).not.toContain('data-catalog-note')
  })
})

describe('מסך הכניסה — שדות החוזה החדשים', () => {
  const ENTRY_BASE: Entry = { classes: [], alerts: [], alertsTotal: 0, alertsTitle: 'דורש תשומת לב', alertsMore: null, unclassifiedCount: 0, coverageNote: null }
  const ecls = (over: Partial<Entry['classes'][number]> = {}): Entry['classes'][number] => ({ id: 'c1', name: 'ו׳1', gradeLabel: 'ו׳', studentCount: 24, attentionCount: 0, hasResults: true, ...over })
  const page = (cls: Entry['classes'][number]): string => {
    h.responses['/entry'] = ok<Entry>({ ...ENTRY_BASE, classes: [cls] })
    return render(<EntryScreen />, env({ roster: ok<Roster>({ classes: [{ ...homeroom(), id: 'c1', name: 'ו׳1', isHomeroom: false, subjects: [] }], students: [] }) }))
  }
  const badge = (html: string): string => text(/<a [^>]*data-tu-press[^>]*href="\/analytics\/class\/c1"[\s\S]*?<\/a>/.exec(html)?.[0] ?? '')

  it('שיוך בלי מקצוע פתוח: "המקצוע שלכם עוד לא הוגדר" (לא "עוד אין תוצאות"), עם גודל הכיתה', () => {
    const b = badge(page(ecls({ noOpenSubject: true, hasResults: false, studentCount: 14 })))
    expect(b).toContain(V2_CLIENT_TEXT.entry.noOpenSubjectBadge)
    expect(b).not.toContain(V2_CLIENT_TEXT.entry.noResultsBadge)
    expect(b).toContain('14 תלמידים')
  })

  it('יש תוצאות אבל אין בסיס (basisNote): המשפט הניטרלי מהחוזה, ולא וי ירוק "אין תלמידים לתשומת לב"', () => {
    const b = badge(page(ecls({ basisNote: 'נתונים על 1 מתוך 3 תלמידים — עוד מוקדם לדעת.' })))
    expect(b).toContain('נתונים על 1 מתוך 3 תלמידים — עוד מוקדם לדעת.')
    expect(b).not.toContain('אין תלמידים לתשומת לב')
  })

  it('יש בסיס (בלי basisNote): "אין תלמידים לתשומת לב" כרגיל; יש תלמידים לתשומת לב — המספר, גם אם יש basisNote', () => {
    expect(badge(page(ecls()))).toContain('אין תלמידים לתשומת לב')
    const b = badge(page(ecls({ attentionCount: 2, basisNote: 'לא אמור להופיע' })))
    expect(b).toContain('2 תלמידים לתשומת לב')
    expect(b).not.toContain('לא אמור להופיע')
  })
})

describe('מנהל/ת — שדות החוזה החדשים', () => {
  const grade = { grade: 6, gradeLabel: 'ו׳', classCount: 1, studentCount: 6 }
  const admin = (over: Partial<AdminOverview> = {}): AdminOverview => ({
    school: { id: 'sc', name: 'בית ספר' }, highlights: ['משפט.'], grades: [grade], gradeRows: [{ ...grade, summary: 'סיכום שכבה.', cells: [] }], subjectRows: [], cells: [], progress: [], comparisons: [],
    misconceptions: [], hiddenCells: 0, caveats: { ageNorm: 'א', crossSubject: 'ב', trend: 'ג' }, ...over,
  } as AdminOverview)
  const page = (d: AdminOverview, tab = 'overview'): string => {
    h.responses['/admin/overview'] = ok(d)
    return render(<AdminScreen />, env({ lens: 'admin' }), `/analytics?tab=${tab}`)
  }

  it('גודל שכבה: הנוסח מהחוזה ("כיתה אחת · 6 תלמידים"), ובשרת ישן — אותה פונקציה משותפת; לעולם לא "1 כיתות"', () => {
    const html = page(admin({ grades: [{ ...grade, sizeText: narrateGradeSize(1, 6) }] }))
    expect(text(html)).toContain('שכבה ו׳: כיתה אחת · 6 תלמידים')
    const old = page(admin())
    expect(text(old)).toContain('שכבה ו׳: כיתה אחת · 6 תלמידים')
    expect(text(old)).not.toMatch(/1 כיתות/)
    expect(text(page(admin(), 'grades'))).toContain('כיתה אחת · 6 תלמידים')
  })

  it('נתונים מוסתרים: "N נתונים לא מוצגים…" (בלי "תא"), מהחוזה או — בשרת ישן — מאותה פונקציה', () => {
    const html = text(page(admin({ hiddenCells: 2, hiddenNote: narrateAdminHiddenNote(2) })))
    expect(html).toContain('2 נתונים לא מוצגים כי יש בהם מעט תלמידים או כיתה אחת בלבד.')
    expect(html).not.toMatch(/תאים|תא /)
    expect(text(page(admin({ hiddenCells: 1 })))).toContain('נתון אחד לא מוצג')
    expect(text(page(admin({ hiddenCells: 0 })))).not.toContain('לא מוצג')
  })

  it('הערת כיסוי של בית הספר (משחקים בהדמיות בלי מקצוע): מוצגת, בלי כפתור לספרייה', () => {
    const html = page(admin({ coverageNote: 'כמה משחקים בהדמיות שעוד לא שויך להן מקצוע לא נכללו בתוצאות.' }))
    expect(html).toContain('data-coverage-note')
    expect(text(html)).toContain('כמה משחקים בהדמיות שעוד לא שויך להן מקצוע')
    expect(html).not.toContain('/creator/library')
  })

  it('תוכן שעוד לא תויג: הטאב "טעויות נפוצות" אפור עם מנעול והסיבה; בכתובת — "עדיין לא פעילות בחשבון שלכם" בלי "כשיצטברו תשובות"', () => {
    const d = admin(UNTAGGED)
    const tabsHtml = page(d)
    const errorsTab = /<button\b[^>]*data-tab-id="errors"[^>]*>[\s\S]*?<\/button>/.exec(tabsHtml)?.[0] ?? ''
    expect(errorsTab).toContain('aria-disabled="true"')
    expect(text(errorsTab)).toContain(V2_UNTAGGED_TEXT.tabLockedReason)
    const direct = text(page(d, 'errors'))
    expect(direct).toContain(CATALOG_UNTAGGED_TEXT.errorsEmpty.title)
    expect(direct).not.toContain('כשיצטברו מספיק תשובות')
    /* קטלוג פעיל: הטאב לא חסום */
    expect(/<button\b[^>]*data-tab-id="errors"[^>]*>/.exec(page(admin()))?.[0]).not.toContain('aria-disabled')
  })
})
