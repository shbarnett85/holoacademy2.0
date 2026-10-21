/* FX1b (R2#6): כיתה אחת שנכשלת לא מפילה את כל הבקשה — ניתוח חלקי עם הודעה בשפה פשוטה; 503 רק כשאף כיתה לא נטענה ('warming' גובר). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../log.js', () => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }))
const io = vi.hoisted(() => ({ fetchClassRaw: vi.fn(), fetchSchoolClassIds: vi.fn(), fetchCatalogRows: vi.fn() }))
vi.mock('./realWorld/fetchRaw.js', () => ({ fetchClassRaw: io.fetchClassRaw, fetchSchoolClassIds: io.fetchSchoolClassIds, fetchCatalogRows: io.fetchCatalogRows }))

import { narrateCoverageGaps } from '../../../../src/shared/lib/findingsNarrative.js'
import { EP } from '../../../../src/shared/types/analyticsV2.js'
import { ProbeUnavailableError } from '../schemaErrors.js'
import type { V2Viewer } from './access.js'
import { AnalysisBuildError, resetAnalysisCaches } from './analysisCache.js'
import { liveSource, resetLiveSourceCaches } from './liveSource.js'
import { createProvider } from './providerCore.js'
import { emptyCatalogRows } from './realWorld/catalog.js'
import { emptyRaw, type RawClassData } from './realWorld/rawTypes.js'
import { emptyClassRaw } from './realWorld/testkit.js'

const NOW = new Date('2026-03-06T10:00:00Z')

function richClass(id: string, gradeLabel = 'ז׳1'): RawClassData {
  const raw = emptyClassRaw(id, { gradeLabel })
  raw.classSubjects = ['math']
  for (let i = 0; i < 3; i++) {
    const sid = `${id}-s${i}`
    raw.members.push({ id: sid, name: `תלמיד ${i}`, classIds: [id] })
    raw.quests.push({ id: `${id}-q${i}`, subject: 'math' })
    raw.sessions.push({ id: `${id}-x${i}`, studentId: sid, questId: `${id}-q${i}`, completedAt: '2026-03-03T08:00:00Z' })
    raw.snapshots.push({ sessionId: `${id}-x${i}`, studentId: sid, classId: id, subject: 'math', level: 7 + i, success: 0.7 })
  }
  return raw
}
const grant = (classId: string, over = {}): NonNullable<V2Viewer['classGrants']>[number] => ({ classId, homeroom: true, subjects: [], unspecified: false, ...over })
const viewer = (grants: NonNullable<V2Viewer['classGrants']>): V2Viewer =>
  ({ lens: 'homeroom', guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [], source: 'live', schoolId: 'school-1', classGrants: grants }) as V2Viewer

let store: Record<string, RawClassData | Error | 'hang'>
beforeEach(() => {
  resetAnalysisCaches(); resetLiveSourceCaches()
  store = { 'c-a': richClass('c-a'), 'c-b': richClass('c-b', 'ז׳2'), 'c-c': richClass('c-c', 'ז׳3') }
  io.fetchClassRaw.mockReset().mockImplementation(async (id: string, include: boolean) => {
    const e = store[id]
    if (e instanceof Error) throw e
    if (e === 'hang') return new Promise(() => undefined)
    return { ...(e ?? emptyRaw(include)), includeSynthetic: include }
  })
  io.fetchSchoolClassIds.mockReset().mockResolvedValue(['c-a', 'c-b', 'c-c'])
  io.fetchCatalogRows.mockReset().mockResolvedValue(emptyCatalogRows())
})
afterEach(() => { delete process.env.ANALYTICS_V2_BUILD_TIMEOUT_MS; resetAnalysisCaches() })

describe('liveSource.analysis: ניתוח חלקי', () => {
  it('regression (R2#6): כיתה אחת נכשלת — שתי האחרות נטענות, ההערה "לא הצלחנו לטעון כיתה אחת" מגיעה ב-coverage, והכיתה החסרה לא מופיעה', async () => {
    store['c-b'] = new Error('connection reset')
    const v = viewer([grant('c-a'), grant('c-b'), grant('c-c')])
    const a = await liveSource.analysis(v, NOW)
    expect(a.world.classes.map((c) => c.id).sort()).toEqual(['c-a', 'c-c'])
    expect(liveSource.classIds(v, a)).toEqual(['c-a', 'c-c'])
    expect(liveSource.coverage(v, a)).toMatchObject({ classesNotLoaded: 1 })
    expect(liveSource.coverage(v, a).classesLoading).toBeUndefined()
  })

  it('הבחנה: כיתה שההרכבה נכשלה על הנתונים שלה (לא תשתית) — classesDataError, והמשפט אומר שזה לא יעבור בניסיון חוזר פשוט', async () => {
    store['c-b'] = { ...richClass('c-b', 'ז׳2'), members: null as unknown as RawClassData['members'] } /* ההרכבה זורקת TypeError על שורות פגומות */
    const v = viewer([grant('c-a'), grant('c-b')])
    const a = await liveSource.analysis(v, NOW)
    expect(a.world.classes.map((c) => c.id)).toEqual(['c-a'])
    const cov = liveSource.coverage(v, a)
    expect(cov).toMatchObject({ classesDataError: 1 })
    expect(cov.classesNotLoaded).toBeUndefined()
    const out = await createProvider(liveSource).entry(v)
    expect(out.data.coverageNote).toBe(narrateCoverageGaps({ ungradedClasses: 0, notLoadedClasses: 0, loadingClasses: 0, dataErrorClasses: 1, playsWithoutLevel: 0 }).join(' '))
    expect(out.data.coverageNote).toContain('לא הצלחנו לחשב')
    /* כשל תשתית (שגיאת DB רגילה) נשאר "לא הצלחנו לטעון … נסו שוב" */
    store['c-b'] = new Error('connection reset')
    resetAnalysisCaches()
    const infra = liveSource.coverage(v, await liveSource.analysis(v, NOW))
    expect(infra).toMatchObject({ classesNotLoaded: 1 })
    expect(infra.classesDataError).toBeUndefined()
  })

  it('כשל לא נשמר: הבקשה הבאה (אחרי שהתקלה חלפה) מביאה את כל הכיתות, בלי הערה', async () => {
    store['c-b'] = new Error('connection reset')
    const v = viewer([grant('c-a'), grant('c-b')])
    await liveSource.analysis(v, NOW)
    store['c-b'] = richClass('c-b', 'ז׳2')
    const again = await liveSource.analysis(v, NOW)
    expect(again.world.classes.map((c) => c.id).sort()).toEqual(['c-a', 'c-b'])
    expect(liveSource.coverage(v, again).classesNotLoaded).toBeUndefined()
  })

  it('הניתוח החלקי לא משנה את הניתוח במטמון (עותק רדוד): הכיתה הבודדת שנטענה נשארת בלי ההערה', async () => {
    store['c-b'] = new Error('x')
    const partial = await liveSource.analysis(viewer([grant('c-a'), grant('c-b')]), NOW)
    expect(liveSource.coverage(viewer([]), partial).classesNotLoaded).toBe(1)
    const solo = await liveSource.analysis(viewer([grant('c-a')]), NOW)
    expect(liveSource.coverage(viewer([]), solo).classesNotLoaded).toBeUndefined()
  })

  it('אף כיתה לא נטענה: 503 (אותה שגיאה כמו קודם) — לא ניתוח ריק שנראה כ"אין כיתות"', async () => {
    store['c-a'] = new Error('down'); store['c-b'] = new Error('down')
    const err = await liveSource.analysis(viewer([grant('c-a'), grant('c-b')]), NOW).catch((e) => e)
    expect(err).toBeInstanceOf(AnalysisBuildError)
    expect(err).toMatchObject({ status: 503, kind: 'unavailable' })
  })

  it('אף כיתה לא נטענה ואחת מהן עדיין נבנית: warming גובר ("נסו שוב בעוד דקה")', async () => {
    process.env.ANALYTICS_V2_BUILD_TIMEOUT_MS = '30'
    resetAnalysisCaches()
    store['c-a'] = new Error('down'); store['c-b'] = 'hang'
    const err = await liveSource.analysis(viewer([grant('c-a'), grant('c-b')]), NOW).catch((e) => e)
    expect(err).toMatchObject({ status: 503, kind: 'warming' })
  })

  it('שגיאת סכמה (503 קיימת) עוברת כמות שהיא כשאף כיתה לא נטענה', async () => {
    store['c-a'] = new ProbeUnavailableError('sessions.is_synthetic', 'x') as unknown as Error
    const err = await liveSource.analysis(viewer([grant('c-a')]), NOW).catch((e) => e)
    expect(err).toBeInstanceOf(ProbeUnavailableError)
  })

  it('כיתה אחת עדיין נבנית וכיתה אחרת נטענה: ניתוח חלקי עם classesLoading', async () => {
    process.env.ANALYTICS_V2_BUILD_TIMEOUT_MS = '30'
    resetAnalysisCaches()
    store['c-b'] = 'hang'
    const v = viewer([grant('c-a'), grant('c-b')])
    const a = await liveSource.analysis(v, NOW)
    expect(a.world.classes.map((c) => c.id)).toEqual(['c-a'])
    expect(liveSource.coverage(v, a)).toMatchObject({ classesLoading: 1 })
    expect(liveSource.coverage(v, a).classesNotLoaded).toBeUndefined()
  })

  it('מנהל: כיתה אחת מבית הספר נכשלה — האגרגט מבוסס על השאר, וההערה ב-highlights בלי שם כיתה', async () => {
    store['c-c'] = new Error('x')
    const admin = { lens: 'admin', guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [], source: 'live', schoolId: 'school-1' } as V2Viewer
    const out = await createProvider(liveSource).admin(admin)
    expect(EP.admin.response.safeParse(out).success).toBe(true)
    const note = narrateCoverageGaps({ ungradedClasses: 0, notLoadedClasses: 1, loadingClasses: 0, playsWithoutLevel: 0 }).join(' ')
    expect(out.data.highlights[out.data.highlights.length - 1]).toBe(note)
    expect(JSON.stringify(out)).not.toMatch(/c-a|c-b|c-c|תלמיד \d/)
  })

  it('מסך הכניסה של מורה: הערת הכיסוי מופיעה, הכיתות שנטענו מוצגות', async () => {
    store['c-b'] = new Error('x')
    const out = await createProvider(liveSource).entry(viewer([grant('c-a'), grant('c-b')]))
    expect(out.data.classes.map((c) => c.id)).toEqual(['c-a'])
    expect(out.data.coverageNote).toBe(narrateCoverageGaps({ ungradedClasses: 0, notLoadedClasses: 1, loadingClasses: 0, playsWithoutLevel: 0 }).join(' '))
  })
})
