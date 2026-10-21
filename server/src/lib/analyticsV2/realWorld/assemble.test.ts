import { describe, expect, it } from 'vitest'
import { analyze } from '../engine.js'
import { DEMO_CATALOG, EMPTY_CATALOG } from '../catalog.js'
import { buildWorld, skey } from '../demoWorld.js'
import { buildSchoolDays } from '../schoolCalendar.js'
import {
  assembleWorld, assembleWorldDetailed, conceptLevelsOfSession, firstCompletionIds, gradeFromText, gradeLabelOf, gradeOfClass, readingOfSession, replayMemory, retriesOfAnswers,
} from './assemble.js'
import { emptyCoverage, sumCoverage } from './coverage.js'
import type { RawAnswer, RawClassData, RawMemoryFlip } from './rawTypes.js'
import { emptyClassRaw, rawFromDemoClass } from './testkit.js'

/* יום שישי: ימי הלימוד של העולם החי וההדגמה מתחילים שניהם ביום חמישי — כך האינדקסים זהים */
const FRIDAY = new Date('2026-03-06T10:00:00Z')

const sorted = <T extends { day: number; level: number; success: number }>(xs: T[]): T[] =>
  [...xs].sort((a, b) => a.day - b.day || a.level - b.level || a.success - b.success)
/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- הפירוק מוציא את concepts מהאובייקט; המשתנה עצמו אינו בשימוש */
const noConcepts = <T extends { concepts: unknown }>(xs: T[]): Omit<T, 'concepts' | 'questId'>[] => xs.map(({ concepts: _c, questId: _q, ...rest }: T & { questId?: string }) => rest)

describe('assembleWorld — שקילות מול עולם ההדגמה (מה שאינו תלוי תגיות)', () => {
  const demo = buildWorld(FRIDAY)
  const analysisOfDemo = analyze(demo)
  for (const classId of ['c-v2', 'c-d2']) {
    it(`כיתה ${classId}: ימי הלימוד זהים, ו-SessionRec של כל תלמיד×מקצוע זהה (מלבד רמות מושג)`, () => {
      const raw = rawFromDemoClass(demo, classId)
      const live = assembleWorld(raw, FRIDAY)
      expect(live.days).toEqual(demo.days)
      expect(live.live).toBe(true)
      const cls = demo.classes.find((c) => c.id === classId)!
      expect(live.classes).toHaveLength(1)
      expect(live.classes[0]).toMatchObject({ id: classId, grade: cls.grade, gradeLabel: cls.gradeLabel })
      expect(live.students).toHaveLength(cls.studentIds.length)
      for (const sid of cls.studentIds) {
        const st = demo.students.find((s) => s.id === sid)!
        const liveSt = live.students.find((s) => s.id === sid)!
        expect([...liveSt.subjects].sort()).toEqual([...st.subjects].sort())
        for (const sub of st.subjects) {
          const a = demo.data.get(skey(sid, sub))!
          const b = live.data.get(skey(sid, sub))!
          expect(noConcepts(sorted(b.sessions))).toEqual(noConcepts(sorted(a.sessions)))
        }
      }
    })

    it(`כיתה ${classId}: הנגזרות התיאוריות (רמה נוכחית, סדרת רמה, מיקום מול הטווח, התמדה, עקביות) זהות לעולם ההדגמה`, () => {
      const live = analyze(assembleWorld(rawFromDemoClass(demo, classId), FRIDAY), EMPTY_CATALOG)
      const cls = demo.classes.find((c) => c.id === classId)!
      let compared = 0
      for (const sid of cls.studentIds) {
        for (const sub of demo.students.find((s) => s.id === sid)!.subjects) {
          const a = analysisOfDemo.ss.get(skey(sid, sub))!
          const b = live.ss.get(skey(sid, sub))!
          expect(b.sessionsCount).toBe(a.sessionsCount)
          expect(b.currentLevel).toBe(a.currentLevel)
          expect(b.levelSeries).toEqual(a.levelSeries)
          expect(b.positionVsNorm).toBe(a.positionVsNorm)
          expect(b.ageNorm).toEqual(a.ageNorm)
          expect(b.level60).toBe(a.level60)
          expect(b.level90to150).toBe(a.level90to150)
          for (const key of ['persistence', 'consistency'] as const) {
            expect(b.behaviorVectors.find((v) => v.key === key)!.value).toBe(a.behaviorVectors.find((v) => v.key === key)!.value)
          }
          compared++
        }
      }
      expect(compared).toBeGreaterThan(50)
    })
  }

  it('קלט שונה → פלט שונה: סשן שנוסף משנה את הכמות (בדיקת רגישות)', () => {
    const raw = rawFromDemoClass(demo, 'c-v2')
    const before = analyze(assembleWorld(raw, FRIDAY), EMPTY_CATALOG)
    const s = raw.sessions[0]
    raw.sessions.push({ ...s, id: 'extra', questId: 'q-extra', completedAt: s.completedAt })
    raw.quests.push({ id: 'q-extra', subject: 'math' })
    raw.snapshots.push({ sessionId: 'extra', studentId: s.studentId, classId: 'c-v2', subject: 'math', level: 7, success: 0.5 })
    const after = analyze(assembleWorld(raw, FRIDAY), EMPTY_CATALOG)
    const key = skey(s.studentId, 'math')
    expect(after.ss.get(key)!.sessionsCount).toBe(before.ss.get(key)!.sessionsCount + 1)
  })
})

describe('assembleWorld — כיתה ושכבה', () => {
  it('שכבה מ-grade_level; אין ← מהתווית; שם הכיתה מהתווית', () => {
    const w = assembleWorld(emptyClassRaw('c1', { gradeLevel: 7, gradeLabel: 'ז׳3', name: 'כיתה אחרת' }), FRIDAY)
    expect(w.classes[0]).toMatchObject({ id: 'c1', grade: 7, gradeLabel: 'ז׳', name: 'ז׳3' })
    const w2 = assembleWorld(emptyClassRaw('c2', { gradeLevel: null, gradeLabel: 'ו׳2' }), FRIDAY)
    expect(w2.classes[0]).toMatchObject({ grade: 6, gradeLabel: 'ו׳', name: 'ו׳2' })
    const w3 = assembleWorld(emptyClassRaw('c3', { gradeLevel: null, gradeLabel: null, name: 'יא1' }), FRIDAY)
    expect(w3.classes[0].grade).toBe(11)
  })

  it('כיתה בלי שכבה (אין / גן / י"ג) לא נכנסת ומדווחת ב-coverage; המנוע לא קורס', () => {
    for (const over of [{ gradeLevel: null, gradeLabel: 'כיתת הכוכבים', name: 'כיתת הכוכבים' }, { gradeLevel: null, gradeLabel: 'גן', name: 'גן' }, { gradeLevel: null, gradeLabel: 'יג', name: 'יג' }, { gradeLevel: 0, gradeLabel: null, name: null }, { gradeLevel: 13, gradeLabel: 'יג' }]) {
      const raw = emptyClassRaw('c', over)
      raw.members.push({ id: 's1', name: 'תלמיד אחד', classIds: ['c'] })
      const r = assembleWorldDetailed(raw, FRIDAY)
      expect(r.world.classes).toEqual([])
      expect(r.world.students).toEqual([])
      expect(r.coverage.classesWithoutGrade).toBe(1)
      expect(() => analyze(r.world, EMPTY_CATALOG)).not.toThrow()
    }
    expect(gradeOfClass({ gradeLevel: 12, gradeLabel: null, name: null })).toBe(12)
    expect(gradeOfClass({ gradeLevel: null, gradeLabel: null, name: null })).toBeNull()
    expect(gradeLabelOf(7)).toBe('ז׳')
  })

  it('הסקת שכבה מטקסט חופשי: רק ביטוי קפדני של תווית שכבה; כל שם אחר ← null, והכיתה נספרת ב-coverage עם שמה (FX1a)', () => {
    const ok: [string, number][] = [['ז׳3', 7], ["ו'2", 6], ['י״א1', 11], ['יב', 12], ['כיתה ח׳1', 8], ['ט׳ 2', 9], ['ד', 4], ['י1', 10], ['ה׳', 5], ['  ז׳2 ', 7]]
    for (const [text, grade] of ok) expect(gradeFromText(text), text).toBe(grade)
    /* ההסקה הישנה לקחה את האות הראשונה: "בדיקה" ← ב׳, "אלפא" ← א׳, "גיטרה" ← ג׳ ... */
    for (const text of ['בדיקה', 'אלפא', 'גיטרה', 'דקל', 'הרצל', 'כיתת ניסוי', 'מקהלה', 'עברית', 'תגבור מתמטיקה', 'יג', 'גן', '', 'ז׳א', 'ז׳123', 'כיתה']) expect(gradeFromText(text), text).toBeNull()
    expect(gradeFromText(null)).toBeNull()
    expect(gradeFromText(undefined)).toBeNull()
    /* התווית קודמת לשם; תווית שאינה שכבה תקפה (י"ג) לא מסיקים מהשם */
    expect(gradeOfClass({ gradeLevel: null, gradeLabel: 'יג', name: 'ז׳1' })).toBeNull()
    expect(gradeOfClass({ gradeLevel: null, gradeLabel: '', name: 'ז׳1' })).toBe(7)
    expect(gradeOfClass({ gradeLevel: 5, gradeLabel: 'ז׳1', name: 'ז׳1' })).toBe(5)
    expect(gradeOfClass({ gradeLevel: null, gradeLabel: null, name: 'בדיקה' })).toBeNull()
    const r = assembleWorldDetailed(emptyClassRaw('c', { gradeLevel: null, gradeLabel: null, name: 'בדיקה' }), FRIDAY)
    expect(r.world.classes).toEqual([])
    expect(r.coverage).toMatchObject({ classesWithoutGrade: 1, classesWithoutGradeNames: ['בדיקה'] })
  })

  it('כיתה שלא נמצאה (cls=null) → עולם ריק תקין', () => {
    const r = assembleWorldDetailed({ ...emptyClassRaw(), cls: null }, FRIDAY)
    expect(r.world.classes).toEqual([])
    expect(r.world.live).toBe(true)
    expect(() => analyze(r.world, EMPTY_CATALOG)).not.toThrow()
  })

  it('כיתה בלי תלמידים: נכנסת, בלי תלמידים, והמנוע לא קורס', () => {
    const r = assembleWorldDetailed(emptyClassRaw('c1'), FRIDAY)
    expect(r.world.classes).toHaveLength(1)
    expect(r.world.classes[0].studentIds).toEqual([])
    expect(r.coverage.classesTotal).toBe(1)
    expect(r.coverage.studentsTotal).toBe(0)
    const a = analyze(r.world, EMPTY_CATALOG)
    expect(a.ss.size).toBe(0)
  })

  it('מקצועות התלמיד = איחוד מקצועות הסשנים והכיתה; ביניהם נוצר StudentSubjectData ריק; מגדר null; שם פרטי', () => {
    const raw = emptyClassRaw('c1')
    raw.classSubjects = ['history', 'math']
    raw.members.push({ id: 's1', name: 'דנה כהן', classIds: ['c1'] })
    raw.quests.push({ id: 'q1', subject: 'science' })
    raw.sessions.push({ id: 'x1', studentId: 's1', questId: 'q1', completedAt: '2026-03-04T08:00:00Z' })
    raw.snapshots.push({ sessionId: 'x1', studentId: 's1', classId: 'c1', subject: 'science', level: 8, success: 0.7 })
    const w = assembleWorld(raw, FRIDAY)
    const st = w.students[0]
    expect(st.subjects).toEqual(['history', 'math', 'science'])
    expect(st.firstName).toBe('דנה')
    expect(st.displayName).toBe('דנה כהן')
    expect(st.gender).toBeNull()
    expect(st.classId).toBe('c1')
    expect(w.data.get(skey('s1', 'history'))).toEqual({ sessions: [], mc: [], memory: [] })
    expect(w.data.get(skey('s1', 'science'))!.sessions).toHaveLength(1)
    expect(w.classes[0].subjects).toEqual(['history', 'math', 'science'])
    expect(() => analyze(w, EMPTY_CATALOG)).not.toThrow()
  })
})

describe('assembleWorld — סשנים ויום לימוד', () => {
  const base = (completedAt: string, now = new Date('2026-03-12T10:00:00Z')): { date: string; day: number } | null => {
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] })
    raw.quests.push({ id: 'q1', subject: 'math' })
    raw.sessions.push({ id: 'x1', studentId: 's1', questId: 'q1', completedAt })
    raw.snapshots.push({ sessionId: 'x1', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 0.7 })
    const w = assembleWorld(raw, now)
    const rec = w.data.get(skey('s1', 'math'))?.sessions[0]
    return rec ? { date: rec.date, day: rec.day } : null
  }

  it('יום חול בצהריים → אותו יום לימוד; שישי / שבת → חמישי שלפניהם', () => {
    expect(base('2026-03-10T10:00:00Z')!.date).toBe('2026-03-10T12:00:00.000Z') /* שלישי */
    expect(base('2026-03-06T08:00:00Z')!.date).toBe('2026-03-05T12:00:00.000Z') /* שישי */
    expect(base('2026-03-07T20:00:00Z')!.date).toBe('2026-03-05T12:00:00.000Z') /* מוצאי שבת: עדיין שבת בישראל */
  })

  it('לילה בישראל: 00:30 שעון ישראל ביום שני (עדיין ראשון ב-UTC) שייך לשני', () => {
    expect(base('2026-03-08T22:30:00Z')!.date).toBe('2026-03-09T12:00:00.000Z')
    /* ו-23:30 UTC ביום חמישי = שישי בישראל → חמישי */
    expect(base('2026-03-05T23:30:00Z')!.date).toBe('2026-03-05T12:00:00.000Z')
  })

  it('קיץ (יולי-אוגוסט) → יום הלימוד האחרון ביוני', () => {
    const r = base('2026-07-20T09:00:00Z', new Date('2026-10-14T10:00:00Z'))!
    expect(r.date).toBe('2026-06-30T12:00:00.000Z')
  })

  it('סשן מאוחר מהיום האחרון (היום, בשישי) → אינדקס 0; סשן ישן מהאופק → לא נכנס', () => {
    expect(base('2026-03-12T21:00:00Z', new Date('2026-03-13T10:00:00Z'))!.day).toBe(0)
    expect(base('2024-01-01T10:00:00Z')).toBeNull()
  })

  it('הדמיה בלי מקצוע לא נכנסת ונספרת (גם אם ל-snapshot יש מקצוע); חסר snapshot / רמה / הצלחה לא תקינה — נספרים בנפרד', () => {
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] }, { id: 's2', name: 'רון', classIds: ['c1'] })
    raw.quests.push({ id: 'qm', subject: 'math' }, { id: 'qm2', subject: 'math' }, { id: 'qm3', subject: 'math' }, { id: 'qn', subject: null }, { id: 'qs', subject: null })
    const at = '2026-03-04T08:00:00Z'
    raw.sessions.push(
      { id: 'a', studentId: 's1', questId: 'qm', completedAt: at }, /* תקין */
      { id: 'b', studentId: 's1', questId: 'qn', completedAt: at }, /* אין מקצוע */
      { id: 'c', studentId: 's2', questId: 'qs', completedAt: at }, /* אין מקצוע בהדמיה (גם אם ל-snapshot יש): לא מנחשים */
      { id: 'd', studentId: 's2', questId: 'qm', completedAt: at }, /* אין snapshot: הרמה לא חושבה לפי מקצוע */
      { id: 'e', studentId: 's1', questId: 'qm2', completedAt: '2026-03-03T08:00:00Z' }, /* הצלחה לא תקינה */
      { id: 'f', studentId: 's1', questId: 'qm3', completedAt: '2026-03-02T08:00:00Z' }, /* רמה מחוץ לטווח */
      { id: 'g', studentId: 'not-a-member', questId: 'qm', completedAt: at },
    )
    raw.snapshots.push(
      { sessionId: 'a', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 0.7 },
      { sessionId: 'b', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 0.7 },
      { sessionId: 'c', studentId: 's2', classId: 'c1', subject: 'history', level: 6, success: 0.6 },
      { sessionId: 'e', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 3 },
      { sessionId: 'f', studentId: 's1', classId: 'c1', subject: 'math', level: 99, success: 0.5 },
    )
    const r = assembleWorldDetailed(raw, FRIDAY)
    expect(r.coverage).toMatchObject({ sessionsTotal: 6, unclassifiedSessions: 2, sessionsWithoutSubjectLevel: 1, sessionsUsed: 1, sessionsWithoutLevel: 2, repeatSessions: 0 })
    /* כל משחק בקטגוריה אחת בדיוק */
    const c = r.coverage
    expect(c.sessionsUsed + c.unclassifiedSessions + c.sessionsWithoutSubjectLevel + c.sessionsWithoutLevel + c.repeatSessions).toBe(c.sessionsTotal)
    expect(c.unclassifiedSessionIds?.sort()).toEqual(['b', 'c'])
    expect(c.sessionsWithoutSubjectLevelIds).toEqual(['d'])
    expect(r.world.data.get(skey('s1', 'math'))!.sessions).toHaveLength(1)
    expect(r.world.data.get(skey('s2', 'history'))).toBeUndefined()
    expect(r.world.students.find((s) => s.id === 's1')!.subjects).toEqual(['math'])
  })

  it('רמה מפרופיל שאינו של המקצוע לא נכנסת לסדרת המקצוע: snapshot בלי subject_id או עם מקצוע אחר נספר, ולא יוצר סדרה', () => {
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] })
    raw.quests.push({ id: 'q1', subject: 'math' }, { id: 'q2', subject: 'math' }, { id: 'q3', subject: 'math' })
    const at = (d: number): string => `2026-03-0${d}T08:00:00Z`
    raw.sessions.push(
      { id: 'old', studentId: 's1', questId: 'q1', completedAt: at(2) }, /* הכיול הגלובלי (לפני שהדמיה שויכה למקצוע): בלי subject_id */
      { id: 'wrong', studentId: 's1', questId: 'q2', completedAt: at(3) }, /* subject_id של מקצוע אחר */
      { id: 'good', studentId: 's1', questId: 'q3', completedAt: at(4) },
    )
    raw.snapshots.push(
      { sessionId: 'old', studentId: 's1', classId: 'c1', subject: null, level: 14, success: 0.7 },
      { sessionId: 'wrong', studentId: 's1', classId: 'c1', subject: 'history', level: 14, success: 0.7 },
      { sessionId: 'good', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 0.7 },
    )
    const r = assembleWorldDetailed(raw, FRIDAY)
    expect(r.coverage).toMatchObject({ sessionsTotal: 3, sessionsUsed: 1, sessionsWithoutSubjectLevel: 2 })
    expect(r.coverage.sessionsWithoutSubjectLevelIds?.sort()).toEqual(['old', 'wrong'])
    const d = r.world.data.get(skey('s1', 'math'))!
    expect(d.sessions.map((x) => x.level)).toEqual([8]) /* הקפיצה 14 → 8 לא קיימת בסדרה */
    expect(r.world.data.get(skey('s1', 'history'))).toBeUndefined()
    /* אחרי ששיוך מקצוע בדיעבד מוסיף subject_id לסשנים החדשים בלבד, ההיסטוריים נשארים מחוץ לסדרה */
    expect(analyze(r.world, EMPTY_CATALOG).ss.get(skey('s1', 'math'))!.sessionsCount).toBe(1)
  })

  it('סשנים כפולים באותו מזהה נספרים פעם אחת', () => {
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] })
    raw.quests.push({ id: 'q', subject: 'math' })
    const s = { id: 'a', studentId: 's1', questId: 'q', completedAt: '2026-03-04T08:00:00Z' }
    raw.sessions.push(s, { ...s })
    raw.snapshots.push({ sessionId: 'a', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 0.7 })
    const r = assembleWorldDetailed(raw, FRIDAY)
    expect(r.world.data.get(skey('s1', 'math'))!.sessions).toHaveLength(1)
    expect(r.coverage.repeatSessions).toBe(0)
  })
})

describe('assembleWorld — ריפליי: רק ההשלמה הראשונה נכנסת', () => {
  it('השלמה חוזרת של אותה הדמיה לא נכנסת לסדרת הרמה וההצלחה, ולא לתשובות / הקריאה / ההתמדה; היא נספרת ב-coverage', () => {
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] })
    raw.quests.push({ id: 'q', subject: 'math' })
    raw.sessions.push(
      { id: 'late', studentId: 's1', questId: 'q', completedAt: '2026-03-04T08:00:00Z' },
      { id: 'early', studentId: 's1', questId: 'q', completedAt: '2026-03-02T08:00:00Z' },
    )
    raw.snapshots.push(
      { sessionId: 'early', studentId: 's1', classId: 'c1', subject: 'math', level: 7, success: 0.5 },
      { sessionId: 'late', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 0.9 },
    )
    const mc = (sessionId: string): RawAnswer => ({ sessionId, sceneId: 'x', itemIndex: 0, puzzleType: 'multipleChoice', selectedPosition: 0, correctPosition: 1, displayedCount: 4, outcome: 'wrong' })
    raw.answers.push(mc('early'), mc('late'), { ...mc('late'), puzzleType: 'tileSwap', sceneId: 'y', outcome: 'gave_up' }, { ...mc('early'), puzzleType: 'tileSwap', sceneId: 'z', outcome: 'gave_up' })
    raw.sceneEnters.push({ sessionId: 'early', sceneId: 's1', wordCount: 40, closedMs: 8000 }, { sessionId: 'late', sceneId: 's1', wordCount: 40, closedMs: 800 })
    const r = assembleWorldDetailed(raw, FRIDAY)
    const d = r.world.data.get(skey('s1', 'math'))!
    expect(d.sessions).toHaveLength(1)
    expect(d.mc).toHaveLength(1)
    expect(d.sessions[0]).toMatchObject({ level: 7, success: 0.5, words: 40, closedMs: 8000, scenes: 1, retries: { afterFail: 0, giveUps: 1 } })
    expect(r.coverage).toMatchObject({ sessionsTotal: 2, sessionsUsed: 1, repeatSessions: 1 })
    expect(firstCompletionIds(raw.sessions)).toEqual(new Set(['early']))
  })

  it('ההשלמה הראשונה בלי מקצוע ברמה — החוזרת לא "יורשת" את מקומה בסדרה', () => {
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] })
    raw.quests.push({ id: 'q', subject: 'math' })
    raw.sessions.push(
      { id: 'first', studentId: 's1', questId: 'q', completedAt: '2026-03-02T08:00:00Z' },
      { id: 'again', studentId: 's1', questId: 'q', completedAt: '2026-03-04T08:00:00Z' },
    )
    raw.snapshots.push(
      { sessionId: 'first', studentId: 's1', classId: 'c1', subject: null, level: 7, success: 0.5 },
      { sessionId: 'again', studentId: 's1', classId: 'c1', subject: 'math', level: 9, success: 0.9 },
    )
    const r = assembleWorldDetailed(raw, FRIDAY)
    expect(r.world.data.get(skey('s1', 'math'))).toBeUndefined()
    expect(r.coverage).toMatchObject({ sessionsUsed: 0, sessionsWithoutSubjectLevel: 1, repeatSessions: 1 })
  })

  it('firstCompletionIds: לפי תלמיד×הדמיה; שוויון ברגע ההשלמה — מזהה קטן', () => {
    const ids = firstCompletionIds([
      { id: 'b', studentId: 's', questId: 'q', completedAt: '2026-03-01T00:00:00Z' },
      { id: 'a', studentId: 's', questId: 'q', completedAt: '2026-03-01T00:00:00Z' },
      { id: 'c', studentId: 's', questId: 'q2', completedAt: '2026-03-05T00:00:00Z' },
      { id: 'd', studentId: 't', questId: 'q', completedAt: '2026-03-06T00:00:00Z' },
    ])
    expect(ids).toEqual(new Set(['a', 'c', 'd']))
  })
})

describe('assembleWorld — תשובות (בחירה מרובה) והטיית מיקום', () => {
  const rawWith = (answers: RawAnswer[]): RawClassData => {
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] })
    raw.quests.push({ id: 'q', subject: 'math' })
    raw.sessions.push({ id: 'x', studentId: 's1', questId: 'q', completedAt: '2026-03-04T08:00:00Z' })
    raw.snapshots.push({ sessionId: 'x', studentId: 's1', classId: 'c1', subject: 'math', level: 8, success: 0.7 })
    raw.answers = answers
    return raw
  }
  const a = (over: Partial<RawAnswer>): RawAnswer => ({ sessionId: 'x', sceneId: 'sc', itemIndex: 0, puzzleType: 'multipleChoice', selectedPosition: 2, correctPosition: 1, displayedCount: 4, outcome: 'wrong', ...over })

  it('multipleChoice / finalQuiz נכנסים; trueFalse, חסרי מיקום, סגורים וטווח לא תקין — לא', () => {
    const w = assembleWorld(rawWith([
      a({ itemIndex: 0 }), a({ itemIndex: 1, puzzleType: 'finalQuiz', outcome: 'correct', selectedPosition: 1 }),
      a({ puzzleType: 'trueFalse' }), a({ selectedPosition: null }), a({ correctPosition: null }), a({ displayedCount: null }), a({ displayedCount: 1 }),
      a({ outcome: 'closed' }), a({ outcome: 'timeout' }), a({ selectedPosition: 4 }), a({ selectedPosition: -1 }),
    ]), FRIDAY)
    const mc = w.data.get(skey('s1', 'math'))!.mc
    expect(mc).toHaveLength(2)
    expect(mc[0]).toMatchObject({ k: 4, correctPos: 1, selectedPos: 2, correct: false, exposure: null, tag: null })
    expect(mc.find((m) => m.correct)).toMatchObject({ selectedPos: 1, correctPos: 1 })
  })

  it('התמדה: רק סוגים רב-ניסיוניים; כישלון = שגוי / זמן / ויתור; סגור ובחירה מרובה לא נספרים', () => {
    expect(retriesOfAnswers([
      a({ puzzleType: 'memory', outcome: 'wrong' }), a({ puzzleType: 'tileSwap', outcome: 'timeout' }), a({ puzzleType: 'wordSearch', outcome: 'gave_up' }),
      a({ puzzleType: 'hangman', outcome: 'correct' }), a({ puzzleType: 'memory', outcome: 'closed' }), a({ puzzleType: 'multipleChoice', outcome: 'wrong' }),
    ])).toEqual({ afterFail: 2, giveUps: 1 })
  })

  it('תשובות חסרות לגמרי: אין mc, אין זיכרון, התמדה אפס — והמנוע לא קורס', () => {
    const w = assembleWorld(rawWith([]), FRIDAY)
    const d = w.data.get(skey('s1', 'math'))!
    expect(d.mc).toEqual([])
    expect(d.memory).toEqual([])
    expect(d.sessions[0].retries).toEqual({ afterFail: 0, giveUps: 0 })
    expect(() => analyze(w, EMPTY_CATALOG)).not.toThrow()
  })

  it('רמת מושג נגזרת: בלי תגיות — ריק; עם תגיות — ממוצע הקושי ± צעד 60/80', () => {
    expect(conceptLevelsOfSession([{ conceptKey: null, correct: true, difficulty: 8 }, { conceptKey: undefined, correct: false, difficulty: 8 }])).toEqual({})
    const items = (ok: number, n: number, diff: number) => Array.from({ length: n }, (_, i) => ({ conceptKey: 'math.fractions.add', correct: i < ok, difficulty: diff }))
    expect(conceptLevelsOfSession(items(5, 5, 8))).toEqual({ 'math.fractions.add': 9 })
    expect(conceptLevelsOfSession(items(2, 5, 8))).toEqual({ 'math.fractions.add': 7 })
    expect(conceptLevelsOfSession(items(7, 10, 8))).toEqual({ 'math.fractions.add': 8 })
    expect(conceptLevelsOfSession(items(1, 1, 8))).toEqual({}) /* פחות משני פריטים */
    expect(conceptLevelsOfSession(items(5, 5, 20))).toEqual({ 'math.fractions.add': 20 }) /* חסום ב-20 */
  })
})

describe('readingOfSession', () => {
  it('סצנות בלי אתגר בלבד, עם מילים וזמן; אירועים חסרי נתון נזרקים', () => {
    const r = readingOfSession([
      { sessionId: 's', sceneId: 'a', wordCount: 30, closedMs: 6000 },
      { sessionId: 's', sceneId: 'b', wordCount: 50, closedMs: 9000 },
      { sessionId: 's', sceneId: 'p', wordCount: 40, closedMs: 60000 }, /* סצנה עם אתגר */
      { sessionId: 's', sceneId: 'c', wordCount: null, closedMs: 1000 },
      { sessionId: 's', sceneId: 'd', wordCount: 0, closedMs: 1000 },
      { sessionId: 's', sceneId: 'e', wordCount: 20, closedMs: null },
      { sessionId: 's', sceneId: null, wordCount: 20, closedMs: 1000 },
    ], new Set(['p']))
    expect(r).toEqual({ scenes: 2, words: 80, closedMs: 15000 })
  })
  it('אין אירועים → אפסים (סשנים ישנים בלי word_count לא נכנסים לקריאה)', () => {
    expect(readingOfSession([], new Set())).toEqual({ scenes: 0, words: 0, closedMs: 0 })
  })
})

/* ── ריפליי זיכרון מול סימולציה: אותו מודל כמו simulateMemory, עם הפקת היפוכים ── */
function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function simulate(pairs: number, attention: number, rng: () => number): { turns: { avail: boolean; hit: boolean; pRandom: number }[]; flips: RawMemoryFlip[] } {
  const total = pairs * 2
  const partner = (c: number): number => c ^ 1
  const matched = new Set<number>(), known = new Set<number>()
  const turns: { avail: boolean; hit: boolean; pRandom: number }[] = []
  const flips: RawMemoryFlip[] = []
  let t = 0, guard = 0
  const flip = (c: number): void => { flips.push({ card: c, pair: c >> 1, t: (t += 700) }) }
  while (matched.size < total && guard++ < 500) {
    const unmatched = [...Array(total).keys()].filter((c) => !matched.has(c))
    const first = unmatched[Math.floor(rng() * unmatched.length)]
    const rest = unmatched.filter((c) => c !== first)
    if (known.has(partner(first))) {
      const hit = rest.length === 1 || rng() < attention /* שני קלפים אחרונים — אין מה לבחור */
      turns.push({ avail: true, hit, pRandom: 1 / rest.length })
      flip(first)
      if (hit) { flip(partner(first)); matched.add(first); matched.add(partner(first)); known.delete(partner(first)) } else {
        const others = rest.filter((c) => c !== partner(first))
        const second = others[Math.floor(rng() * others.length)]
        flip(second); known.add(first); known.add(second)
      }
    } else {
      const second = rest[Math.floor(rng() * rest.length)]
      turns.push({ avail: false, hit: second === partner(first), pRandom: 1 / rest.length })
      flip(first); flip(second)
      if (second === partner(first)) { matched.add(first); matched.add(second) } else { known.add(first); known.add(second) }
    }
  }
  return { turns, flips }
}

describe('replayMemory — שחזור תורות מהיפוכים', () => {
  it('משחקים מדומים (2–14 זוגות, קשב שונה): avail / hit / pRandom מתאימים בדיוק, עם ובלי מספר הקלפים', () => {
    let games = 0
    for (let seed = 1; seed <= 60; seed++) {
      const rng = mulberry(seed)
      const pairs = 2 + (seed % 13)
      const sim = simulate(pairs, [0.05, 0.4, 0.8, 0.95][seed % 4], rng)
      expect(replayMemory(sim.flips, pairs * 2)).toEqual(sim.turns)
      expect(replayMemory(sim.flips, null)).toEqual(sim.turns) /* משחק מלא: כל הזוגות נחשפו ← האומדן מדויק */
      games++
    }
    expect(games).toBe(60)
  })

  it('היפוכים לא ממוינים → ממוינים לפי t; היפוך יתום בסוף נזרק; ערכים לא תקינים נזרקים', () => {
    const sim = simulate(4, 0.6, mulberry(7))
    const shuffled = [...sim.flips].reverse()
    expect(replayMemory(shuffled, 8)).toEqual(sim.turns)
    expect(replayMemory([...sim.flips, { card: 0, pair: 0, t: 1e9 }], 8)).toEqual(sim.turns)
    expect(replayMemory([...sim.flips, { card: Number.NaN, pair: 0, t: 1e9 }, { card: 1, pair: 0, t: Number.POSITIVE_INFINITY }], 8)).toEqual(sim.turns)
    expect(replayMemory([], 8)).toEqual([])
    expect(replayMemory([{ card: 0, pair: 0, t: 1 }], 8)).toEqual([])
  })

  it('משחק שנחתך (רק ההיפוכים הראשונים) — תורות שלמות בלבד', () => {
    const sim = simulate(6, 0.7, mulberry(3))
    const cut = sim.flips.slice(0, 11)
    expect(replayMemory(cut, 12)).toEqual(sim.turns.slice(0, 5))
  })

  it('מספר קלפים קטן מהאומדן (נתון שגוי) → האומדן גובר, בלי pRandom שלילי', () => {
    const sim = simulate(5, 0.5, mulberry(11))
    const turns = replayMemory(sim.flips, 2)
    expect(turns).toEqual(sim.turns)
    for (const t of turns) { expect(t.pRandom).toBeGreaterThan(0); expect(t.pRandom).toBeLessThanOrEqual(1) }
  })

  it('משחקי זיכרון נכנסים ל-World מההשלמה הראשונה בלבד, ותור שלא נגזר נזרק', () => {
    const raw = emptyClassRaw('c1')
    raw.members.push({ id: 's1', name: 'דנה', classIds: ['c1'] })
    raw.quests.push({ id: 'q', subject: 'science' })
    raw.sessions.push(
      { id: 'first', studentId: 's1', questId: 'q', completedAt: '2026-03-02T08:00:00Z' },
      { id: 'replay', studentId: 's1', questId: 'q', completedAt: '2026-03-04T08:00:00Z' },
    )
    for (const id of ['first', 'replay']) raw.snapshots.push({ sessionId: id, studentId: 's1', classId: 'c1', subject: 'science', level: 8, success: 0.7 })
    const sim = simulate(4, 0.7, mulberry(5))
    raw.memory.push(
      { sessionId: 'first', sceneId: 'm', itemIndex: 0, flips: sim.flips, totalCards: 8 },
      { sessionId: 'replay', sceneId: 'm', itemIndex: 0, flips: sim.flips, totalCards: 8 },
      { sessionId: 'first', sceneId: 'm2', itemIndex: 0, flips: [], totalCards: null },
    )
    const mem = assembleWorld(raw, FRIDAY).data.get(skey('s1', 'science'))!.memory
    expect(mem).toHaveLength(1)
    expect(mem[0].turns).toEqual(sim.turns)
    expect(mem[0].date).toBe('2026-03-02T12:00:00.000Z')
  })
})

describe('assembleWorld — תלמיד בכמה כיתות', () => {
  it('הכיתה העיקרית: הכי הרבה סשנים לפי class_id של ה-snapshot; שוויון / בלי סשנים — מזהה קטן', () => {
    const raw = emptyClassRaw('c-b')
    raw.members.push(
      { id: 's1', name: 'א', classIds: ['c-a', 'c-b'] },
      { id: 's2', name: 'ב', classIds: ['c-a', 'c-b'] },
      { id: 's3', name: 'ג', classIds: ['c-b'] },
    )
    raw.quests.push({ id: 'q1', subject: 'math' }, { id: 'q2', subject: 'math' }, { id: 'q3', subject: 'math' })
    const ses = (id: string, studentId: string, questId: string, day: string) => raw.sessions.push({ id, studentId, questId, completedAt: `2026-03-0${day}T08:00:00Z` })
    ses('a1', 's1', 'q1', '2'); ses('a2', 's1', 'q2', '3'); ses('a3', 's1', 'q3', '4')
    ses('b1', 's2', 'q1', '2'); ses('b2', 's2', 'q2', '3')
    raw.snapshots.push(
      { sessionId: 'a1', studentId: 's1', classId: 'c-b', subject: 'math', level: 8, success: 0.7 },
      { sessionId: 'a2', studentId: 's1', classId: 'c-b', subject: 'math', level: 8, success: 0.7 },
      { sessionId: 'a3', studentId: 's1', classId: 'c-a', subject: 'math', level: 8, success: 0.7 },
      { sessionId: 'b1', studentId: 's2', classId: 'c-a', subject: 'math', level: 8, success: 0.7 },
      { sessionId: 'b2', studentId: 's2', classId: 'c-b', subject: 'math', level: 8, success: 0.7 },
    )
    const r = assembleWorldDetailed(raw, FRIDAY)
    expect(r.primaryClassOf.get('s1')).toBe('c-b') /* 2 מול 1 */
    expect(r.primaryClassOf.get('s2')).toBe('c-a') /* 1 מול 1 → מזהה קטן */
    expect(r.primaryClassOf.has('s3')).toBe(false)
    expect(r.coverage.studentsInMultipleClasses).toBe(2)
    /* תלמיד כזה נשאר ברשימת הכיתה (לא נעלם מהמורה) והסשנים שלו כוללים כל הכיתות */
    expect(r.world.classes[0].studentIds).toEqual(['s1', 's2', 's3'])
    expect(r.world.data.get(skey('s1', 'math'))!.sessions).toHaveLength(3)
  })
})

describe('coverage — השדות של FX1a במיזוג בין כיתות', () => {
  it('משחקים בלי רמה לפי מקצוע: ייחודיים לפי מזהה (תלמיד בשתי כיתות נספר פעם אחת); חוזרות נסכמות; שמות כיתות בלי כפילות', () => {
    const a = { ...emptyCoverage(), sessionsWithoutSubjectLevel: 2, sessionsWithoutSubjectLevelIds: ['x', 'y'], repeatSessions: 1, classesWithoutGrade: 1, classesWithoutGradeNames: ['חוג'] }
    const b = { ...emptyCoverage(), sessionsWithoutSubjectLevel: 2, sessionsWithoutSubjectLevelIds: ['y', 'z'], repeatSessions: 2, classesWithoutGrade: 1, classesWithoutGradeNames: ['חוג'] }
    const sum = sumCoverage([a, b])
    expect(sum.sessionsWithoutSubjectLevel).toBe(3)
    expect(sum.sessionsWithoutSubjectLevelIds?.sort()).toEqual(['x', 'y', 'z'])
    expect(sum.repeatSessions).toBe(3)
    expect(sum.classesWithoutGrade).toBe(2)
    expect(sum.classesWithoutGradeNames).toEqual(['חוג'])
    /* בלי מזהים באחד החלקים: סכום פשוט */
    expect(sumCoverage([a, { ...b, sessionsWithoutSubjectLevelIds: undefined }]).sessionsWithoutSubjectLevel).toBe(4)
    expect(sumCoverage([]).sessionsWithoutSubjectLevel).toBe(0)
  })
})

describe('assembleWorld — עולם חי דל: המנוע רץ ואין ממצאים', () => {
  it('מעט סשנים בלי תשובות / קריאה / זיכרון → כל הממצאים insufficient או חסרים, ווקטורי תוכן ריקים', () => {
    const raw = emptyClassRaw('c1')
    raw.classSubjects = ['math', 'history']
    for (let i = 0; i < 4; i++) {
      raw.members.push({ id: `s${i}`, name: `תלמיד ${i}`, classIds: ['c1'] })
      raw.quests.push({ id: `q${i}`, subject: 'math' })
      raw.sessions.push({ id: `x${i}`, studentId: `s${i}`, questId: `q${i}`, completedAt: `2026-03-0${2 + (i % 3)}T08:00:00Z` })
      raw.snapshots.push({ sessionId: `x${i}`, studentId: `s${i}`, classId: 'c1', subject: 'math', level: 6 + i, success: 0.6 + i * 0.1 })
    }
    const w = assembleWorld(raw, FRIDAY)
    const a = analyze(w, EMPTY_CATALOG)
    expect(a.reportedKeys.size).toBe(0)
    for (const sa of a.ss.values()) {
      expect(sa.findings.filter((f) => f.status === 'reported')).toEqual([])
      expect(sa.contentVectors).toEqual([]) /* אין קטלוג → אין וקטורי תוכן */
    }
    expect(a.classFindings.size).toBe(0)
    expect(a.misByClass.size).toBe(0)
    expect(a.ss.get(skey('s0', 'math'))!.currentLevel).not.toBeNull()
    expect(a.ss.get(skey('s0', 'history'))!.currentLevel).toBeNull()
    /* גם מול קטלוג ההדגמה (מושגים שאין להם נתונים) — לא קורס ולא ממציא */
    const withDemo = analyze(w, DEMO_CATALOG)
    expect(withDemo.reportedKeys.size).toBe(0)
  })

  it('המחצית: באוקטובר (פחות מ-60 ימי לימוד) term=null; בפברואר מחצית ב׳ קיימת', () => {
    expect(assembleWorld(emptyClassRaw(), new Date('2026-10-14T10:00:00Z')).term).toBeNull()
    const feb = assembleWorld(emptyClassRaw(), new Date('2027-05-10T10:00:00Z'))
    expect(feb.term).not.toBeNull()
    expect(buildSchoolDays(new Date('2026-10-14T10:00:00Z'), 260, 0)[0]).toBe('2026-10-14T12:00:00.000Z')
  })
})
