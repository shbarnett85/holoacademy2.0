/* F1: תווית המגמה (משתפר/ת · יציב/ה · בירידה) דורשת מינימום משחקים בכל אחד משני החלונות (TREND_LABEL_MIN_SESSIONS) — גם לתלמיד/ה וגם לכל תת-קבוצה.
   בלי הסף, תלמיד/ה עם שלושה משחקים (שניים בחלון האחרון, אחד לפניו) קיבל/ה "משתפר/ת" בעוד שממצא מגמה מדווח דורש הרבה יותר. */
import { describe, expect, it } from 'vitest'
import { GROUP_TREND_MIN_STUDENTS, MIN_CELL_SIZE, TREND_LABEL_MIN_DELTA, TREND_LABEL_MIN_SESSIONS } from '../../../../src/shared/lib/analyticsConfig.js'
import { narrateStudentsTabSummary } from '../../../../src/shared/lib/findingsNarrative.js'
import type { SessionRec } from './demoWorld.js'
import { groupTrend, studentTrend, trendDelta } from './derive.js'
import { analyze } from './engine.js'
import { createProvider } from './providerCore.js'
import { CA, CB, adminViewer, fakeSource, grant, ids, live, mkSession, world } from './providerTestkit.js'

/* ── הפונקציות הטהורות ── */
describe('derive: סף משחקים לתווית המגמה', () => {
  const s = (a: number | null, an: number | undefined, b: number | null, bn: number | undefined) => ({ level60: a, level60N: an, level90to150: b, level90to150N: bn })

  it('הסף הוא 3 לכל צד', () => {
    expect(TREND_LABEL_MIN_SESSIONS).toBe(3)
  })
  it('שני משחקים בחלון האחרון ואחד לפניו, הפרש 2.2 רמות: אין מגמה (לא "משתפר/ת")', () => {
    expect(trendDelta(s(11, 2, 8.8, 1))).toBeNull()
    expect(studentTrend(s(11, 2, 8.8, 1))).toBe('insufficient')
  })
  it('כל צד לחוד מספיק כדי להפיל: חלון אחרון דל / חלון קודם דל', () => {
    expect(studentTrend(s(11, 2, 9, 6))).toBe('insufficient')
    expect(studentTrend(s(11, 6, 9, 2))).toBe('insufficient')
  })
  it('בדיוק הסף בשני הצדדים: המגמה נקבעת לפי ההפרש (שיפור / ירידה / יציב)', () => {
    expect(studentTrend(s(11, 3, 9, 3))).toBe('improving')
    expect(studentTrend(s(8, 3, 9.5, 3))).toBe('declining')
    expect(studentTrend(s(9.2, 3, 9, 3))).toBe('steady')
    expect(trendDelta(s(11, 3, 9, 3))).toBe(2)
  })
  it('קלט בלי ספירות (קריאה טהורה): ללא הגבלה — תאימות לבדיקות ולקוראים שאינם מניתוח', () => {
    expect(studentTrend({ level60: 11, level90to150: 9 })).toBe('improving')
    expect(studentTrend({ level60: 11, level90to150: null })).toBe('insufficient')
  })
  it('תת-קבוצה: דורשת GROUP_TREND_MIN_STUDENTS תלמידים שעומדים בסף, לא רק שיש להם ממוצעים', () => {
    expect(GROUP_TREND_MIN_STUDENTS).toBe(3)
    const sparse = Array.from({ length: 6 }, () => s(11, 2, 9, 2)) /* שישה תלמידים, לכולם הפרש 2 — אך אצל כולם שני משחקים בחלון */
    expect(groupTrend(sparse)).toBe('insufficient')
    const twoOk = [s(11, 5, 9, 5), s(11, 5, 9, 5), ...Array.from({ length: 4 }, () => s(11, 1, 9, 5))]
    expect(groupTrend(twoOk)).toBe('insufficient') /* רק 2 עומדים בסף */
    const threeOk = [s(11, 5, 9, 5), s(11, 4, 9, 4), s(11, 3, 9, 3), ...Array.from({ length: 3 }, () => s(11, 1, 9, 5))]
    expect(groupTrend(threeOk)).toBe('improving')
  })
  it('הסף של ההפרש (חצי רמה) לא השתנה', () => {
    expect(TREND_LABEL_MIN_DELTA).toBe(0.5)
  })
})

/* ── המנוע: הספירות ── */
describe('engine: level60N / level90to150N', () => {
  const sess = (days: number[], level: number): SessionRec[] => days.map((d) => mkSession(d, 0.7, level))
  it('נספרים המשחקים בחלון 0–59 ובחלון 90–149 בלבד (60–89 ו-150+ לא נכללים)', () => {
    const w = world([CA], [{ id: 'x', classId: CA.id, subjects: ['math'], sessions: () => [...sess([0, 10, 59], 11), ...sess([60, 75, 89], 5), ...sess([90, 100, 149, 150, 199], 9)] }])
    const sa = analyze(w).ss.get('x|math') ?? [...analyze(w).ss.values()][0]
    expect(sa.level60N).toBe(3)
    expect(sa.level90to150N).toBe(3)
    expect(sa.level60).toBe(11)
    expect(sa.level90to150).toBe(9)
  })
  it('בלי משחקים בחלון: ספירה 0 והממוצע null', () => {
    const w = world([CA], [{ id: 'x', classId: CA.id, subjects: ['math'], sessions: () => sess([0, 5], 9) }])
    const sa = [...analyze(w).ss.values()][0]
    expect(sa.level90to150N).toBe(0)
    expect(sa.level90to150).toBeNull()
  })
})

/* ── הספק: לוח התלמיד, מסך המקצוע, המשוב והמנהל ── */
describe('providerCore: תווית המגמה בכל המסכים עוברת דרך אותו סף', () => {
  const v = live([grant(CA.id, { homeroom: true })])
  /* sparse: שני משחקים בחלון האחרון, אחד בחלון הקודם — הפרש 2.2 רמות. enough: שלושה בכל חלון — הפרש 2 רמות */
  const sparse = (): SessionRec[] => [mkSession(5, 0.7, 11), mkSession(20, 0.7, 11), mkSession(100, 0.7, 8.8)]
  const enough = (): SessionRec[] => [mkSession(5, 0.7, 11), mkSession(20, 0.7, 11), mkSession(40, 0.7, 11), mkSession(100, 0.7, 9), mkSession(120, 0.7, 9), mkSession(140, 0.7, 9)]
  const w = world([CA], [
    { id: 'sp', classId: CA.id, subjects: ['math'], sessions: sparse },
    { id: 'ok', classId: CA.id, subjects: ['math'], sessions: enough },
  ])
  const P = createProvider(fakeSource(analyze(w)))

  it('לוח התלמיד: דל = "אין עדיין מספיק נתונים"; מספיק = "משתפר/ת"', async () => {
    const sp = (await P.student(v, 'sp')).data.panels[0]
    const ok = (await P.student(v, 'ok')).data.panels[0]
    if (sp.access !== 'visible' || ok.access !== 'visible') throw new Error('expected visible panels')
    expect(sp.trend).toBe('insufficient')
    expect(ok.trend).toBe('improving')
  })

  it('מסך המקצוע: שורת התלמיד הדל והמגמה הכיתתית (פחות מ-3 עומדים בסף → אין עדיין מספיק נתונים)', async () => {
    const view = (await P.classSubject(v, CA.id, 'math')).data
    expect(view.students.find((s) => s.id === 'sp')!.trend).toBe('insufficient')
    expect(view.students.find((s) => s.id === 'ok')!.trend).toBe('improving')
    expect(view.trend).toBe('insufficient')
    /* משפט הסיכום סופר את הדל כ"אין עדיין מספיק נתונים", לא כמשתפר: 1 מתוך 2 */
    expect(view.tabSummaries.students).toBe(narrateStudentsTabSummary({ total: 2, improving: 1, steady: 0, declining: 0 }))
  })

  it('המשוב לתלמיד/ה: פריט "צמיחה" רק למי שעומד/ת בסף', async () => {
    expect((await P.feedback(v, 'sp')).data.items.some((i) => i.kind === 'growth')).toBe(false)
    expect((await P.feedback(v, 'ok')).data.items.some((i) => i.kind === 'growth')).toBe(true)
  })

  it('כיתה שבה כולם דלים: מגמת הכיתה ושורות התלמידים "אין עדיין מספיק נתונים", גם כשיש הרבה ממוצעים', async () => {
    const all = world([CA], ids('s', 6).map((id) => ({ id, classId: CA.id, subjects: ['math'] as ['math'], sessions: sparse })))
    const view = (await createProvider(fakeSource(analyze(all))).classSubject(v, CA.id, 'math')).data
    expect(view.students).toHaveLength(6)
    expect(view.students.every((s) => s.trend === 'insufficient')).toBe(true)
    expect(view.trend).toBe('insufficient')
  })

  it('תמונת המנהל: תא שכל תורמיו דלים — מגמה "אין עדיין מספיק נתונים" ושינוי 0 (גם כשיש ≥ MIN_CELL_SIZE ממוצעים)', async () => {
    const half = Math.ceil(MIN_CELL_SIZE / 2) + 1
    const school = world([CA, CB], [
      ...ids('a', half).map((id) => ({ id, classId: CA.id, subjects: ['math'] as ['math'], sessions: sparse })),
      ...ids('b', half).map((id) => ({ id, classId: CB.id, subjects: ['math'] as ['math'], sessions: sparse })),
    ])
    const cell = (await createProvider(fakeSource(analyze(school))).admin(adminViewer)).data.cells[0]
    expect(cell.status).toBe('shown')
    if (cell.status === 'shown') { expect(cell.trend).toBe('insufficient'); expect(cell.trendDelta).toBe(0) }
    /* ואותו תא עם משחקים מספיקים: המגמה מדווחת */
    const full = world([CA, CB], [
      ...ids('a', half).map((id) => ({ id, classId: CA.id, subjects: ['math'] as ['math'], sessions: enough })),
      ...ids('b', half).map((id) => ({ id, classId: CB.id, subjects: ['math'] as ['math'], sessions: enough })),
    ])
    const c2 = (await createProvider(fakeSource(analyze(full))).admin(adminViewer)).data.cells[0]
    expect(c2.status === 'shown' && c2.trend).toBe('improving')
  })
})
