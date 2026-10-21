import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../log.js', () => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }))
const io = vi.hoisted(() => ({ fetchClassRaw: vi.fn(), fetchSchoolClassIds: vi.fn(), fetchCatalogRows: vi.fn() }))
vi.mock('./realWorld/fetchRaw.js', () => ({ fetchClassRaw: io.fetchClassRaw, fetchSchoolClassIds: io.fetchSchoolClassIds, fetchCatalogRows: io.fetchCatalogRows }))

import type { V2Viewer } from './access.js'
import { AnalysisBuildError, resetAnalysisCaches } from './analysisCache.js'
import { skey } from './demoWorld.js'
import { grantClassIds, includeSyntheticOf, liveSource, resetLiveSourceCaches } from './liveSource.js'
import { emptyCatalogRows } from './realWorld/catalog.js'
import type { LiveCoverage } from './realWorld/coverage.js'
import { emptyRaw, type RawClassData } from './realWorld/rawTypes.js'
import { emptyClassRaw } from './realWorld/testkit.js'

const NOW = new Date('2026-03-06T10:00:00Z')

function richClass(id: string, over: Partial<RawClassData> = {}): RawClassData {
  const raw = emptyClassRaw(id, { gradeLabel: id === 'c-b' ? 'ז׳2' : 'ז׳1' })
  raw.classSubjects = ['history']
  for (let i = 0; i < 3; i++) {
    const sid = `${id}-s${i}`
    raw.members.push({ id: sid, name: `תלמיד ${i}`, classIds: [id] })
    raw.quests.push({ id: `${id}-q${i}`, subject: 'math' })
    raw.sessions.push({ id: `${id}-x${i}`, studentId: sid, questId: `${id}-q${i}`, completedAt: '2026-03-03T08:00:00Z' })
    raw.snapshots.push({ sessionId: `${id}-x${i}`, studentId: sid, classId: id, subject: 'math', level: 7 + i, success: 0.7 })
  }
  raw.quests.push({ id: `${id}-unclassified`, subject: null })
  raw.sessions.push({ id: `${id}-u`, studentId: `${id}-s0`, questId: `${id}-unclassified`, completedAt: '2026-03-03T09:00:00Z' })
  return { ...raw, ...over }
}

const viewer = (over: Partial<V2Viewer> & { seesSynthetic?: boolean } = {}): V2Viewer =>
  ({ lens: 'homeroom', guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [], source: 'live', schoolId: 'school-1', classGrants: [], ...over }) as V2Viewer
const grant = (classId: string, over = {}): NonNullable<V2Viewer['classGrants']>[number] => ({ classId, homeroom: true, subjects: [], unspecified: false, ...over })

let store: Record<string, RawClassData>
beforeEach(() => {
  resetAnalysisCaches(); resetLiveSourceCaches()
  store = { 'c-a': richClass('c-a'), 'c-b': richClass('c-b'), 'c-empty': emptyClassRaw('c-empty') }
  io.fetchClassRaw.mockReset().mockImplementation(async (id: string, include: boolean) => ({ ...(store[id] ?? emptyRaw(include)), includeSynthetic: include }))
  io.fetchSchoolClassIds.mockReset().mockResolvedValue(['c-b', 'c-a', 'c-empty'])
  io.fetchCatalogRows.mockReset().mockResolvedValue(emptyCatalogRows())
})

describe('liveSource.analysis', () => {
  it('כיתה אחת: ניתוח של הכיתה; הקריאה השנייה מהמטמון (בלי טעינה חוזרת)', async () => {
    const v = viewer({ classGrants: [grant('c-a')] })
    const a = await liveSource.analysis(v, NOW)
    expect(a.world.classes.map((c) => c.id)).toEqual(['c-a'])
    expect(a.world.live).toBe(true)
    const again = await liveSource.analysis(v, NOW)
    expect(again).toBe(a)
    expect(io.fetchClassRaw).toHaveBeenCalledTimes(1)
    expect(io.fetchClassRaw.mock.calls[0][1]).toBe(false)
  })

  it('מורה עם כמה כיתות: ניתוחים פר כיתה ממוזגים; כיתות בלי נתונים נשארות; מיזוג ממוזכר', async () => {
    const v = viewer({ classGrants: [grant('c-b'), grant('c-empty', { homeroom: false, subjects: ['math'] }), grant('c-a')] })
    const a = await liveSource.analysis(v, NOW)
    expect(a.world.classes.map((c) => c.id).sort()).toEqual(['c-a', 'c-b', 'c-empty'])
    expect(a.world.students).toHaveLength(6)
    expect(liveSource.classIds(v, a)).toEqual(['c-a', 'c-b', 'c-empty'])
    expect(await liveSource.analysis(v, NOW)).toBe(a) /* אותם חלקים ← אותו מיזוג */
    expect(io.fetchClassRaw).toHaveBeenCalledTimes(3)
    /* כיתה בלי תלמידים: קיימת בניתוח, בלי תלמידים */
    expect(a.classById.get('c-empty')!.studentIds).toEqual([])
  })

  it('שדות ישנים (בלי classGrants): מחנך ← כיתת החינוך; מורה מקצועי ← כיתות ההוראה', async () => {
    const hr = viewer({ classGrants: undefined, homeroomClassId: 'c-a', teachingClassIds: ['c-b'], lens: 'homeroom' })
    expect(grantClassIds(hr)).toEqual(['c-a'])
    const st = viewer({ classGrants: undefined, homeroomClassId: null, teachingClassIds: ['c-b', 'c-a'], subjectCodes: ['math'], lens: 'subject_teacher' })
    expect(grantClassIds(st)).toEqual(['c-a', 'c-b'])
    const a = await liveSource.analysis(st, NOW)
    expect(a.world.classes.map((c) => c.id).sort()).toEqual(['c-a', 'c-b'])
  })

  it('מנהל לעולם לא מקבל grants — היקפו בית הספר בלבד, גם אם classGrants מולא בטעות', async () => {
    const v = viewer({ lens: 'admin', classGrants: [grant('c-a')] })
    expect(grantClassIds(v)).toEqual([])
    const a = await liveSource.analysis(v, NOW)
    expect(a.world.classes).toHaveLength(3)
  })

  it('מנהל: כל כיתות בית הספר (ממוזגות); בלי schoolId — ניתוח ריק תקין', async () => {
    const v = viewer({ lens: 'admin', schoolId: 'school-1' })
    const a = await liveSource.analysis(v, NOW)
    expect(io.fetchSchoolClassIds).toHaveBeenCalledWith('school-1', false)
    expect(a.world.classes.map((c) => c.id).sort()).toEqual(['c-a', 'c-b', 'c-empty'])
    expect(liveSource.classIds(v, a)).toEqual(['c-a', 'c-b', 'c-empty'])
    const none = await liveSource.analysis(viewer({ lens: 'admin', schoolId: null }), NOW)
    expect(none.world.classes).toEqual([])
    expect(liveSource.classIds(viewer({ lens: 'admin', schoolId: null }), none)).toEqual([])
  })

  it('אין כיתות בהיקף (מורה בלי שיוך) → ניתוח ריק תקין, לא שגיאה, בלי טעינה', async () => {
    const v = viewer({ classGrants: [] })
    const a = await liveSource.analysis(v, NOW)
    expect(a.world.classes).toEqual([])
    expect(a.ss.size).toBe(0)
    expect(a.catalog).toBeDefined()
    expect(liveSource.classIds(v, a)).toEqual([])
    expect(io.fetchClassRaw).not.toHaveBeenCalled()
  })

  it('כיתה שלא נמצאה / בלי שכבה אינה ב-classIds, והבקשה לא נופלת', async () => {
    store['c-nograde'] = emptyClassRaw('c-nograde', { gradeLevel: null, gradeLabel: 'כיתת הכוכבים', name: 'כיתת הכוכבים' })
    const v = viewer({ classGrants: [grant('c-a'), grant('c-ghost'), grant('c-nograde')] })
    const a = await liveSource.analysis(v, NOW)
    expect(liveSource.classIds(v, a)).toEqual(['c-a'])
    expect((a.coverage as LiveCoverage).classesWithoutGrade).toBe(1)
  })

  it('סינתטי: רק צופה עם seesSynthetic; מפתח מטמון נפרד', async () => {
    const real = viewer({ classGrants: [grant('c-a')] })
    const demo = viewer({ classGrants: [grant('c-a')], seesSynthetic: true })
    expect(includeSyntheticOf(real)).toBe(false)
    expect(includeSyntheticOf(demo)).toBe(true)
    await liveSource.analysis(real, NOW)
    await liveSource.analysis(demo, NOW)
    expect(io.fetchClassRaw.mock.calls.map((c) => c[1]).sort()).toEqual([false, true])
  })

  it('כשל טעינה → שגיאת 503 מובחנת (לא ניתוח ריק שנראה אמיתי)', async () => {
    io.fetchClassRaw.mockRejectedValue(new Error('db'))
    await expect(liveSource.analysis(viewer({ classGrants: [grant('c-a')] }), NOW)).rejects.toBeInstanceOf(AnalysisBuildError)
  })

  it('כיתה דלה: המנוע רץ, אין ממצאים מדווחים, והרמה הנוכחית קיימת', async () => {
    const a = await liveSource.analysis(viewer({ classGrants: [grant('c-a')] }), NOW)
    expect(a.reportedKeys.size).toBe(0)
    expect(a.ss.get(skey('c-a-s0', 'math'))!.currentLevel).toBe(7)
    expect(a.ss.get(skey('c-a-s0', 'history'))!.currentLevel).toBeNull()
    expect(a.crossSubject.size).toBe(0)
  })
})

describe('liveSource — שאר חלקי הממשק', () => {
  it('classSubjects: מקצועות הכיתה מ-class_teachers וממה ששוחק (גם בלי נתונים)', async () => {
    const a = await liveSource.analysis(viewer({ classGrants: [grant('c-a'), grant('c-empty')] }), NOW)
    expect(liveSource.classSubjects(a, 'c-a')).toEqual(['history', 'math'])
    expect(liveSource.classSubjects(a, 'c-empty')).toEqual([])
    expect(liveSource.classSubjects(a, 'nope')).toEqual([])
  })

  it('configParts: עדשה אחת; מקצועות לפי grants בסדר קבוע; מנהל — ריק; בלי הודעות הדגמה', () => {
    const v = viewer({ lens: 'subject_teacher', classGrants: [grant('c-a', { homeroom: false, subjects: ['science', 'math'] }), grant('c-b', { homeroom: false, subjects: ['math', 'history'] })] })
    expect(liveSource.configParts(v)).toEqual({ availableLenses: ['subject_teacher'], subjects: ['history', 'math', 'science'], dataNotice: null, curriculumNotice: null })
    expect(liveSource.configParts(viewer({ lens: 'admin' })).subjects).toEqual([])
    expect(liveSource.configParts(viewer({ lens: 'subject_teacher', classGrants: undefined, teachingClassIds: ['c-a'], subjectCodes: ['math'] })).subjects).toEqual(['math'])
    expect(liveSource.configParts(viewer({ lens: 'homeroom', classGrants: [grant('c-a')] })).subjects).toEqual([])
  })

  it('coverage: הדמיות בלי מקצוע נספרות ומדווחות; פירוט תשובות מהניתוח', async () => {
    store['c-a'] = richClass('c-a', { detailAvailableFrom: '2026-02-01T00:00:00Z' })
    const v = viewer({ classGrants: [grant('c-a'), grant('c-b')] })
    const a = await liveSource.analysis(v, NOW)
    /* קטלוג ריק (אין תיוג בנתוני הבדיקה) מסומן ב-catalogEmpty */
    expect(liveSource.coverage(v, a)).toEqual({ unclassifiedSessions: 2, detailAvailableFrom: '2026-02-01T00:00:00Z', catalogEmpty: true })
    const c = a.coverage as LiveCoverage
    expect(c.sessionsUsed).toBe(6)
    expect(c.catalogEmpty).toBe(true)
  })

  it('coverage של ניתוח בלי coverage (הדגמה) → אפסים', async () => {
    const a = await liveSource.analysis(viewer({ classGrants: [] }), NOW)
    expect(liveSource.coverage(viewer(), { ...a, coverage: undefined })).toEqual({ unclassifiedSessions: 0, detailAvailableFrom: null })
  })

  it('kind=live, ואין logNamed (הרישום ביומן בנתיב)', () => {
    expect(liveSource.kind).toBe('live')
    expect(liveSource.logNamed).toBeUndefined()
  })
})
