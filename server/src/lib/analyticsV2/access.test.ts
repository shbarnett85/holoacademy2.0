import { describe, expect, it } from 'vitest'
import { ERR_AGGREGATE_ONLY, ERR_NO_ACCESS } from '../../../../src/shared/lib/findingsNarrative.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { EP } from '../../../../src/shared/types/analyticsV2.js'
import {
  DEMO_HOMEROOM_CLASS, ENDPOINT_CAP, accessAllowsSubject, accessSeesCrossSubject, canSeeCrossSubject, canViewClassOverview, canViewClassSubject, canViewStudent,
  canViewSubject, capAllows, classSubjectAccess, deriveLens, grantOf, grantsOf, isAggregateOnly, isHomeroomOf, requireCap, scopeClassIds, studentAccess,
  type V2ClassGrant, type V2Viewer,
} from './access.js'

/* צופה חי עם grants פר-כיתה */
const grant = (classId: string, over: Partial<V2ClassGrant> = {}): V2ClassGrant => ({ classId, homeroom: false, subjects: [], unspecified: false, ...over })
const live = (grants: V2ClassGrant[], lens: V2Viewer['lens'] = deriveLens('teacher', grants)): V2Viewer =>
  ({ lens, guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [], source: 'live', classGrants: grants })
/* צופים בצורה הישנה (בדיקות ספק ההדגמה): נשארים תקפים בלי classGrants */
const legacyHomeroom = (cid: string): V2Viewer => ({ lens: 'homeroom', guest: true, homeroomClassId: cid, teachingClassIds: [], subjectCodes: [] })
const legacyTeacher = (classes: string[], subjects: SubjectCode[]): V2Viewer => ({ lens: 'subject_teacher', guest: true, homeroomClassId: null, teachingClassIds: classes, subjectCodes: subjects })
const legacyAdmin: V2Viewer = { lens: 'admin', guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }

/* המימוש הישן (מכפלה קרטזית), כהוכחה שהבדיקות החדשות באמת תופסות את הבאג */
const oldCanViewClassSubject = (v: { teachingClassIds: string[]; subjectCodes: SubjectCode[] }, classId: string, subject: SubjectCode): boolean =>
  v.teachingClassIds.includes(classId) && v.subjectCodes.includes(subject)

describe('הרשאות פר-כיתה: מורה היסטוריה בכיתה א׳ ומתמטיקה בכיתה ב׳ (לא מכפלה קרטזית)', () => {
  const v = live([grant('A', { subjects: ['history'] }), grant('B', { subjects: ['math'] })])
  it('רואה בדיוק את זוגות (כיתה, מקצוע) שיש לו', () => {
    expect(canViewClassSubject(v, 'A', 'history')).toBe(true)
    expect(canViewClassSubject(v, 'B', 'math')).toBe(true)
    expect(canViewClassSubject(v, 'A', 'math')).toBe(false)
    expect(canViewClassSubject(v, 'B', 'history')).toBe(false)
    expect(canViewClassSubject(v, 'C', 'math')).toBe(false)
  })
  it('המימוש הישן היה נכשל: מקצוע של כיתה אחת דלף לכיתה השנייה', () => {
    const flat = { teachingClassIds: ['A', 'B'], subjectCodes: ['history', 'math'] as SubjectCode[] }
    expect(oldCanViewClassSubject(flat, 'A', 'math')).toBe(true)
    expect(oldCanViewClassSubject(flat, 'B', 'history')).toBe(true)
  })
  it('מקצוע של תלמיד: גלוי רק לפי כיתת התלמיד', () => {
    expect(canViewSubject(v, 'history', 'A')).toBe(true)
    expect(canViewSubject(v, 'math', 'A')).toBe(false)
    expect(canViewSubject(v, 'math', 'B')).toBe(true)
    expect(canViewSubject(v, 'history', 'B')).toBe(false)
    /* בלי כיתה: בכיתה כלשהי שלו */
    expect(canViewSubject(v, 'history')).toBe(true)
    expect(canViewSubject(v, 'science')).toBe(false)
  })
  it('סקירה, התרעות חוצות-מקצועות ופתיחת תלמיד', () => {
    expect(canViewClassOverview(v, 'A')).toBe(false)
    expect(canViewClassOverview(v, 'B')).toBe(false)
    expect(canSeeCrossSubject(v, 'A')).toBe(false)
    expect(canSeeCrossSubject(v)).toBe(false)
    expect(canViewStudent(v, 'A')).toBe(true)
    expect(canViewStudent(v, 'B')).toBe(true)
    expect(canViewStudent(v, 'C')).toBe(false)
  })
  it('מקצועות הכיתה: פתוחים רק אלו שלו בכיתה הזאת, והשאר נעולים (שם בלבד)', () => {
    expect(classSubjectAccess(v, 'A', ['math', 'history', 'science'])).toEqual({ open: ['history'], locked: ['math', 'science'] })
    expect(classSubjectAccess(v, 'B', ['math', 'history'])).toEqual({ open: ['math'], locked: ['history'] })
    expect(classSubjectAccess(v, 'C', ['math'])).toEqual({ open: [], locked: [] })
  })
  it('מקצוע שהמורה מלמד פתוח תמיד, גם כשעדיין אין בכיתה נתונים בו', () => {
    expect(classSubjectAccess(v, 'B', [])).toEqual({ open: ['math'], locked: [] })
    expect(classSubjectAccess(v, 'B', ['science'])).toEqual({ open: ['math'], locked: ['science'] })
  })
})

describe('מחנך בכיתה אחת ומורה מקצועי בכיתה אחרת', () => {
  const v = live([grant('A', { homeroom: true }), grant('B', { subjects: ['math'] })])
  it('העדשה הראשית מחנך, אבל סקירה והתרעות חוצות-מקצועות רק בכיתה שבה הוא מחנך', () => {
    expect(v.lens).toBe('homeroom')
    expect(canViewClassOverview(v, 'A')).toBe(true)
    expect(canViewClassOverview(v, 'B')).toBe(false)
    expect(canSeeCrossSubject(v, 'A')).toBe(true)
    expect(canSeeCrossSubject(v, 'B')).toBe(false)
    expect(canSeeCrossSubject(v)).toBe(true)
  })
  it('בכיתה שבה הוא מחנך — כל המקצועות; בכיתה השנייה — מתמטיקה בלבד', () => {
    for (const s of ['math', 'history', 'science'] as const) expect(canViewClassSubject(v, 'A', s)).toBe(true)
    expect(canViewClassSubject(v, 'B', 'math')).toBe(true)
    expect(canViewClassSubject(v, 'B', 'history')).toBe(false)
    expect(canViewSubject(v, 'history', 'A')).toBe(true)
    expect(canViewSubject(v, 'history', 'B')).toBe(false)
  })
  it('classSubjectAccess: מחנך — הכול פתוח; מקצועי — רק שלו', () => {
    expect(classSubjectAccess(v, 'A', ['math', 'history'])).toEqual({ open: ['math', 'history'], locked: [] })
    expect(classSubjectAccess(v, 'B', ['math', 'history'])).toEqual({ open: ['math'], locked: ['history'] })
  })
  it('isHomeroomOf לפי כיתה', () => {
    expect(isHomeroomOf(v, 'A')).toBe(true)
    expect(isHomeroomOf(v, 'B')).toBe(false)
    expect(isHomeroomOf(v, 'Z')).toBe(false)
  })
})

describe('מחנך בכמה כיתות', () => {
  const v = live([grant('A', { homeroom: true }), grant('B', { homeroom: true })])
  it('סקירה והתרעות חוצות-מקצועות בכל כיתה שלו, ולא בכיתה אחרת', () => {
    for (const c of ['A', 'B']) { expect(canViewClassOverview(v, c)).toBe(true); expect(canSeeCrossSubject(v, c)).toBe(true) }
    expect(canViewClassOverview(v, 'C')).toBe(false)
    expect(scopeClassIds(v)).toEqual(['A', 'B'])
  })
})

describe('שיוך בלי מקצוע (unspecified): הכיתה מופיעה וכל המקצועות נעולים — אין ברירת מחדל למקצוע', () => {
  const v = live([grant('A', { unspecified: true })])
  it('אין גישה לאף מקצוע ואין סקירה; התלמיד עצמו נפתח עם מקצועות אפורים', () => {
    expect(v.lens).toBe('subject_teacher')
    for (const s of ['math', 'hebrew', 'history'] as const) { expect(canViewClassSubject(v, 'A', s)).toBe(false); expect(canViewSubject(v, s, 'A')).toBe(false) }
    expect(canViewClassOverview(v, 'A')).toBe(false)
    expect(classSubjectAccess(v, 'A', ['math', 'history'])).toEqual({ open: [], locked: ['math', 'history'] })
    expect(canViewStudent(v, 'A')).toBe(true)
  })
})

describe('מורה בלי שיוך לכיתות', () => {
  const v = live([])
  it('אין כיתות בהיקף ואין גישה לשום ישות', () => {
    expect(scopeClassIds(v)).toEqual([])
    expect(canViewStudent(v, 'A')).toBe(false)
    expect(canViewSubject(v, 'math')).toBe(false)
    expect(canViewClassSubject(v, 'A', 'math')).toBe(false)
    expect(canViewClassOverview(v, 'A')).toBe(false)
  })
})

describe('מנהל (aggregate-only): אין לו הרשאה לשום דבר ברמת כיתה/תלמיד, גם אם classGrants מולא בטעות', () => {
  const sneaky: V2Viewer = { ...legacyAdmin, classGrants: [grant('A', { homeroom: true })] }
  for (const [name, v] of [['legacy', legacyAdmin], ['עם classGrants', sneaky]] as const) {
    it(name, () => {
      expect(isAggregateOnly(v)).toBe(true)
      expect(grantsOf(v)).toEqual([])
      expect(grantOf(v, 'A')).toBeNull()
      expect(canViewStudent(v, 'A')).toBe(false)
      expect(canViewSubject(v, 'math')).toBe(false)
      expect(canViewSubject(v, 'math', 'A')).toBe(false)
      expect(canViewClassSubject(v, 'A', 'math')).toBe(false)
      expect(canViewClassOverview(v, 'A')).toBe(false)
      expect(canSeeCrossSubject(v)).toBe(false)
      expect(studentAccess(v, ['A'])).toEqual({ kind: 'denied' })
      expect(scopeClassIds(v)).toEqual([])
    })
  }
})

describe('תלמיד בכמה כיתות: איחוד ההרשאות (כמו authz.studentScope)', () => {
  it('מחנך באחת → full; מקצועי בשתיים → איחוד המקצועות; בלי grant → denied', () => {
    const mixed = live([grant('A', { homeroom: true }), grant('B', { subjects: ['math'] })])
    const a = studentAccess(mixed, ['A', 'B'])
    expect(a).toMatchObject({ kind: 'scoped', full: true })
    expect(accessAllowsSubject(a, 'history')).toBe(true)
    expect(accessSeesCrossSubject(a)).toBe(true)
    const onlyB = studentAccess(mixed, ['B'])
    expect(onlyB).toMatchObject({ kind: 'scoped', full: false })
    expect(accessAllowsSubject(onlyB, 'math')).toBe(true)
    expect(accessAllowsSubject(onlyB, 'history')).toBe(false)
    expect(accessSeesCrossSubject(onlyB)).toBe(false)
    const split = live([grant('A', { subjects: ['history'] }), grant('B', { subjects: ['math'] })])
    const both = studentAccess(split, ['A', 'B'])
    expect(accessAllowsSubject(both, 'history')).toBe(true)
    expect(accessAllowsSubject(both, 'math')).toBe(true)
    expect(accessAllowsSubject(both, 'science')).toBe(false)
    expect(studentAccess(split, ['Z'])).toEqual({ kind: 'denied' })
    expect(canViewStudent(split, ['Z', 'B'])).toBe(true)
  })
})

describe('צופים בצורה הישנה (הדגמה / בדיקות) מסונתזים ל-grants בלי שינוי התנהגות', () => {
  it('מחנך: כיתתו בלבד, כל המקצועות, סקירה והתרעות חוצות-מקצועות', () => {
    const v = legacyHomeroom(DEMO_HOMEROOM_CLASS)
    expect(grantsOf(v)).toEqual([{ classId: DEMO_HOMEROOM_CLASS, homeroom: true, subjects: [], unspecified: false }])
    expect(canViewStudent(v, DEMO_HOMEROOM_CLASS)).toBe(true)
    expect(canViewStudent(v, 'c-v1')).toBe(false)
    expect(canViewSubject(v, 'bible')).toBe(true)
    expect(canViewSubject(v, 'bible', 'c-v1')).toBe(false)
    expect(canViewClassSubject(v, DEMO_HOMEROOM_CLASS, 'science')).toBe(true)
    expect(canViewClassSubject(v, 'c-v1', 'science')).toBe(false)
    expect(canViewClassOverview(v, DEMO_HOMEROOM_CLASS)).toBe(true)
    expect(canSeeCrossSubject(v)).toBe(true)
  })
  it('מורה מקצועי (פרסונת אורח): המקצוע שלו בכל כיתותיו; בלי סקירה ובלי התרעות חוצות-מקצועות', () => {
    const v = legacyTeacher(['c-v1', 'c-v2'], ['history'])
    expect(canViewClassSubject(v, 'c-v1', 'history')).toBe(true)
    expect(canViewClassSubject(v, 'c-v2', 'math')).toBe(false)
    expect(canViewClassSubject(v, 'c-d1', 'history')).toBe(false)
    expect(canViewStudent(v, 'c-v2')).toBe(true)
    expect(canViewStudent(v, 'c-d1')).toBe(false)
    expect(canViewSubject(v, 'history')).toBe(true)
    expect(canViewSubject(v, 'math')).toBe(false)
    expect(canViewClassOverview(v, 'c-v2')).toBe(false)
    expect(canSeeCrossSubject(v)).toBe(false)
    expect(scopeClassIds(v)).toEqual(['c-v1', 'c-v2'])
  })
})

describe('העדשה נגזרת מההרשאות', () => {
  it('מנהל / מנהל עירוני → admin; מחנך בכיתה כלשהי → homeroom; אחרת מורה מקצועי (גם בלי grants)', () => {
    expect(deriveLens('admin', [])).toBe('admin')
    expect(deriveLens('municipal_admin', [{ homeroom: true }])).toBe('admin')
    expect(deriveLens('teacher', [{ homeroom: false }, { homeroom: true }])).toBe('homeroom')
    expect(deriveLens('teacher', [{ homeroom: false }])).toBe('subject_teacher')
    expect(deriveLens('teacher', [])).toBe('subject_teacher')
  })
})

describe('יכולת לפי נקודת קצה (מנהל מול מסכי מורה)', () => {
  it('כל נקודת קצה ברישום EP מקבלת יכולת', () => {
    expect(Object.keys(ENDPOINT_CAP).sort()).toEqual(Object.keys(EP).sort())
  })
  it('config / roster / entry לכולם; מסכי תלמיד וכיתה למורה בלבד; admin למנהל בלבד', () => {
    const teacher = live([grant('A', { homeroom: true })])
    for (const ep of ['config', 'roster', 'entry'] as const) { expect(capAllows(teacher, ENDPOINT_CAP[ep])).toBe(true); expect(capAllows(legacyAdmin, ENDPOINT_CAP[ep])).toBe(true) }
    for (const ep of ['student', 'feedback', 'classOverview', 'classSubject', 'briefing'] as const) {
      expect(capAllows(teacher, ENDPOINT_CAP[ep]), ep).toBe(true)
      expect(capAllows(legacyAdmin, ENDPOINT_CAP[ep]), ep).toBe(false)
      expect(() => requireCap(legacyAdmin, ep), ep).toThrowError(ERR_AGGREGATE_ONLY)
    }
    expect(capAllows(teacher, ENDPOINT_CAP.admin)).toBe(false)
    expect(capAllows(legacyAdmin, ENDPOINT_CAP.admin)).toBe(true)
    expect(() => requireCap(teacher, 'admin')).toThrowError(ERR_NO_ACCESS)
    expect(() => requireCap(teacher, 'student')).not.toThrow()
    expect(() => requireCap(legacyAdmin, 'admin')).not.toThrow()
  })
  it('הדחייה היא 403 לפי תפקיד', () => {
    try { requireCap(legacyAdmin, 'student') } catch (e) { expect(e).toMatchObject({ status: 403 }) }
    try { requireCap(live([]), 'admin') } catch (e) { expect(e).toMatchObject({ status: 403 }) }
  })
})
