/* FX1b: סף N לטענות רמה (אישי / כיתתי / מנהל), משוב בלי מקצוע גלוי, תדריך כיתה ריק למחנך, חלון הראיות בתדריך, והערות כיסוי (כיתה בלי שכבה / שלא נטענה / משחקים בלי רמה). */
import { describe, expect, it } from 'vitest'
import { CLASS_LEVEL_MIN_STUDENTS, PERSONAL_LEVEL_MIN_SESSIONS } from '../../../../src/shared/lib/analyticsConfig.js'
import {
  ATTENTION_THIN_TEXT, NO_DATA_YET, V2_CLIENT_TEXT, monthYear, narrateAdminGradeSummary, narrateCoverageGaps, narrateDifficultyBelow, narrateNoOpenSubjectNote, narrateOverviewSummary,
  narrateSubjectHeadline, narrateUnclassifiedNote,
} from '../../../../src/shared/lib/findingsNarrative.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { EP } from '../../../../src/shared/types/analyticsV2.js'
import type { World } from './demoWorld.js'
import { analyze } from './engine.js'
import { createProvider } from './providerCore.js'
import { CA, CB, CD, DAYS, adminViewer, ceiling, fakeSource, grant, ids, live, mkSession, world } from './providerTestkit.js'
import type { SourceCoverage } from './source.js'

const providerOf = (w: World, over = {}) => createProvider(fakeSource(analyze(w), over))
/* n משחקים ברמה קבועה (מרווחים של 3 ימי לימוד) */
const games = (n: number, level: number) => () => Array.from({ length: n }, (_, i) => mkSession(i * 3, 0.7, level))
const BELOW = 4 /* כיתה ה׳: הטווח המיועד סביב 9 */
const ABOVE = 16

/* ══════════════════════════════════════════════════════════════════════════
   סף N לטענות רמה
   ══════════════════════════════════════════════════════════════════════════ */
describe('טענת רמה אישית: מיקום מול הטווח רק מ-4 משחקים', () => {
  const v = live([grant(CA.id, { homeroom: true })])
  const w = world([CA], [
    { id: 'few', classId: CA.id, subjects: ['math'], sessions: games(PERSONAL_LEVEL_MIN_SESSIONS - 1, BELOW) },
    { id: 'four', classId: CA.id, subjects: ['math'], sessions: games(PERSONAL_LEVEL_MIN_SESSIONS, BELOW) },
  ])
  const P = providerOf(w)

  it('הסף הוא 4 משחקים', () => { expect(PERSONAL_LEVEL_MIN_SESSIONS).toBe(4) })

  it('לוח התלמיד: עם 3 משחקים אין מיקום ואין טקסט מיקום (הרמה עצמה כן מוצגת); עם 4 — "מתחת לטווח"', async () => {
    const few = (await P.student(v, 'few')).data.panels[0]
    const four = (await P.student(v, 'four')).data.panels[0]
    if (few.access !== 'visible' || four.access !== 'visible') throw new Error('expected visible panels')
    expect(few.positionVsNorm).toBeNull()
    expect(few.positionText).toBeNull()
    expect(few.currentLevel).toBe(BELOW)
    expect(four.positionVsNorm).toBe('below')
    expect(four.positionText).not.toBeNull()
  })

  it('מסך המקצוע (שורות התלמידים) והתדריך: אותו סף', async () => {
    const view = (await P.classSubject(v, CA.id, 'math')).data
    expect(view.students.find((s) => s.id === 'few')!.positionVsNorm).toBeNull()
    expect(view.students.find((s) => s.id === 'four')!.positionVsNorm).toBe('below')
    const difficulties = async (id: string): Promise<string[]> => (await P.briefing(v, 'student', id)).data.sections.find((s) => s.id === 'difficulties')!.items.map((i) => i.text)
    expect(await difficulties('four')).toContain(narrateDifficultyBelow('מתמטיקה', BELOW, 9))
    expect(await difficulties('few')).not.toContain(narrateDifficultyBelow('מתמטיקה', BELOW, 9))
  })

  it('תדריך: "חוזק" מעל הטווח גם הוא רק מ-4 משחקים', async () => {
    const ws = world([CA], [
      { id: 'hi3', classId: CA.id, subjects: ['math'], sessions: games(3, ABOVE) },
      { id: 'hi4', classId: CA.id, subjects: ['math'], sessions: games(4, ABOVE) },
    ])
    const PP = providerOf(ws)
    const strengths = async (id: string): Promise<number> => (await PP.briefing(v, 'student', id)).data.sections.find((s) => s.id === 'strengths')!.items.length
    expect(await strengths('hi3')).toBe(0)
    expect(await strengths('hi4')).toBeGreaterThan(0)
  })
})

describe('טענת רמה כיתתית: לפחות 3 תלמידים שלכל אחד 4 משחקים, והממוצע מהם בלבד', () => {
  const v = live([grant(CA.id, { homeroom: true })])
  const oneGame = (n: number) => ids('one', n).map((id) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[], sessions: games(1, ABOVE) }))
  const solid = (n: number) => ids('solid', n).map((id) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[], sessions: games(PERSONAL_LEVEL_MIN_SESSIONS, BELOW) }))

  it('הסף הוא 3 תלמידים', () => { expect(CLASS_LEVEL_MIN_STUDENTS).toBe(3) })

  it('regression (R2#3): תלמיד אחד עם משחק אחד — אין רמה כיתתית, אין מיקום, הכותרת אומרת "אין עדיין מספיק נתונים" ומה יקרה, dataState=insufficient', async () => {
    const P = providerOf(world([CA], [{ id: 'lone', classId: CA.id, subjects: ['math'], sessions: games(1, BELOW) }, ...oneGame(0)]))
    const out = await P.classSubject(v, CA.id, 'math')
    expect(EP.classSubject.response.safeParse(out).success).toBe(true)
    expect(out.dataState).toBe('insufficient')
    expect(out.data.classLevel.mean).toBeNull()
    expect(out.data.summary.headline).toBe(narrateSubjectHeadline({ className: CA.name, subject: 'מתמטיקה', position: null, trend: 'insufficient', attentionStudents: 0 }))
    expect(out.data.summary.headline).toContain(NO_DATA_YET)
    expect(out.data.summary.headline).toContain('התמונה תופיע כשתלמידים יסיימו הדמיות')
    expect(out.data.summary.headline).not.toContain('מתחת לטווח')
    const ov = await P.classOverview(v, CA.id)
    expect(ov.dataState).toBe('insufficient')
    expect(ov.data.rows[0]).toMatchObject({ level: null, positionVsNorm: null, positionText: null })
    expect(ov.data.summary).toBe(narrateOverviewSummary({ className: CA.name, above: 0, within: 0, below: 0, attentionStudents: 0 }))
  })

  it('2 תלמידים שעומדים בסף (ועוד 8 עם משחק אחד): אין רמה כיתתית; ב-3 — יש, והיא ממוצע שלושתם בלבד (המשחקים הבודדים לא מושכים אותה)', async () => {
    const two = (await providerOf(world([CA], [...solid(2), ...oneGame(8)])).classSubject(v, CA.id, 'math'))
    expect(two.data.classLevel.mean).toBeNull()
    expect(two.dataState).toBe('insufficient')
    const three = (await providerOf(world([CA], [...solid(3), ...oneGame(8)])).classSubject(v, CA.id, 'math'))
    expect(three.data.classLevel.mean).toBe(BELOW) /* ללא 8 המשחקים הבודדים ברמה 16 */
    expect(three.dataState).toBe('ok')
    expect(three.data.summary.headline).toContain('מתחת לטווח')
  })

  it('סקירה: מקצוע אחד נמדד — ללא "מתוך 1 מקצועות"', async () => {
    const ov = (await providerOf(world([CA], solid(3))).classOverview(v, CA.id)).data
    expect(ov.summary).not.toMatch(/מתוך 1 מקצועות/)
    /* G1 (UX#9): ל-3 תלמידים אין מגמה שנבדקה — "אין תלמידים לתשומת לב" אינו נאמר; במקומו משפט שאומר שעוד אין מספיק נתונים */
    expect(ov.summary).toBe(narrateOverviewSummary({ className: CA.name, above: 0, within: 0, below: 1, attentionStudents: 0, attentionThin: true }))
    expect(ov.summary).toContain(ATTENTION_THIN_TEXT)
    expect(ov.summary).not.toContain('אין כרגע תלמידים לתשומת לב')
    expect(ov.summary).toContain('מקצוע אחד')
  })

  it('narrateAdminGradeSummary: מקצוע אחד — ללא "1 מתוך 1 מקצועות" (מנהל)', () => {
    expect(narrateAdminGradeSummary('ה׳', 0, 0, 1)).toBe('בשכבה ה׳ נמדד מקצוע אחד, והרמה בו מתחת לטווח המיועד לשכבה.')
    expect(narrateAdminGradeSummary('ה׳', 1, 1, 0)).toContain('1 מתוך 2 מקצועות')
    expect(narrateAdminGradeSummary('ה׳', 0, 0, 0)).toContain(NO_DATA_YET)
  })

  it('narrateOverviewSummary: מקצוע אחד / שני מקצועות / אפס', () => {
    expect(narrateOverviewSummary({ className: 'ה׳1', above: 1, within: 0, below: 0, attentionStudents: 0 })).not.toMatch(/מתוך 1 מקצועות/)
    expect(narrateOverviewSummary({ className: 'ה׳1', above: 0, within: 1, below: 1, attentionStudents: 0 })).toContain('מתוך 2 מקצועות')
    expect(narrateOverviewSummary({ className: 'ה׳1', above: 0, within: 0, below: 0, attentionStudents: 2 })).toContain('2')
  })
})

describe('טענת רמה במנהל: תורם = מי שעומד בסף האישי', () => {
  const school = (n: number) => world([CA, CB], [
    ...ids('a', 5).map((id) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[], sessions: games(n, BELOW) })),
    ...ids('b', 5).map((id) => ({ id, classId: CB.id, subjects: ['math'] as SubjectCode[], sessions: games(n, BELOW) })),
  ])
  it('10 תלמידים משתי כיתות עם 3 משחקים כל אחד: אין תא (אין תורם שעומד בסף); עם 4 — התא מוצג', async () => {
    const few = (await providerOf(school(PERSONAL_LEVEL_MIN_SESSIONS - 1)).admin(adminViewer)).data
    expect(few.cells).toEqual([])
    const enough = (await providerOf(school(PERSONAL_LEVEL_MIN_SESSIONS)).admin(adminViewer)).data
    expect(enough.cells).toEqual([expect.objectContaining({ status: 'shown', studentCount: 10, avgLevel: BELOW })])
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   משוב לתלמיד/ה (R1#5)
   ══════════════════════════════════════════════════════════════════════════ */
describe('משוב: בלי מקצוע גלוי לצופה — אין טקסט על מקצוע נעול', () => {
  const w = world([CA], [{ id: 'h', classId: CA.id, subjects: ['history'], sessions: ceiling }])
  const P = providerOf(w)
  it('מורה מתמטיקה מול תלמיד/ה שאין לו/ה מתמטיקה: items ריק, dataState=insufficient, ובלי "הצעד הבא בהיסטוריה"', async () => {
    const out = await P.feedback(live([grant(CA.id, { subjects: ['math'] })]), 'h')
    expect(out.dataState).toBe('insufficient')
    expect(out.data.items).toEqual([])
    expect(JSON.stringify(out)).not.toContain('היסטוריה')
  })
  it('שיוך בלי מקצוע: אותו דבר', async () => {
    const out = await P.feedback(live([grant(CA.id, { unspecified: true })]), 'h')
    expect(out.data.items).toEqual([])
  })
  it('מחנך/ת (רואה את ההיסטוריה): יש פריט, dataState=ok', async () => {
    const out = await P.feedback(live([grant(CA.id, { homeroom: true })]), 'h')
    expect(out.dataState).toBe('ok')
    expect(out.data.items.length).toBeGreaterThan(0)
    expect(out.data.items.every((i) => i.subject.code === 'history')).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   תדריך כיתה (W8b#1) וחלון הראיות (R2#8)
   ══════════════════════════════════════════════════════════════════════════ */
describe('תדריך כיתה למחנך/ת של כיתה בלי מקצועות', () => {
  const w = world([CA, CD], [...ids('a', 3).map((id) => ({ id, classId: CA.id }))]) /* CD: כיתה ריקה, בלי תלמידים ובלי מקצועות */
  const P = providerOf(w)
  it('מחנך: 200, dataState=insufficient, מסמך עם כל הסעיפים (בלי תוכן) — לא 403', async () => {
    const out = await P.briefing(live([grant(CD.id, { homeroom: true })]), 'class', CD.id)
    expect(EP.briefing.response.safeParse(out).success).toBe(true)
    expect(out.dataState).toBe('insufficient')
    expect(out.data.title).toContain(CD.name)
    expect(out.data.sections.find((s) => s.id === 'strengths')!.items).toEqual([])
    expect(out.data.sections.find((s) => s.id === 'evidence_basis')!.items).toEqual([])
  })
  it('שיוך בלי מקצוע (לא מחנך): עדיין 403 — זו הרשאה, לא כיתה ריקה', async () => {
    await expect(P.briefing(live([grant(CD.id, { unspecified: true })]), 'class', CD.id)).rejects.toMatchObject({ status: 403 })
  })
  it('מנהל: 403; כיתה מחוץ להיקף: 404', async () => {
    await expect(P.briefing(adminViewer, 'class', CD.id)).rejects.toMatchObject({ status: 403 })
    await expect(P.briefing(live([grant(CA.id, { homeroom: true })]), 'class', CD.id)).rejects.toMatchObject({ status: 404 })
  })
})

describe('תדריך: חלון הראיות המוצהר הוא הטווח בפועל של המשחקים שנספרו', () => {
  const v = live([grant(CA.id, { homeroom: true })])
  const at = (days: number[]) => () => days.map((d) => mkSession(d, 0.7, 9))
  const basisOf = async (days: number[]): Promise<string> => {
    const P = providerOf(world([CA], [{ id: 's', classId: CA.id, subjects: ['math'], sessions: at(days) }]))
    return (await P.briefing(v, 'student', 's')).data.sections.find((s) => s.id === 'evidence_basis')!.items[0].text
  }
  it('regression (R2#8): משחקים רק מלפני יום 179 — החלון מתחיל בחודש המשחק הראשון ומסתיים באחרון (לא "עד היום"), והמספר הוא כל המשחקים', async () => {
    const days = [255, 252, 249, 246, 243, 240]
    const text = await basisOf(days)
    expect(text).toContain('6 משחקים')
    expect(text).toContain(`מ${monthYear(DAYS[255])} עד ${monthYear(DAYS[240])}`)
    expect(monthYear(DAYS[255])).not.toBe(monthYear(DAYS[179])) /* אחרת הבדיקה לא מבחינה */
    expect(text).not.toContain(monthYear(DAYS[0]))
  })
  it('משחקים לאורך כל התקופה: מחודש הראשון עד האחרון', async () => {
    const text = await basisOf([100, 80, 60, 40, 20, 5])
    expect(text).toContain(`מ${monthYear(DAYS[100])} עד ${monthYear(DAYS[5])}`)
  })
  it('כל המשחקים בחודש אחד: "ב<חודש>" ולא "מאוקטובר עד אוקטובר"', async () => {
    const text = await basisOf([3, 2, 1, 0])
    expect(text).toContain(`ב${monthYear(DAYS[0])}`)
    expect(text).not.toMatch(/ עד /)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   הערות כיסוי: כיתה בלי שכבה / שלא נטענה / משחקים בלי רמה (R5#6, R2#6)
   ══════════════════════════════════════════════════════════════════════════ */
describe('הערות כיסוי במסך הכניסה ובתמונת המנהל', () => {
  const w = world([CA], ids('a', 3).map((id) => ({ id, classId: CA.id, sessions: ceiling })))
  const cov = (over: Partial<SourceCoverage>): Partial<{ coverage: () => SourceCoverage }> => ({ coverage: () => ({ unclassifiedSessions: 0, detailAvailableFrom: null, ...over }) })
  const home = live([grant(CA.id, { homeroom: true })])

  it('בלי פערים: coverageNote=null (כמו תמיד)', async () => {
    const e = (await providerOf(w, cov({})).entry(home)).data
    expect(e.coverageNote).toBeNull()
    expect(e.unclassifiedCount).toBe(0)
  })

  it('מחנך: הערת "בלי מקצוע" ואחריה כל הפערים — משפט אחד, בלי שם תלמיד', async () => {
    const gaps = { ungradedClasses: 1, classesNotLoaded: 2, classesLoading: 1, playsWithoutLevel: 3 }
    const e = (await providerOf(w, cov({ unclassifiedSessions: 2, ...gaps })).entry(home)).data
    expect(EP.entry.response.safeParse({ dataState: 'ok', data: e }).success).toBe(true)
    expect(e.unclassifiedCount).toBe(2)
    expect(e.coverageNote).toBe([narrateUnclassifiedNote(2), ...narrateCoverageGaps({ ungradedClasses: 1, notLoadedClasses: 2, loadingClasses: 1, playsWithoutLevel: 3 })].join(' '))
    expect(e.coverageNote).toContain('לכיתה אחת לא הוגדרה שכבה')
    expect(e.coverageNote).toContain('לא הצלחנו לטעון 2 כיתות')
    expect(e.coverageNote).toContain('כיתה אחת עדיין נטענת')
    expect(e.coverageNote).toContain('3 משחקים לא נכללו')
  })

  it('כיתה בלי שכבה: עם שם הכיתה (עד 3, ורק כשמספר השמות זהה למספר הכיתות); אחרת — במספר', async () => {
    const named = (await providerOf(w, cov({ ungradedClasses: 1, ungradedClassNames: ['חוג שחמט'] })).entry(home)).data
    expect(named.coverageNote).toBe('לכיתה חוג שחמט לא הוגדרה שכבה, ולכן היא לא מופיעה כאן. הגדירו לה שכבה בניהול הכיתות.')
    const two = narrateCoverageGaps({ ungradedClasses: 2, ungradedClassNames: ['חוג', 'מקהלה'], notLoadedClasses: 0, loadingClasses: 0, playsWithoutLevel: 0 })
    expect(two).toEqual(['לכיתות חוג ומקהלה לא הוגדרה שכבה, ולכן הן לא מופיעות כאן. הגדירו להן שכבה בניהול הכיתות.'])
    const many = narrateCoverageGaps({ ungradedClasses: 4, ungradedClassNames: ['א', 'ב', 'ג', 'ד'], notLoadedClasses: 0, loadingClasses: 0, playsWithoutLevel: 0 })
    expect(many).toEqual(['ל-4 כיתות לא הוגדרה שכבה, ולכן הן לא מופיעות כאן. הגדירו להן שכבה בניהול הכיתות.'])
    const mismatch = narrateCoverageGaps({ ungradedClasses: 2, ungradedClassNames: ['חוג'], notLoadedClasses: 0, loadingClasses: 0, playsWithoutLevel: 0 })
    expect(mismatch[0]).toContain('ל-2 כיתות')
  })

  it('כיתה בלי שכבה בלבד (שיוך בלי מקצוע): ההערה מופיעה; הערות "בלי מקצוע" ו"בלי רמה" — לא (אין לו מה לסווג מולן)', async () => {
    const e = (await providerOf(w, cov({ unclassifiedSessions: 5, ungradedClasses: 1, playsWithoutLevel: 4 })).entry(live([grant(CA.id, { unspecified: true })]))).data
    expect(e.unclassifiedCount).toBe(0)
    /* G1 (UX#5): שיוך בלי מקצוע — קודם המשפט שמסביר שהמקצוע לא הוגדר (ולמי לפנות), ואחריו הערת השכבה. עדיין בלי הערות "בלי מקצוע" / "בלי רמה" */
    const gaps = narrateCoverageGaps({ ungradedClasses: 1, notLoadedClasses: 0, loadingClasses: 0, playsWithoutLevel: 0 }).join(' ')
    expect(e.coverageNote).toBe(`${narrateNoOpenSubjectNote([CA.name])} ${gaps}`)
  })

  it('מנהל: ההערה נוספת אחרי המשפטים הרגילים; כשאין מה להדגיש — קודם "עוד אין תוצאות" ואז ההערה', async () => {
    const strong = world([CA, CB], [
      ...ids('a', 5).map((id) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[], sessions: games(6, BELOW) })),
      ...ids('b', 5).map((id) => ({ id, classId: CB.id, subjects: ['math'] as SubjectCode[], sessions: games(6, BELOW) })),
    ])
    const note = narrateCoverageGaps({ ungradedClasses: 2, notLoadedClasses: 0, loadingClasses: 0, playsWithoutLevel: 0 }).join(' ')
    const plain = (await providerOf(strong, cov({})).admin(adminViewer)).data
    /* למנהל לא מועברים שמות כיתות, גם אם המקור סיפק */
    const withNote = (await providerOf(strong, cov({ ungradedClasses: 2, ungradedClassNames: ['חוג', 'מקהלה'] })).admin(adminViewer)).data
    expect(EP.admin.response.safeParse({ dataState: 'ok', data: withNote }).success).toBe(true)
    expect(withNote.highlights).toEqual([...plain.highlights, note])
    expect(plain.highlights.length).toBeLessThanOrEqual(3)
    const empty = (await providerOf(world([CA], []), cov({ ungradedClasses: 2 })).admin(adminViewer)).data
    expect(empty.highlights).toEqual([V2_CLIENT_TEXT.adminNoResults, note])
    expect(JSON.stringify(withNote)).not.toMatch(/stu-|שם-/)
  })
})
