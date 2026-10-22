/* G1 (UX#2): משחקים שלא נכללו, לפי תלמיד/ה — assemble סופר לכל תלמיד/ה, sumCoverage ממזג בלי לכפול (אותו משחק נשלף בכל כיתה של התלמיד/ה),
   liveSource.scopedGap מסכם לכיתה או לתלמיד/ה, והספק החי מציג את הסיבה האמיתית במסכי הכיתה והתלמיד/ה. IO מוחלף ב-mocks. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../log.js', () => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }))
const io = vi.hoisted(() => ({ fetchClassRaw: vi.fn(), fetchSchoolClassIds: vi.fn(), fetchCatalogRows: vi.fn() }))
vi.mock('./realWorld/fetchRaw.js', () => ({ fetchClassRaw: io.fetchClassRaw, fetchSchoolClassIds: io.fetchSchoolClassIds, fetchCatalogRows: io.fetchCatalogRows }))

import { gapReason, narrateScopedCoverageNote } from '../../../../src/shared/lib/findingsNarrative.js'
import { resetAnalysisCaches } from './analysisCache.js'
import { mergeAnalyses } from './analysisMerge.js'
import { EMPTY_CATALOG } from './catalog.js'
import { liveProvider } from './liveProvider.js'
import { liveSource, resetLiveSourceCaches } from './liveSource.js'
import { analyzeRaw } from './realWorld/analyzeRaw.js'
import { emptyCatalogRows } from './realWorld/catalog.js'
import { emptyCoverage, sumCoverage } from './realWorld/coverage.js'
import { emptyRaw, type RawClassData } from './realWorld/rawTypes.js'
import { emptyClassRaw } from './realWorld/testkit.js'
import { live, grant } from './providerTestkit.js'

const NOW = new Date('2026-03-06T10:00:00Z')

describe('assemble / sumCoverage: משחקים שהוחרגו לפי תלמיד/ה', () => {
  function raw(classId: string): RawClassData {
    const r = emptyClassRaw(classId, { gradeLabel: 'ז׳1' })
    r.members.push({ id: 'shared', name: 'תלמיד משותף', classIds: ['c-a', 'c-b'] }, { id: `only-${classId}`, name: `תלמיד ${classId}`, classIds: [classId] })
    r.quests.push({ id: 'q-none', subject: null }, { id: 'q-math', subject: 'math' })
    r.sessions.push(
      { id: 'dup1', studentId: 'shared', questId: 'q-none', completedAt: '2026-03-03T08:00:00Z' },
      { id: 'dup2', studentId: 'shared', questId: 'q-none', completedAt: '2026-03-03T08:30:00Z' },
      { id: `own-${classId}`, studentId: `only-${classId}`, questId: 'q-none', completedAt: '2026-03-03T09:00:00Z' },
      /* הדמיה עם מקצוע, אבל ה-snapshot בלי subject_id (שוחק לפני שהרמה חושבה לפי מקצוע) */
      { id: `lvl-${classId}`, studentId: `only-${classId}`, questId: 'q-math', completedAt: '2026-03-03T10:00:00Z' },
    )
    r.snapshots.push({ sessionId: `lvl-${classId}`, studentId: `only-${classId}`, classId, subject: null, level: 7, success: 0.7 })
    return r
  }
  const a = analyzeRaw(raw('c-a'), NOW, EMPTY_CATALOG)
  const b = analyzeRaw(raw('c-b'), NOW, EMPTY_CATALOG)

  it('כל כיתה סופרת לכל תלמיד/ה את המשחקים שהוחרגו: בהדמיות בלי מקצוע, ובהדמיות עם מקצוע בלי רמה לפי מקצוע', () => {
    expect(a.coverage.unclassifiedByStudent).toEqual({ shared: 2, 'only-c-a': 1 })
    expect(a.coverage.unleveledByStudent).toEqual({ 'only-c-a': 1 })
  })

  it('במיזוג: התלמיד/ה המשותף/ת נספר/ת פעם אחת (הגדול, לא הסכום) — אותם משחקים נשלפו בשתי הכיתות', () => {
    const merged = mergeAnalyses([a, b])
    expect(merged.coverage.unclassifiedByStudent).toEqual({ shared: 2, 'only-c-a': 1, 'only-c-b': 1 })
    expect(merged.coverage.unleveledByStudent).toEqual({ 'only-c-a': 1, 'only-c-b': 1 })
  })

  it('כיסוי בלי משחקים שהוחרגו: אין מפות (השדות אינם מופיעים)', () => {
    const none = analyzeRaw(emptyClassRaw('c-x', { gradeLabel: 'ז׳1' }), NOW, EMPTY_CATALOG)
    expect('unclassifiedByStudent' in none.coverage).toBe(false)
    expect('unleveledByStudent' in none.coverage).toBe(false)
    const sum = sumCoverage([emptyCoverage(), emptyCoverage()])
    expect('unclassifiedByStudent' in sum).toBe(false)
  })
})

describe('הספק החי: הפער בהיקף כיתה / תלמיד/ה', () => {
  let store: Record<string, RawClassData>
  const mk = (id: string): RawClassData => {
    const r = emptyClassRaw(id, { gradeLabel: 'ו׳1', gradeLevel: 6 })
    r.classSubjects = ['math']
    r.quests.push({ id: 'q-none', subject: null })
    for (let i = 0; i < 4; i++) r.members.push({ id: `${id}-s${i}`, name: `תלמיד ${i}`, classIds: [id] })
    /* התלמידים שיחקו, אבל כל המשחקים בהדמיה בלי מקצוע: s0 — 3 משחקים, s1 — משחק אחד, שני האחרים — לא שיחקו */
    for (let k = 0; k < 3; k++) r.sessions.push({ id: `${id}-a${k}`, studentId: `${id}-s0`, questId: 'q-none', completedAt: '2026-03-03T08:00:00Z' })
    r.sessions.push({ id: `${id}-b0`, studentId: `${id}-s1`, questId: 'q-none', completedAt: '2026-03-04T08:00:00Z' })
    return r
  }
  beforeEach(() => {
    resetAnalysisCaches(); resetLiveSourceCaches()
    store = { 'c-a': mk('c-a') }
    io.fetchClassRaw.mockReset().mockImplementation(async (id: string, include: boolean) => ({ ...(store[id] ?? emptyRaw(include)), includeSynthetic: include }))
    io.fetchSchoolClassIds.mockReset().mockResolvedValue(['c-a'])
    io.fetchCatalogRows.mockReset().mockResolvedValue(emptyCatalogRows())
  })
  const homeroom = live([grant('c-a', { homeroom: true })])

  it('scopedGap: סכום חברי הכיתה / תלמיד/ה בודד/ת; מזהה לא מוכר = אפס', async () => {
    const a = await liveSource.analysis(homeroom, NOW)
    expect(liveSource.scopedGap!(homeroom, a, ['c-a-s0', 'c-a-s1', 'c-a-s2', 'c-a-s3'])).toEqual({ unclassified: 4, withoutLevel: 0 })
    expect(liveSource.scopedGap!(homeroom, a, ['c-a-s0'])).toEqual({ unclassified: 3, withoutLevel: 0 })
    expect(liveSource.scopedGap!(homeroom, a, ['c-a-s2'])).toEqual({ unclassified: 0, withoutLevel: 0 })
    expect(liveSource.scopedGap!(homeroom, a, ['nobody'])).toEqual({ unclassified: 0, withoutLevel: 0 })
  })

  it('מסך הכיתה: העובדה האמיתית (4 משחקים בהדמיות בלי מקצוע), הקטלוג הריק, והסיכום אינו אומר "כשיסיימו"', async () => {
    const out = (await liveProvider.classOverview(homeroom, 'c-a')).data
    expect(out.coverageNote).toBe(narrateScopedCoverageNote({ unclassified: 4, withoutLevel: 0 }))
    expect(out.summary).toContain(gapReason({ unclassified: 4, withoutLevel: 0 })!)
    expect(out.catalogReady).toBe(false)
    expect(out.rows.every((r) => r.level === null)).toBe(true)
  })

  it('מסך תלמיד/ה: רק המשחקים שלו/ה — s0: 3, s2: אין הערה', async () => {
    const s0 = (await liveProvider.student(homeroom, 'c-a-s0')).data
    expect(s0.coverageNote).toBe(narrateScopedCoverageNote({ unclassified: 3, withoutLevel: 0 }))
    expect(s0.coverageNote).toContain('3 משחקים')
    const s2 = (await liveProvider.student(homeroom, 'c-a-s2')).data
    expect(s2.coverageNote).toBeNull()
    expect(s2.summary).not.toContain('אין כרגע דבר חריג')
  })
})
