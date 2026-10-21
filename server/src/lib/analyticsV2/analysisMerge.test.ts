import { describe, expect, it } from 'vitest'
import { EMPTY_CATALOG } from './catalog.js'
import { mergeAnalyses } from './analysisMerge.js'
import { buildWorld, skey } from './demoWorld.js'
import type { MisStat } from './engine.js'
import { analyzeRaw } from './realWorld/analyzeRaw.js'
import { emptyClassRaw, rawFromDemoClass } from './realWorld/testkit.js'

const NOW = new Date('2026-03-06T10:00:00Z')
const demo = buildWorld(NOW)
const part = (classId: string) => analyzeRaw(rawFromDemoClass(demo, classId), NOW, EMPTY_CATALOG)

describe('analyzeRaw', () => {
  it('מרוקן את world.data (חוסך זיכרון במטמון) אלא אם keepData; מילא coverage ו-catalogEmpty', () => {
    const a = part('c-v2')
    expect(a.world.data.size).toBe(0)
    expect(a.ss.size).toBeGreaterThan(0)
    expect(a.coverage).toMatchObject({ classesTotal: 1, catalogEmpty: true })
    expect(a.coverage.studentsTotal).toBe(25)
    const kept = analyzeRaw(rawFromDemoClass(demo, 'c-v2'), NOW, EMPTY_CATALOG, { keepData: true })
    expect(kept.world.data.size).toBeGreaterThan(0)
  })
})

describe('mergeAnalyses', () => {
  const a = part('c-v2')
  const b = part('c-d2')

  it('אין ניתוחים → שגיאה; ניתוח אחד → אותו אובייקט', () => {
    expect(() => mergeAnalyses([])).toThrow()
    expect(mergeAnalyses([a])).toBe(a)
  })

  it('שתי כיתות: כיתות / תלמידים / ניתוח פר תלמיד×מקצוע מאוחדים, והאובייקטים של החלקים נשמרים', () => {
    const m = mergeAnalyses([a, b])
    expect(m.world.classes.map((c) => c.id).sort()).toEqual(['c-d2', 'c-v2'])
    expect(m.world.students).toHaveLength(a.world.students.length + b.world.students.length)
    expect(m.ss.size).toBe(a.ss.size + b.ss.size)
    for (const [k, v] of a.ss) expect(m.ss.get(k)).toBe(v)
    for (const [k, v] of b.ss) expect(m.ss.get(k)).toBe(v)
    expect(m.classById.get('c-v2')).toBe(a.classById.get('c-v2'))
    expect(m.studentById.size).toBe(m.world.students.length)
    expect(m.world.live).toBe(true)
    expect(m.world.data.size).toBe(0)
    expect([...m.classFindings.keys()].sort()).toEqual([...new Set([...a.classFindings.keys(), ...b.classFindings.keys()])].sort())
    expect(m.coverage).toMatchObject({ classesTotal: 2, studentsTotal: m.world.students.length, studentsInMultipleClasses: 0 })
    expect(m.coverage.sessionsUsed).toBe(a.coverage.sessionsUsed + b.coverage.sessionsUsed)
  })

  it('דטרמיניסטי: סדר הקלט לא משנה את התוצאה', () => {
    const x = mergeAnalyses([a, b]), y = mergeAnalyses([b, a])
    expect(x.world.classes.map((c) => c.id)).toEqual(y.world.classes.map((c) => c.id))
    expect(x.world.students.map((s) => s.id)).toEqual(y.world.students.map((s) => s.id))
    expect([...x.ss.keys()].sort()).toEqual([...y.ss.keys()].sort())
    expect([...x.reportedKeys].sort()).toEqual([...y.reportedKeys].sort())
  })

  it('reportedKeys נגזר מהממצאים המדווחים בתוצאה הממוזגת', () => {
    const m = mergeAnalyses([a, b])
    const fromFindings = new Set<string>()
    for (const sa of m.ss.values()) for (const f of sa.findings) if (f.status === 'reported') fromFindings.add(f.id)
    for (const fs of m.classFindings.values()) for (const x of fs) if (x.finding.status === 'reported') fromFindings.add(x.finding.id)
    for (const fs of m.crossSubject.values()) for (const f of fs) if (f.status === 'reported') fromFindings.add(f.id)
    expect(m.reportedKeys).toEqual(fromFindings)
  })

  it('ageNormOf מתאים לשכבה של כל כיתה', () => {
    const m = mergeAnalyses([a, b])
    expect(m.ageNormOf(6)).toEqual(a.ageNormOf(6))
    expect(m.ageNormOf(4)).toEqual(b.ageNormOf(4))
    expect(m.ageNormOf(6).gradeLabel).toBe('ו׳')
  })

  it('misByGrade של כיתות באותה שכבה מצטבר: סכום חשיפות והצגות, והאחוז מחושב מחדש (מוסתר מתחת לסף)', () => {
    const mk = (exposed: number, showing: number): MisStat => ({
      misconceptionId: 'm1', scopeId: 'grade:6', studentsExposed: exposed, studentsShowing: showing, sharePct: null,
      students: Array.from({ length: showing }, (_, i) => ({ id: `s${exposed}-${i}`, hits: 2, exposures: 3 })),
    })
    const p1 = part('c-v2'), p2 = part('c-v1')
    p1.misByGrade.set('6|m1', mk(3, 1))
    p2.misByGrade.set('6|m1', mk(4, 2))
    const m = mergeAnalyses([p1, p2])
    expect(m.misByGrade.get('6|m1')).toMatchObject({ studentsExposed: 7, studentsShowing: 3, sharePct: 43 })
    const q1 = part('c-v2'), q2 = part('c-v1')
    q1.misByGrade.set('6|m1', mk(1, 1)); q2.misByGrade.set('6|m1', mk(2, 1))
    expect(mergeAnalyses([q1, q2]).misByGrade.get('6|m1')).toMatchObject({ studentsExposed: 3, studentsShowing: 2, sharePct: null })
  })
})

describe('mergeAnalyses — תלמיד בכמה כיתות', () => {
  /* s1 חבר בשתי הכיתות; שיחק בעיקר ב-B (שני סשנים מול אחד). בכיתה A מקצוע הכיתה היסטוריה, ב-B מדעים */
  function build(classId: 'class-a' | 'class-b' | 'class-c') {
    const raw = emptyClassRaw(classId, { gradeLevel: 7, gradeLabel: { 'class-a': 'ז׳1', 'class-b': 'ז׳2', 'class-c': 'ז׳3' }[classId] })
    raw.classSubjects = [{ 'class-a': 'history', 'class-b': 'science', 'class-c': 'bible' }[classId] as 'history']
    raw.members.push({ id: 's1', name: 'דנה כהן', classIds: ['class-a', 'class-b', ...(classId === 'class-c' ? ['class-c'] : [])] }, { id: `other-${classId}`, name: 'רון', classIds: [classId] })
    raw.quests.push({ id: 'q1', subject: 'math' }, { id: 'q2', subject: 'math' }, { id: 'q3', subject: 'math' })
    const at = (d: number) => `2026-03-0${d}T08:00:00Z`
    raw.sessions.push(
      { id: 'x1', studentId: 's1', questId: 'q1', completedAt: at(2) }, { id: 'x2', studentId: 's1', questId: 'q2', completedAt: at(3) }, { id: 'x3', studentId: 's1', questId: 'q3', completedAt: at(4) },
    )
    raw.snapshots.push(
      { sessionId: 'x1', studentId: 's1', classId: 'class-b', subject: 'math', level: 7, success: 0.7 },
      { sessionId: 'x2', studentId: 's1', classId: 'class-b', subject: 'math', level: 8, success: 0.7 },
      { sessionId: 'x3', studentId: 's1', classId: 'class-a', subject: 'math', level: 9, success: 0.7 },
    )
    return analyzeRaw(raw, NOW, EMPTY_CATALOG)
  }
  const A = build('class-a'), B = build('class-b')

  it('בכל חלק התלמיד גלוי (לא נעלם ממורה כיתה), והכיתה העיקרית זהה בשניהם', () => {
    expect(A.world.classes[0].studentIds).toContain('s1')
    expect(B.world.classes[0].studentIds).toContain('s1')
    expect(A.primaryClassOf.get('s1')).toBe('class-b')
    expect(B.primaryClassOf.get('s1')).toBe('class-b')
    expect(A.world.students.find((s) => s.id === 's1')!.classId).toBe('class-a')
  })

  it('במיזוג: רשומה אחת, הכיתה העיקרית, מקצועות מאוחדים, ניתוח אחד לכל זוג; ובשתי הכיתות עדיין מופיע ב-studentIds', () => {
    for (const order of [[A, B], [B, A]]) {
      const m = mergeAnalyses(order)
      const st = m.studentById.get('s1')!
      expect(m.world.students.filter((s) => s.id === 's1')).toHaveLength(1)
      expect(st.classId).toBe('class-b')
      expect(st.subjects).toEqual(['history', 'math', 'science'])
      expect(m.classById.get('class-a')!.studentIds).toContain('s1')
      expect(m.classById.get('class-b')!.studentIds).toContain('s1')
      for (const sub of st.subjects) expect(m.ss.has(skey('s1', sub))).toBe(true)
      expect(m.ss.get(skey('s1', 'math'))).toBe(B.ss.get(skey('s1', 'math'))) /* מהחלק של הכיתה העיקרית */
      expect(m.ss.get(skey('s1', 'history'))).toBe(A.ss.get(skey('s1', 'history'))) /* מקצוע שקיים רק ב-A */
      expect(m.coverage).toMatchObject({ classesTotal: 2, studentsTotal: 3, studentsInMultipleClasses: 1 })
      /* כל תלמיד ברשימת כיתה קיים ב-studentById וב-ss לכל מקצועותיו (כך שהספק לא ייתקל ב-undefined) */
      for (const c of m.world.classes) for (const sid of c.studentIds) {
        const s = m.studentById.get(sid)!
        for (const sub of s.subjects) expect(m.ss.get(skey(sid, sub))).toBeDefined()
      }
    }
  })

  it('כשהכיתה העיקרית (class-b) אינה בין החלקים — החלק הראשון לפי מזהה הכיתה', () => {
    const C = build('class-c')
    for (const order of [[A, C], [C, A]]) {
      const m = mergeAnalyses(order)
      expect(m.studentById.get('s1')!.classId).toBe('class-a')
      expect(m.studentById.get('s1')!.subjects).toEqual(['history', 'math', 'bible'])
    }
  })
})
