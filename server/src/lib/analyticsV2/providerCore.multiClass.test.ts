/* F1: תלמיד/ה שרשום/ה בכמה כיתות — ההרשאה היא איחוד ההרשאות של הצופה בכל כיתות התלמיד (כמו authz.studentScope), לא הכיתה העיקרית בלבד.
   · מסך הכיתה, הרשימה, הכניסה והמסך האישי מסכימים.
   · מחנך באחת + מקצוע בשנייה = מה שהיה רואה בכל כיתה לחוד, ולא יותר (אין מכפלה קרטזית).
   · ספירות המנהל לפי מזהים שונים; הערת "הדמיות בלי מקצוע" לא מוצגת למי שאין לו אף מקצוע פתוח. */
import { describe, expect, it } from 'vitest'
import { ERR_NOT_FOUND, ERR_NO_ACCESS, narrateAdminSchool, narrateAdminSchoolPartial, narrateNoOpenSubjectNote } from '../../../../src/shared/lib/findingsNarrative.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { EP } from '../../../../src/shared/types/analyticsV2.js'
import type { World } from './demoWorld.js'
import { analyze } from './engine.js'
import { createProvider } from './providerCore.js'
import { CA, CB, adminViewer, ceiling, decliner, fakeSource, grant, ids, live, world, type Stu } from './providerTestkit.js'

const MH: SubjectCode[] = ['math', 'history']
const failsWith = async (p: Promise<unknown>, status: number, message?: string): Promise<void> => {
  await expect(p).rejects.toMatchObject(message ? { status, message } : { status })
}

/* שני בתים: sharedA — עיקרית א׳ וגם ב-ב׳; sharedB — עיקרית ב׳ וגם ב-א׳. שניהם יורדים במתמטיקה (התרעה). aOnly / bOnly — כיתה אחת. */
function dualWorld(): World {
  const decl = (s: SubjectCode) => (s === 'math' ? decliner() : ceiling())
  const students: Stu[] = [
    ...ids('a', 3).map((id) => ({ id: `${id}-only`, classId: CA.id })),
    ...ids('b', 3).map((id) => ({ id: `${id}-only`, classId: CB.id })),
    { id: 'sharedA', classId: CA.id, sessions: decl },
    { id: 'sharedB', classId: CB.id, sessions: decl },
  ]
  const w = world([CA, CB], students)
  w.classes = w.classes.map((c) => ({ ...c, studentIds: [...new Set([...c.studentIds, 'sharedA', 'sharedB'])] }))
  return w
}
const W = dualWorld()
const A = analyze(W)
const P = createProvider(fakeSource(A))
const SHARED = ['sharedA', 'sharedB']
const visibleCodes = (panels: { access: string; subject: { code: string } }[]): string[] => panels.filter((p) => p.access === 'visible').map((p) => p.subject.code).sort()

describe('תלמיד בשתי כיתות: מחנך באחת + מקצוע בשנייה = איחוד, בלי לבדוק רק את הכיתה העיקרית', () => {
  /* מחנך בא׳, מתמטיקה בב׳ */
  const v = live([grant(CA.id, { homeroom: true }), grant(CB.id, { subjects: ['math'] })])

  it.each(SHARED)('%s: המסך האישי = full, כל המקצועות גלויים והתרעה חוצת-מקצועות פתוחה — בלי קשר לכיתה העיקרית', async (id) => {
    const s = (await P.student(v, id)).data
    expect(EP.student.response.safeParse({ dataState: 'ok', data: s }).success).toBe(true)
    expect(s.access).toBe('full')
    expect(visibleCodes(s.panels)).toEqual(MH.slice().sort())
    expect(s.student.classId).toBe(CA.id) /* הכיתה שמוצגת: זו שהצופה מחנך בה, גם כשהעיקרית של התלמיד/ה היא אחרת */
  })

  it('מי שרשום רק בכיתה המקצועית: subject_only; מי שרשום רק בכיתת המחנך: full (לא איחוד על תלמידים שאינם משותפים)', async () => {
    const b = (await P.student(v, 'b-0-only')).data
    expect(b.access).toBe('subject_only')
    expect(visibleCodes(b.panels)).toEqual(['math'])
    const a = (await P.student(v, 'a-0-only')).data
    expect(a.access).toBe('full')
    expect(visibleCodes(a.panels)).toEqual(MH.slice().sort())
  })

  it.each(SHARED)('%s: מסך המתמטיקה של כל אחת משתי הכיתות מציג אותו/ה עם רמה, והמסך האישי מסכים', async (id) => {
    for (const cls of [CA.id, CB.id]) {
      const view = (await P.classSubject(v, cls, 'math')).data
      const row = view.students.find((x) => x.id === id)
      expect(row, `${id} ב-${cls}`).toBeDefined()
      const personal = (await P.student(v, id)).data.panels.find((p) => p.subject.code === 'math')!
      expect(personal.access).toBe('visible')
      if (personal.access === 'visible') expect(personal.currentLevel).toBe(row!.level)
    }
  })

  it('הרשימה: כל התלמידים המשותפים בכל כיתה, עם אותה ספירת התרעות בשתי הכיתות ו-earlyWarning לפי האיחוד (מחנך באחת)', async () => {
    const r = (await P.roster(v)).data
    for (const id of SHARED) {
      const rows = r.students.filter((x) => x.id === id)
      expect(rows.map((x) => x.classId).sort(), id).toEqual([CA.id, CB.id])
      expect(rows[0].attention).toBe(rows[1].attention)
      expect(rows[0].attention).toBeGreaterThan(0)
      expect(rows.every((x) => x.earlyWarning === rows[0].earlyWarning)).toBe(true)
    }
  })

  it('התדריך האישי מסכים עם המסך האישי: תלמיד משותף — ממצא המתמטיקה בתדריך, ובלי הגבלת מקצוע בכותרת המשנה', async () => {
    for (const id of SHARED) {
      const full = (await P.briefing(v, 'student', id)).data
      const codes = new Set(full.sections.flatMap((s) => s.items).map((i) => i.subjectCode))
      expect(codes.has('math'), id).toBe(true)
      expect(EP.briefing.response.safeParse({ dataState: 'ok', data: full }).success).toBe(true)
      const onlyA = (await P.briefing(v, 'student', 'b-0-only')).data
      expect(onlyA.sections.flatMap((s) => s.items).every((i) => i.subjectCode === null || i.subjectCode === 'math')).toBe(true)
    }
  })
})

describe('מורה היסטוריה בא׳ ומתמטיקה בב׳: תלמיד משותף רואה את שניהם; תלמיד של כיתה אחת — רק את מקצוע כיתתו (בלי מכפלה)', () => {
  const v = live([grant(CA.id, { subjects: ['history'] }), grant(CB.id, { subjects: ['math'] })])

  it.each(SHARED)('%s: היסטוריה ומתמטיקה גלויות (איחוד), בלי סקירה ובלי התרעה חוצת-מקצועות', async (id) => {
    const s = (await P.student(v, id)).data
    expect(s.access).toBe('subject_only')
    expect(visibleCodes(s.panels)).toEqual(['history', 'math'])
    expect(s.crossSubject).toEqual([])
  })

  it('aOnly: היסטוריה בלבד; bOnly: מתמטיקה בלבד — לא מכפלה קרטזית', async () => {
    expect(visibleCodes((await P.student(v, 'a-0-only')).data.panels)).toEqual(['history'])
    expect(visibleCodes((await P.student(v, 'b-0-only')).data.panels)).toEqual(['math'])
  })

  it('הזוגות (כיתה, מקצוע) האסורים נשארים 403 ובלי סקירה', async () => {
    await failsWith(P.classSubject(v, CA.id, 'math'), 403, ERR_NO_ACCESS)
    await failsWith(P.classSubject(v, CB.id, 'history'), 403, ERR_NO_ACCESS)
    await failsWith(P.classOverview(v, CA.id), 403, ERR_NO_ACCESS)
  })

  it('המשוב של תלמיד משותף כולל את מתמטיקה (שמלמד בב׳) והיסטוריה; של תלמיד יחיד — רק את מקצוע כיתתו', async () => {
    const fbShared = (await P.feedback(v, 'sharedA')).data
    expect(fbShared.items.some((i) => i.subject.code === 'math')).toBe(true)
    const fbOnly = (await P.feedback(v, 'a-1-only')).data
    expect(fbOnly.items.length).toBeGreaterThan(0)
    expect(fbOnly.items.every((i) => i.subject.code === 'history')).toBe(true)
  })
})

describe('מחנך בכיתה שאינה העיקרית של התלמיד/ה', () => {
  const v = live([grant(CB.id, { homeroom: true })])
  it('sharedA (עיקרית א׳, רשום/ה גם בב׳): נפתח/ת (לא 404), full, והכיתה שמוצגת היא כיתת הצופה — לא כיתה שאינה בהיקפו', async () => {
    const s = (await P.student(v, 'sharedA')).data
    expect(s.access).toBe('full')
    expect(s.student.classId).toBe(CB.id)
    expect(s.student.className).toBe(CB.name)
    expect(JSON.stringify(s)).not.toContain(CA.name)
    expect((await P.briefing(v, 'student', 'sharedA')).data.title).toBeTruthy()
  })
  it('תלמיד של כיתה א׳ בלבד: 404 אחיד', async () => {
    await failsWith(P.student(v, 'a-0-only'), 404, ERR_NOT_FOUND)
    await failsWith(P.feedback(v, 'a-0-only'), 404, ERR_NOT_FOUND)
    await failsWith(P.briefing(v, 'student', 'a-0-only'), 404, ERR_NOT_FOUND)
  })
  it('מורה בלי הרשאה באף אחת משתי הכיתות: 404 גם לתלמיד המשותף', async () => {
    const none = live([grant('cls-elsewhere', { homeroom: true })])
    await failsWith(P.student(none, 'sharedA'), 404, ERR_NOT_FOUND)
    await failsWith(P.student(none, 'sharedB'), 404, ERR_NOT_FOUND)
  })
})

describe('רצועת ההתרעות: תלמיד משותף נספר בכל כיתה אך מופיע פעם אחת', () => {
  it('attentionCount לכל כיתה כולל אותו; alerts ו-alertsTotal לפי תלמידים שונים', async () => {
    const v = live([grant(CA.id, { homeroom: true }), grant(CB.id, { homeroom: true })])
    const e = (await P.entry(v)).data
    expect(EP.entry.response.safeParse({ dataState: 'ok', data: e }).success).toBe(true)
    const perClass = e.classes.map((c) => c.attentionCount)
    expect(perClass.every((n) => n >= 2)).toBe(true) /* בכל כיתה: ה-sharedA וה-sharedB */
    const distinct = new Set(e.alerts.map((x) => x.studentId))
    expect(distinct.size).toBe(e.alerts.length)
    expect(e.alertsTotal).toBe(2) /* sharedA + sharedB, לא 4 */
    expect(perClass.reduce((s, n) => s + n, 0)).toBe(4)
  })
})

describe('מנהל: ספירת תלמידים בשכבה לפי מזהים שונים', () => {
  const adminOf = async (w: World) => (await createProvider(fakeSource(analyze(w))).admin(adminViewer)).data
  const mk = (aIds: string[], bIds: string[], shared: string[]): World => {
    const w = world([CA, CB], [...aIds.map((id) => ({ id, classId: CA.id })), ...bIds.map((id) => ({ id, classId: CB.id })), ...shared.map((id) => ({ id, classId: CA.id }))])
    w.classes = w.classes.map((c) => (c.id === CB.id ? { ...c, studentIds: [...c.studentIds, ...shared] } : c))
    return w
  }

  it('4 תלמידים שונים (אחד רשום בשתי כיתות של השכבה): שכבה קטנה מהסף — לא מוצגת ולא מפרסמת סך', async () => {
    /* א׳: a1,a2,shared · ב׳: b1,shared  → 4 שונים; סכום גדלי כיתות = 5 (היה עובר את הסף!) */
    const out = await adminOf(mk(['a1', 'a2'], ['b1'], ['shared']))
    expect(out.grades).toEqual([])
    expect(out.gradeRows).toEqual([])
    expect(out.highlights).toEqual([])
  })

  it('5 תלמידים שונים (אחד בשתי כיתות): studentCount=5 ולא 6, והסך בהדגשה תואם', async () => {
    const out = await adminOf(mk(['a1', 'a2', 'a3'], ['b1'], ['shared']))
    expect(out.grades).toHaveLength(1)
    expect(out.grades[0].studentCount).toBe(5)
    expect(out.highlights[0]).toBe(narrateAdminSchool(1, 2, 5))
    expect(out.highlights[0]).not.toBe(narrateAdminSchoolPartial(1))
  })

  it('שתי כיתות של שכבה אחת, תלמיד משותף: studentCount = מספר התלמידים השונים (9, לא 10)', async () => {
    const w = mk(ids('x', 4), ids('y', 4), ['dup'])
    const out = await adminOf(w)
    expect(out.grades.reduce((s, g) => s + g.studentCount, 0)).toBe(new Set(w.classes.flatMap((c) => c.studentIds)).size)
    expect(out.grades[0].studentCount).toBe(9)
  })
})

describe('הערת "שיעורים בלי מקצוע" (coverageNote): רק למי שיש לו מקצוע פתוח', () => {
  const src = (n: number) => fakeSource(analyze(world([CA], ids('s', 3).map((id) => ({ id, classId: CA.id })))), { coverage: () => ({ unclassifiedSessions: n, detailAvailableFrom: null }) })
  const noteOf = async (v: ReturnType<typeof live>) => (await createProvider(src(6)).entry(v)).data
  it('מחנך: מקבל את ההערה (גם כשבכיתה עדיין אין שום מקצוע מסווג)', async () => {
    const e = await noteOf(live([grant(CA.id, { homeroom: true })]))
    expect(e.unclassifiedCount).toBe(6)
    expect(e.coverageNote).toMatch(/\S/)
  })
  it('מורה מקצועי עם מקצוע: מקבל את ההערה', async () => {
    const e = await noteOf(live([grant(CA.id, { subjects: ['math'] })]))
    expect(e.unclassifiedCount).toBe(6)
    expect(e.coverageNote).not.toBeNull()
  })
  it('שיוך בלי מקצוע ובלי מחנכות: unclassifiedCount=0 (אין לו מקצוע פתוח — הספירה לא רלוונטית לו), וההערה אומרת שהמקצוע שלו לא הוגדר', async () => {
    const e = await noteOf(live([grant(CA.id, { unspecified: true })]))
    expect(e).toMatchObject({ unclassifiedCount: 0, coverageNote: narrateNoOpenSubjectNote([CA.name]) })
    expect(e.classes).toHaveLength(1) /* הכיתה עצמה עדיין מופיעה */
  })
  it('שיוך בלי מקצוע בכיתה אחת + מקצוע בשנייה: ההערה נשארת (יש לו מקצוע פתוח)', async () => {
    const e = (await createProvider(fakeSource(analyze(world([CA, CB], [{ id: 'p', classId: CA.id }, { id: 'q', classId: CB.id }])), { coverage: () => ({ unclassifiedSessions: 2, detailAvailableFrom: null }) }))
      .entry(live([grant(CA.id, { unspecified: true }), grant(CB.id, { subjects: ['math'] })]))).data
    expect(e.unclassifiedCount).toBe(2)
  })
})
