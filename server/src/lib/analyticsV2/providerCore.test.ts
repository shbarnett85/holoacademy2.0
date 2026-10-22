import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_HIDDEN_CELL_DOMINANT_CLASS_TEXT, ADMIN_HIDDEN_CELL_SINGLE_CLASS_TEXT, ADMIN_HIDDEN_CELL_TEXT, ERR_AGGREGATE_ONLY, ERR_NOT_FOUND, ERR_NO_ACCESS, narrateAdminSchool, narrateAdminSchoolPartial,
  narrateFeedbackNextStep, narrateUnclassifiedNote,
} from '../../../../src/shared/lib/findingsNarrative.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { EP } from '../../../../src/shared/types/analyticsV2.js'
import { MIN_CELL_SIZE } from '../authz.js'
import { scopeClassIds, type V2Viewer } from './access.js'
import { demoProvider, getAnalysis } from './demoProvider.js'
import type { SessionRec, World } from './demoWorld.js'
import { analyze, type Analysis } from './engine.js'
import type { AuditSink } from './provider.js'
import { createProvider } from './providerCore.js'
import {
  CA, CB, CC, CD, adminViewer, ceiling, fakeSource, grant, ids, live, spread, standardAnalysis, standardWorld, world,
} from './providerTestkit.js'
import type { AnalyticsSource } from './source.js'

const STANDARD = standardAnalysis()

const providerOf = (a: Analysis, over?: Partial<AnalyticsSource>) => createProvider(fakeSource(a, over))
const P = providerOf(STANDARD)
const failsWith = async (p: Promise<unknown>, status: number, message?: string): Promise<void> => {
  await expect(p).rejects.toMatchObject(message ? { status, message } : { status })
}
const sink = (): AuditSink & { ids: Set<string> } => { const set = new Set<string>(); return { ids: set, expose(x) { for (const i of x) set.add(i) } } }

/* ══════════════════════════════════════════════════════════════════════════ */
describe('מחנך בכיתה אחת ומקצועי בכיתה אחרת (עדשה ראשית: מחנך)', () => {
  const v = live([grant(CA.id, { homeroom: true }), grant(CB.id, { subjects: ['math'] })])

  it('רשימת הכיתות: isHomeroom פר-כיתה, מקצועות פתוחים/נעולים פר-כיתה; כל התלמידים נספרים (גם בלי נתונים)', async () => {
    const r = (await P.roster(v)).data
    expect(EP.roster.response.safeParse({ dataState: 'ok', data: r }).success).toBe(true)
    expect(r.classes.map((c) => c.id)).toEqual([CA.id, CB.id])
    const [a, b] = r.classes
    expect(a).toMatchObject({ isHomeroom: true, studentCount: 10, lockedSubjects: [] })
    expect(a.subjects.map((s) => s.code).sort()).toEqual(['history', 'math'])
    expect(b).toMatchObject({ isHomeroom: false, studentCount: 8 })
    expect(b.subjects.map((s) => s.code)).toEqual(['math'])
    expect(b.lockedSubjects.map((s) => s.code)).toEqual(['history'])
  })

  it('מחנך רואה בכיתתו גם תלמיד בלי אף נתון (0 התרעות), ומורה מקצועי רואה בכיתה השנייה את תלמידי המקצוע', async () => {
    const r = (await P.roster(v)).data
    const nodata = r.students.find((s) => s.id === 'stu-A-nodata')!
    expect(nodata).toMatchObject({ classId: CA.id, attention: 0, positive: 0, earlyWarning: false })
    expect(r.students.filter((s) => s.classId === CA.id)).toHaveLength(10)
    expect(r.students.filter((s) => s.classId === CB.id)).toHaveLength(8)
    expect(r.students.some((s) => s.classId === CC.id)).toBe(false)
  })

  it('הכניסה: כיתות בהיקף בלבד, hasResults, התרעה על היורד, ובלי הכיתה שמחוץ להיקף', async () => {
    const e = (await P.entry(v)).data
    expect(EP.entry.response.safeParse({ dataState: 'ok', data: e }).success).toBe(true)
    expect(e.classes.map((c) => c.id)).toEqual([CA.id, CB.id])
    expect(e.classes.every((c) => c.hasResults)).toBe(true)
    expect(e.classes.find((c) => c.id === CA.id)!.attentionCount).toBeGreaterThanOrEqual(1)
    expect(e.alerts.some((x) => x.studentId === 'stu-A-0')).toBe(true)
    expect(e.unclassifiedCount).toBe(0)
    expect(e.coverageNote).toBeNull()
  })

  it('תלמיד בכיתת המחנך: full + התרעות חוצות-מקצועות; תלמיד בכיתה המקצועית: subject_only ומקצוע אחר אפור', async () => {
    const own = (await P.student(v, 'stu-A-1')).data
    expect(own.access).toBe('full')
    expect(own.panels.every((p) => p.access === 'visible')).toBe(true)
    const other = (await P.student(v, 'stu-B-0')).data
    expect(other.access).toBe('subject_only')
    expect(other.crossSubject).toEqual([])
    for (const p of other.panels) {
      if (p.subject.code === 'math') expect(p.access).toBe('visible')
      else { expect(p.access).toBe('greyed'); expect(Object.keys(p).sort()).toEqual(['access', 'subject']) }
    }
  })

  it('סקירה: בכיתת המחנך כן; בכיתה המקצועית 403 (ERR_NO_ACCESS); מחוץ להיקף 404', async () => {
    const o = (await P.classOverview(v, CA.id)).data
    expect(EP.classOverview.response.safeParse({ dataState: 'ok', data: o }).success).toBe(true)
    expect(o.rows.map((r) => r.subject.code).sort()).toEqual(['history', 'math'])
    await failsWith(P.classOverview(v, CB.id), 403, ERR_NO_ACCESS)
    await failsWith(P.classOverview(v, CC.id), 404, ERR_NOT_FOUND)
  })

  it('מקצוע בכיתה: מחנך — כל מקצוע בכיתתו; מקצועי — רק שלו; נעול 403; מקצוע שאינו בכיתה / כיתה מחוץ להיקף 404', async () => {
    const hist = (await P.classSubject(v, CA.id, 'history')).data
    expect(EP.classSubject.response.safeParse({ dataState: 'ok', data: hist }).success).toBe(true)
    expect(hist.otherSubjects).toEqual([]) /* מחנך הכיתה: אין "אחרים" */
    const math = (await P.classSubject(v, CB.id, 'math')).data
    expect(math.otherSubjects.map((s) => s.code)).toEqual(['history'])
    await failsWith(P.classSubject(v, CB.id, 'history'), 403, ERR_NO_ACCESS)
    await failsWith(P.classSubject(v, CA.id, 'science'), 404, ERR_NOT_FOUND)
    await failsWith(P.classSubject(v, CC.id, 'math'), 404, ERR_NOT_FOUND)
  })

  it('תדריך: תלמיד בכיתה המקצועית — מקצועו בלבד; כיתה מקצועית — מקצוע אחד; כיתה מחוץ להיקף 404', async () => {
    const b = (await P.briefing(v, 'student', 'stu-B-1')).data
    expect(b.sections.flatMap((s) => s.items).every((i) => i.subjectCode === null || i.subjectCode === 'math')).toBe(true)
    expect(EP.briefing.response.safeParse({ dataState: 'ok', data: b }).success).toBe(true)
    const c = (await P.briefing(v, 'class', CB.id)).data
    expect(c.subtitle).toContain('מתמטיקה')
    expect(c.subtitle).not.toContain('היסטוריה')
    await failsWith(P.briefing(v, 'class', CC.id), 404, ERR_NOT_FOUND)
  })
})

describe('מורה היסטוריה בכיתה א׳ ומתמטיקה בכיתה ב׳ (לא מכפלה קרטזית)', () => {
  const v = live([grant(CA.id, { subjects: ['history'] }), grant(CB.id, { subjects: ['math'] })])
  it('רשימה: פתוח/נעול פר-כיתה', async () => {
    const r = (await P.roster(v)).data
    expect(r.classes.map((c) => [c.id, c.isHomeroom, c.subjects.map((s) => s.code), c.lockedSubjects.map((s) => s.code)])).toEqual([
      [CA.id, false, ['history'], ['math']],
      [CB.id, false, ['math'], ['history']],
    ])
  })
  it('מקצוע בכיתה: רק הזוגות שלו; הזוגות האסורים 403', async () => {
    await P.classSubject(v, CA.id, 'history')
    await P.classSubject(v, CB.id, 'math')
    await failsWith(P.classSubject(v, CA.id, 'math'), 403, ERR_NO_ACCESS)
    await failsWith(P.classSubject(v, CB.id, 'history'), 403, ERR_NO_ACCESS)
  })
  it('תלמיד בכיתה א׳: היסטוריה גלויה, מתמטיקה אפורה; בכיתה ב׳ — להפך', async () => {
    const a = (await P.student(v, 'stu-A-2')).data
    expect(a.panels.map((p) => [p.subject.code, p.access]).sort()).toEqual([['history', 'visible'], ['math', 'greyed']])
    const b = (await P.student(v, 'stu-B-2')).data
    expect(b.panels.map((p) => [p.subject.code, p.access]).sort()).toEqual([['history', 'greyed'], ['math', 'visible']])
  })
  it('אין סקירה ואין התרעות חוצות-מקצועות באף כיתה', async () => {
    await failsWith(P.classOverview(v, CA.id), 403, ERR_NO_ACCESS)
    await failsWith(P.classOverview(v, CB.id), 403, ERR_NO_ACCESS)
    const r = (await P.roster(v)).data
    expect(r.students.every((s) => s.earlyWarning === false)).toBe(true)
  })
})

describe('שיוך בלי מקצוע ובלי מחנכות (unspecified)', () => {
  const v = live([grant(CA.id, { unspecified: true })])
  it('הכיתה מופיעה, כל מקצועותיה נעולים, ואין תלמידים ברשימה', async () => {
    const r = (await P.roster(v)).data
    expect(r.classes).toHaveLength(1)
    expect(r.classes[0]).toMatchObject({ id: CA.id, isHomeroom: false })
    expect(r.classes[0].subjects).toEqual([])
    expect(r.classes[0].lockedSubjects.map((s) => s.code).sort()).toEqual(['history', 'math'])
    expect(r.students).toEqual([])
    const e = (await P.entry(v)).data
    /* G1 (UX#5): גודל הכיתה האמיתי (בלי פירוט אישי) ולא "0 תלמידים"; הדגל noOpenSubject מאפשר ללקוח להסביר שהמקצוע לא הוגדר */
    expect(e.classes[0]).toMatchObject({ studentCount: 10, attentionCount: 0, hasResults: false, noOpenSubject: true })
  })
  it('כל מקצוע / סקירה / תדריך כיתה → 403; תלמיד נפתח עם כל החלונות אפורים', async () => {
    await failsWith(P.classSubject(v, CA.id, 'math'), 403, ERR_NO_ACCESS)
    await failsWith(P.classOverview(v, CA.id), 403, ERR_NO_ACCESS)
    await failsWith(P.briefing(v, 'class', CA.id), 403, ERR_NO_ACCESS)
    const s = (await P.student(v, 'stu-A-1')).data
    expect(s.panels.every((p) => p.access === 'greyed')).toBe(true)
    expect(s.access).toBe('subject_only')
  })
})

describe('מורה בלי שיוך לכיתות / כיתה שחסרה בניתוח', () => {
  it('מורה בלי כיתות: config, roster ו-entry ריקים (לא שגיאה); כל ישות 404', async () => {
    const v = live([])
    expect((await P.config(v)).data).toMatchObject({ enabled: true, lens: 'subject_teacher', classes: [], availableLenses: ['subject_teacher'] })
    expect((await P.roster(v)).data).toEqual({ classes: [], students: [] })
    const e = (await P.entry(v)).data
    expect(e).toMatchObject({ classes: [], alerts: [], alertsTotal: 0, unclassifiedCount: 0, coverageNote: null })
    await failsWith(P.student(v, 'stu-A-1'), 404, ERR_NOT_FOUND)
    await failsWith(P.feedback(v, 'stu-A-1'), 404, ERR_NOT_FOUND)
    await failsWith(P.classSubject(v, CA.id, 'math'), 404, ERR_NOT_FOUND)
    await failsWith(P.classOverview(v, CA.id), 404, ERR_NOT_FOUND)
    await failsWith(P.briefing(v, 'student', 'stu-A-1'), 404, ERR_NOT_FOUND)
    await failsWith(P.briefing(v, 'class', CA.id), 404, ERR_NOT_FOUND)
  })
  it('grant לכיתה שאינה בניתוח: מדולגת בלי קריסה, והכיתות האחרות נשארות', async () => {
    const v = live([grant('cls-ghost', { homeroom: true }), grant(CB.id, { subjects: ['math'] })])
    expect((await P.config(v)).data.classes.map((c) => c.id)).toEqual([CB.id])
    expect((await P.roster(v)).data.classes.map((c) => c.id)).toEqual([CB.id])
    expect((await P.entry(v)).data.classes.map((c) => c.id)).toEqual([CB.id])
    await failsWith(P.classOverview(v, 'cls-ghost'), 404, ERR_NOT_FOUND)
  })
  it('כיתה ריקה (בלי תלמידים) בהיקף מחנך: מופיעה בלי קריסה, hasResults=false ומצב "אין עדיין"', async () => {
    const v = live([grant(CD.id, { homeroom: true })])
    const e = await P.entry(v)
    expect(e.dataState).toBe('insufficient')
    expect(e.data.classes[0]).toMatchObject({ id: CD.id, studentCount: 0, attentionCount: 0, hasResults: false })
    expect((await P.classOverview(v, CD.id)).data.summary.length).toBeGreaterThan(0)
    const empty = (await P.classSubject(v, CD.id, 'math').catch((e: unknown) => e)) as { status?: number }
    expect(empty.status).toBe(404) /* מקצוע שאינו בכיתה בכלל */
  })
})

describe('אחידות 404: כיתה/תלמיד מחוץ להיקף נראים בדיוק כמו כאלה שאינם קיימים', () => {
  const v = live([grant(CA.id, { homeroom: true })])
  const calls: [string, (id: string) => Promise<unknown>][] = [
    ['student', (id) => P.student(v, id)],
    ['feedback', (id) => P.feedback(v, id)],
    ['briefing student', (id) => P.briefing(v, 'student', id)],
    ['classOverview', (id) => P.classOverview(v, id)],
    ['classSubject', (id) => P.classSubject(v, id, 'math')],
    ['briefing class', (id) => P.briefing(v, 'class', id)],
  ]
  for (const [name, call] of calls) {
    it(name, async () => {
      const outside = name.includes('class') || name === 'classOverview' || name === 'classSubject' ? CB.id : 'stu-B-0'
      const e1 = await call(outside).catch((e: unknown) => e) as { status: number; message: string }
      const e2 = await call('does-not-exist').catch((e: unknown) => e) as { status: number; message: string }
      expect(e1.status).toBe(404)
      expect({ status: e1.status, message: e1.message }).toEqual({ status: e2.status, message: e2.message })
    })
  }
})

describe('מנהל: אגרגטים בלבד', () => {
  it('נקודות מורה → 403 (ERR_AGGREGATE_ONLY) לפי תפקיד, גם על ישות שאינה קיימת', async () => {
    await failsWith(P.student(adminViewer, 'stu-A-1'), 403, ERR_AGGREGATE_ONLY)
    await failsWith(P.student(adminViewer, 'nope'), 403, ERR_AGGREGATE_ONLY)
    await failsWith(P.feedback(adminViewer, 'stu-A-1'), 403, ERR_AGGREGATE_ONLY)
    await failsWith(P.classOverview(adminViewer, CA.id), 403, ERR_AGGREGATE_ONLY)
    await failsWith(P.classSubject(adminViewer, CA.id, 'math'), 403, ERR_AGGREGATE_ONLY)
    await failsWith(P.briefing(adminViewer, 'class', CA.id), 403, ERR_AGGREGATE_ONLY)
    await failsWith(P.briefing(adminViewer, 'student', 'stu-A-1'), 403, ERR_AGGREGATE_ONLY)
  })
  it('config / roster / entry: 200 ריקים — אין רשימת כיתות ואין תלמידים, גם כשהמקור "מחזיר" את כל הכיתות; בלי טעינת ניתוח מיותרת', async () => {
    const src = fakeSource(STANDARD)
    const p = createProvider(src)
    expect((await p.config(adminViewer)).data).toMatchObject({ enabled: true, lens: 'admin', classes: [], subjects: [], availableLenses: ['admin'] })
    expect((await p.roster(adminViewer)).data).toEqual({ classes: [], students: [] })
    expect((await p.entry(adminViewer)).data).toMatchObject({ classes: [], alerts: [], alertsTotal: 0, unclassifiedCount: 0, coverageNote: null })
    expect(src.analysisCalls).toBe(0)
  })
  it('מורה מול נקודת מנהל → 403 (ERR_NO_ACCESS)', async () => {
    await failsWith(P.admin(live([grant(CA.id, { homeroom: true })])), 403, ERR_NO_ACCESS)
  })
})

describe('תמונת המנהל על נתונים דלילים: כללי adminPrivacy מוחלים', () => {
  const adminOf = async (w: World) => (await providerOf(analyze(w)).admin(adminViewer)).data
  const ALL = (w: World): string[] => [...w.students.flatMap((s) => [s.id, s.displayName, s.firstName]), ...w.classes.flatMap((c) => [c.id, c.name])]

  it('בית ספר רגיל: אין שם/מזהה תלמיד או כיתה, שכבה קטנה (3 תלמידים) נעלמת ואיתה הסך, ועוברת את הסכמה', async () => {
    const w = standardWorld()
    const out = await adminOf(w)
    expect(EP.admin.response.safeParse({ dataState: 'ok', data: out }).success).toBe(true)
    const json = JSON.stringify(out)
    for (const s of ALL(w)) expect(json.includes(s), s).toBe(false)
    expect(out.grades.map((g) => g.grade)).toEqual([5])
    expect(out.cells.every((c) => c.grade === 5)).toBe(true)
    expect(out.gradeRows.map((g) => g.grade)).toEqual([5])
    /* שכבה ו׳ מוסתרת → הסך לא מתפרסם (חיסור היה חושף אותה) */
    expect(out.highlights[0]).toBe(narrateAdminSchoolPartial(1))
    expect(out.highlights[0]).not.toBe(narrateAdminSchool(1, w.classes.length, w.students.length))
    expect(json).not.toContain(String(w.students.length))
    expect(json).not.toMatch(/teacher|מורה/i)
  })

  it('כשכל השכבות מוצגות — הסך מתפרסם', async () => {
    const w = world([CA, CB], [...ids('stu-A', 5).map((id) => ({ id, classId: CA.id })), ...ids('stu-B', 5).map((id) => ({ id, classId: CB.id }))])
    const out = await adminOf(w)
    expect(out.highlights[0]).toBe(narrateAdminSchool(1, 2, 10))
  })

  it('6 רשומים ותורם אחד: התא מוסתר (small_cell) ואין ממוצע שהוא רמתו האישית של התלמיד', async () => {
    const w = world([CA, CB], [
      ...ids('stu-A', 3).map((id, i) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[], noData: i > 0 })),
      ...ids('stu-B', 3).map((id) => ({ id, classId: CB.id, subjects: ['math'] as SubjectCode[], noData: true })),
    ])
    const out = await adminOf(w)
    expect(out.cells).toEqual([expect.objectContaining({ status: 'hidden', reason: 'small_cell', text: ADMIN_HIDDEN_CELL_TEXT })])
    expect(Object.keys(out.cells[0])).not.toContain('avgLevel')
    expect(out.hiddenCells).toBe(1)
    expect(out.progress).toEqual([])
  })

  it('מקצוע בלי אף תורם (כולם בלי נתונים): אין תא בכלל — לא "מוסתר" שמרמז על נתונים', async () => {
    const w = world([CA, CB], [
      ...ids('stu-A', 5).map((id) => ({ id, classId: CA.id, subjects: ['math', 'science'] as SubjectCode[], sessions: (s: SubjectCode) => (s === 'math' ? ceiling() : []) })),
      ...ids('stu-B', 5).map((id) => ({ id, classId: CB.id, subjects: ['math', 'science'] as SubjectCode[], sessions: (s: SubjectCode) => (s === 'math' ? ceiling() : []) })),
    ])
    const out = await adminOf(w)
    expect(out.cells.map((c) => c.subject.code)).toEqual(['math'])
    expect(out.hiddenCells).toBe(0)
  })

  it('9 תורמים מכיתה אחת בלבד: מוסתר (single_class) — לא ניתן לזהות כיתה ומורה', async () => {
    const w = world([CA, CB], [
      ...ids('stu-A', 9).map((id) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[] })),
      ...ids('stu-B', 5).map((id) => ({ id, classId: CB.id, subjects: ['math'] as SubjectCode[], noData: true })),
    ])
    const out = await adminOf(w)
    expect(out.cells).toEqual([expect.objectContaining({ status: 'hidden', reason: 'single_class', text: ADMIN_HIDDEN_CELL_SINGLE_CLASS_TEXT })])
    expect(JSON.stringify(out)).not.toContain('avgLevel')
    expect(out.hiddenCells).toBe(1)
  })

  it('regression (חוק 9): 4 מכיתה אחת + 1 מכיתה שנייה — מוסתר (dominant_class): הממוצע היה בפועל ממוצע כיתה אחת, וחיסור התורם הבודד חושף אותו', async () => {
    const w = world([CA, CB], [
      ...ids('stu-A', 4).map((id) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[] })),
      { id: 'stu-B-0', classId: CB.id, subjects: ['math'] as SubjectCode[] },
      ...ids('stu-B-extra', 6).map((id) => ({ id, classId: CB.id, subjects: ['math'] as SubjectCode[], noData: true })),
    ])
    const out = await adminOf(w)
    expect(out.cells).toEqual([expect.objectContaining({ status: 'hidden', reason: 'dominant_class', text: ADMIN_HIDDEN_CELL_DOMINANT_CLASS_TEXT })])
    expect(JSON.stringify(out)).not.toContain('avgLevel')
    expect(out.hiddenCells).toBe(1)
    expect(out.progress).toEqual([])
  })

  it('5 מכיתה אחת + 5 מכיתה שנייה (ועוד 6 בלי נתונים): מוצג; הממוצע מתורמים בלבד', async () => {
    const w = world([CA, CB], [
      ...ids('stu-A', 5).map((id) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[] })),
      ...ids('stu-B', 5).map((id) => ({ id, classId: CB.id, subjects: ['math'] as SubjectCode[] })),
      ...ids('stu-B-extra', 6).map((id) => ({ id, classId: CB.id, subjects: ['math'] as SubjectCode[], noData: true })),
    ])
    const out = await adminOf(w)
    const cell = out.cells[0]
    expect(cell).toMatchObject({ status: 'shown', studentCount: 10 })
    if (cell.status === 'shown') {
      expect(cell.avgLevel).toBe(9)
      expect(cell.studentCount).toBeLessThan(w.students.filter((s) => s.subjects.includes('math')).length) /* נספרים תורמים, לא רשומים */
    }
  })

  it('מגמה: עם פחות מ-5 תלמידים עם חלון ישן → trendDelta=0 ו"אין עדיין מספיק נתונים" (לא שינוי אישי)', async () => {
    const young = (): SessionRec[] => spread(15, () => [0.8, 9], 70) /* אין נתונים 90–150 ימים אחורה */
    const w = world([CA, CB], [
      ...ids('stu-A', 5).map((id) => ({ id, classId: CA.id, subjects: ['math'] as SubjectCode[], sessions: young })),
      ...ids('stu-B', 4).map((id) => ({ id, classId: CB.id, subjects: ['math'] as SubjectCode[], sessions: young })),
      { id: 'stu-B-old', classId: CB.id, subjects: ['math'], sessions: () => [...young(), ...spread(10, () => [0.5, 6], 200).filter((s) => s.day >= 100)] },
    ])
    const out = await adminOf(w)
    const cell = out.cells[0]
    expect(cell.status).toBe('shown')
    if (cell.status === 'shown') { expect(cell.trendDelta).toBe(0); expect(cell.trend).toBe('insufficient') }
  })
})

describe('דגל כיתה-אחת ושכבות: ספק ההדגמה (עולם הדמו) לא השתנה', () => {
  it('מנהל על עולם הדמו: כל תא מוצג מבוסס על ≥5 תורמים; אין שכבה/תפיסה שמפרה את הספים', async () => {
    const out = (await demoProvider.admin({ lens: 'admin', guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] })).data
    for (const c of out.cells) if (c.status === 'shown') expect(c.studentCount).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
    for (const m of out.misconceptions) {
      expect(m.studentsShowing).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
      expect(m.studentsExposed - m.studentsShowing).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
    }
    for (const g of out.grades) expect(g.studentCount).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
  })
})

describe('מקור שטועה לא מרחיב הרשאה', () => {
  it('classIds של המקור חושף את כל הכיתות; הליבה מחזירה רק כיתות עם grant', async () => {
    const v = live([grant(CB.id, { subjects: ['math'] })])
    expect(scopeClassIds(v)).toEqual([CB.id])
    expect((await P.config(v)).data.classes.map((c) => c.id)).toEqual([CB.id])
    expect((await P.roster(v)).data.classes.map((c) => c.id)).toEqual([CB.id])
    expect((await P.entry(v)).data.classes.map((c) => c.id)).toEqual([CB.id])
    expect((await P.roster(v)).data.students.every((s) => s.classId === CB.id)).toBe(true)
  })
})

describe('כיסוי נתונים ומשוב בלי משחקים', () => {
  it('הדמיות בלי מקצוע: unclassifiedCount ו-coverageNote מהמקור (בניסוח מ-findingsNarrative)', async () => {
    const p = providerOf(STANDARD, { coverage: () => ({ unclassifiedSessions: 7, detailAvailableFrom: null }) })
    const e = (await p.entry(live([grant(CA.id, { homeroom: true })]))).data
    expect(e.unclassifiedCount).toBe(7)
    expect(e.coverageNote).toBe(narrateUnclassifiedNote(7))
    expect(EP.entry.response.safeParse({ dataState: 'ok', data: e }).success).toBe(true)
    const one = (await providerOf(STANDARD, { coverage: () => ({ unclassifiedSessions: 1, detailAvailableFrom: null }) }).entry(live([grant(CA.id, { homeroom: true })]))).data
    expect(one.coverageNote).toBe(narrateUnclassifiedNote(1))
    expect(one.coverageNote).not.toBe(e.coverageNote)
  })
  it('משוב לתלמיד בלי אף משחק: צעד הבא כללי, לא "השלמת 0 הדמיות"', async () => {
    const fb = (await P.feedback(live([grant(CA.id, { homeroom: true })]), 'stu-A-nodata')).data
    expect(fb.items).toHaveLength(1)
    expect(fb.items[0].kind).toBe('next_step')
    expect(fb.items[0].text).toBe(narrateFeedbackNextStep(fb.items[0].subject.nameHe, null))
    expect(fb.items.some((i) => i.kind === 'streak')).toBe(false)
    expect(EP.feedback.response.safeParse({ dataState: 'ok', data: fb }).success).toBe(true)
  })
  it('תלמיד בלי נתונים: מסך התלמיד נבנה (שורות ריקות) בלי קריסה', async () => {
    const o = await P.student(live([grant(CA.id, { homeroom: true })]), 'stu-A-nodata')
    expect(o.dataState).toBe('insufficient')
    expect(o.data.panels.every((p) => p.access === 'visible' && p.currentLevel === null && p.sessionsCount === 0)).toBe(true)
    expect(EP.student.response.safeParse(o).success).toBe(true)
  })
})

describe('מקצועות הכיתה: ההצהרה של המקור + מה שלומדים תלמידיה', () => {
  it('מקור שמצהיר על מקצוע בלי נתונים נשאר (מורה שמלמד אותו רואה אותו פתוח); מקצוע שיש בו נתונים לא נעלם גם אם המקור לא הצהיר עליו', async () => {
    const p = providerOf(STANDARD, { classSubjects: (_a, id) => (id === CB.id ? ['science'] : []) })
    const mixed = live([grant(CA.id, { homeroom: true }), grant(CB.id, { subjects: ['science'] })])
    const r = (await p.roster(mixed)).data
    expect(r.classes[0].subjects.map((s) => s.code).sort()).toEqual(['history', 'math']) /* A: ממה שלומדים התלמידים */
    expect(r.classes[1].subjects.map((s) => s.code)).toEqual(['science']) /* B: מתמטיקה והיסטוריה נעולות, מדעים פתוח למרות שאין נתונים */
    expect(r.classes[1].lockedSubjects.map((s) => s.code).sort()).toEqual(['history', 'math'])
    const view = await p.classSubject(mixed, CB.id, 'science')
    expect(view.dataState).toBe('insufficient')
    expect(view.data.students).toEqual([])
    expect(EP.classSubject.response.safeParse(view).success).toBe(true)
  })
})

describe('config: עדשה יחידה לכל צופה אמיתי; בורר עדשות רק למורה אורח', () => {
  it('לא-אורח: availableLenses=[lens]; אורח: מהמקור', async () => {
    const v = live([grant(CA.id, { homeroom: true })])
    const src = fakeSource(STANDARD, { configParts: () => ({ availableLenses: ['homeroom', 'subject_teacher', 'admin'], subjects: [], dataNotice: 'x', curriculumNotice: null }) })
    const p = createProvider(src)
    expect((await p.config(v)).data.availableLenses).toEqual(['homeroom'])
    expect((await p.config({ ...v, guest: true })).data.availableLenses).toEqual(['homeroom', 'subject_teacher', 'admin'])
    expect((await p.config(v)).data.dataNotice).toBe('x')
  })
})

describe('רישום צפיות ברמת תלמיד (audit sink)', () => {
  const v = live([grant(CA.id, { homeroom: true }), grant(CB.id, { subjects: ['math'] })])
  it('roster: כל התלמידים שברשימה; entry: רק מי שמופיע בהתרעות; student/feedback/תדריך תלמיד: התלמיד', async () => {
    const r = sink()
    const roster = (await P.roster(v, { audit: r })).data
    expect([...r.ids].sort()).toEqual(roster.students.map((s) => s.id).sort())
    const e = sink()
    const entry = (await P.entry(v, { audit: e })).data
    expect([...e.ids].sort()).toEqual(entry.alerts.map((a) => a.studentId).sort())
    for (const call of [(a: AuditSink) => P.student(v, 'stu-A-1', { audit: a }), (a: AuditSink) => P.feedback(v, 'stu-A-1', { audit: a }), (a: AuditSink) => P.briefing(v, 'student', 'stu-A-1', { audit: a })]) {
      const s = sink()
      await call(s)
      expect([...s.ids]).toEqual(['stu-A-1'])
    }
  })
  it('סקירה: התלמידים שמופיעים בטקסטי ההתרעות; מקצוע בכיתה: תלמידי המקצוע; תדריך כיתה ומנהל: אף אחד', async () => {
    const o = sink()
    const overview = (await P.classOverview(v, CA.id, { audit: o })).data
    expect(o.ids.has('stu-A-0')).toBe(true)
    expect(overview.rows.some((r) => r.alertTexts.length > 0)).toBe(true)
    const cs = sink()
    const view = (await P.classSubject(v, CB.id, 'math', { audit: cs })).data
    expect([...cs.ids].sort()).toEqual(view.students.map((s) => s.id).sort())
    const bc = sink()
    await P.briefing(v, 'class', CA.id, { audit: bc })
    expect(bc.ids.size).toBe(0)
    const ad = sink()
    await P.roster(adminViewer, { audit: ad })
    await P.entry(adminViewer, { audit: ad })
    expect(ad.ids.size).toBe(0)
  })
  it('דחייה (404/403) לא נרשמת: לא נחשפה שום תשובה', async () => {
    const s = sink()
    await P.student(v, 'stu-C-0', { audit: s }).catch(() => undefined)
    await P.classSubject(v, CB.id, 'history', { audit: s }).catch(() => undefined)
    expect(s.ids.size).toBe(0)
  })
})

describe('ספק ההדגמה = createProvider(demoSource): אותה תוצאה כמו תמיד לצופה בפרסונת אורח', () => {
  const A = getAnalysis()
  it('הכניסה של מחנך ההדגמה כוללת isHomeroom ו-hasResults', async () => {
    const e = (await demoProvider.entry({ lens: 'homeroom', guest: true, homeroomClassId: 'c-v2', teachingClassIds: [], subjectCodes: [] })).data
    expect(e.classes).toHaveLength(1)
    expect(e.classes[0].hasResults).toBe(true)
    expect(e.unclassifiedCount).toBe(0)
    expect(e.coverageNote).toBeNull()
    const r = (await demoProvider.roster({ lens: 'homeroom', guest: true, homeroomClassId: 'c-v2', teachingClassIds: [], subjectCodes: [] })).data
    expect(r.classes[0].isHomeroom).toBe(true)
    expect(r.students.length).toBe(A.classById.get('c-v2')!.studentIds.length)
  })
  it('מנהל הדמיה: אין יותר רשימת כיתות ב-config וב-roster', async () => {
    const admin: V2Viewer = { lens: 'admin', guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
    expect((await demoProvider.config(admin)).data.classes).toEqual([])
    expect((await demoProvider.roster(admin)).data.classes).toEqual([])
    const spy = vi.fn()
    spy((await demoProvider.config(admin)).data.availableLenses)
    expect(spy).toHaveBeenCalledWith(['homeroom', 'subject_teacher', 'admin'])
  })
})
