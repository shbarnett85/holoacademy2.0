/* FX1b (R2#9): כיסוי הנתונים במיזוג כיתות — משחק בהדמיה בלי מקצוע של תלמיד החבר בשתי כיתות של אותו מורה נספר פעם אחת, לא פעמיים. */
import { describe, expect, it } from 'vitest'
import { mergeAnalyses } from './analysisMerge.js'
import { EMPTY_CATALOG } from './catalog.js'
import { analyzeRaw } from './realWorld/analyzeRaw.js'
import { emptyCoverage, sumCoverage, type LiveCoverage } from './realWorld/coverage.js'
import { emptyClassRaw } from './realWorld/testkit.js'
import type { RawClassData } from './realWorld/rawTypes.js'

const NOW = new Date('2026-03-06T10:00:00Z')
const cov = (over: Partial<LiveCoverage>): LiveCoverage => ({ ...emptyCoverage(), ...over })

describe('sumCoverage: משחקים ייחודיים', () => {
  it('כל החלקים מספקים מזהים: הספירה היא מספר המזהים השונים (אותו משחק בשתי כיתות = אחד)', () => {
    const out = sumCoverage([
      cov({ unclassifiedSessions: 3, unclassifiedSessionIds: ['a', 'b', 'c'] }),
      cov({ unclassifiedSessions: 2, unclassifiedSessionIds: ['c', 'd'] }),
    ])
    expect(out.unclassifiedSessions).toBe(4)
    expect(out.unclassifiedSessionIds?.sort()).toEqual(['a', 'b', 'c', 'd'])
  })
  it('חלק אחד בלי מזהים: חוזרים לסכום (לא מנחשים)', () => {
    const out = sumCoverage([cov({ unclassifiedSessions: 3, unclassifiedSessionIds: ['a', 'b', 'c'] }), cov({ unclassifiedSessions: 2 })])
    expect(out.unclassifiedSessions).toBe(5)
    expect(out.unclassifiedSessionIds).toBeUndefined()
  })
  it('כיתות שלא נטענו / בטעינה: מצטברות, ושדה שנשאר אפס אינו מופיע', () => {
    const out = sumCoverage([cov({ classesNotLoaded: 1 }), cov({ classesNotLoaded: 2, classesLoading: 1 })])
    expect(out).toMatchObject({ classesNotLoaded: 3, classesLoading: 1 })
    const none = sumCoverage([cov({}), cov({})])
    expect('classesNotLoaded' in none).toBe(false)
    expect('classesLoading' in none).toBe(false)
  })
})

describe('mergeAnalyses: תלמיד בשתי כיתות', () => {
  function raw(classId: string): RawClassData {
    const r = emptyClassRaw(classId, { gradeLabel: 'ז׳1' })
    r.members.push({ id: 'shared', name: 'תלמיד משותף', classIds: ['c-a', 'c-b'] }, { id: `only-${classId}`, name: `תלמיד ${classId}`, classIds: [classId] })
    /* אותו משחק (של התלמיד המשותף) נשלף בשתי הכיתות; ועוד משחק אחד פרטי לכל כיתה — כולם בהדמיות בלי מקצוע */
    r.quests.push({ id: 'q-none', subject: null })
    r.sessions.push(
      { id: 'dup', studentId: 'shared', questId: 'q-none', completedAt: '2026-03-03T08:00:00Z' },
      { id: `own-${classId}`, studentId: `only-${classId}`, questId: 'q-none', completedAt: '2026-03-03T09:00:00Z' },
    )
    return r
  }
  const a = analyzeRaw(raw('c-a'), NOW, EMPTY_CATALOG)
  const b = analyzeRaw(raw('c-b'), NOW, EMPTY_CATALOG)

  it('regression: 3 משחקים ייחודיים — לא 4', () => {
    expect(a.coverage.unclassifiedSessions).toBe(2)
    expect(b.coverage.unclassifiedSessions).toBe(2)
    const merged = mergeAnalyses([a, b])
    expect(merged.coverage.unclassifiedSessions).toBe(3)
    expect(merged.coverage.studentsInMultipleClasses).toBe(1)
  })
  it('סדר הקלט לא משנה', () => {
    expect(mergeAnalyses([b, a]).coverage.unclassifiedSessions).toBe(3)
  })
})
