/* G1: אמת במצבים ריקים — קטלוג לא פעיל, הערות כיתוי ממוקדות (כיתה / תלמיד/ה), שיוך בלי מקצוע, "אין חריג" רק עם בסיס, עמודת מגמה שאומרת כמה חסר,
   מצב ריק כן אצל מנהל, ושינויי הניסוח (משחקים, תצפית, בלי לוכסנים). הכול על ספק מזויף — בלי DB. */
import { describe, expect, it } from 'vitest'
import { FORBIDDEN_UI_TERMS } from '../../../../src/shared/lib/forbiddenTerms.js'
import {
  ADMIN_MIN_CELL_CLASSES, ATTENTION_THIN_TEXT, CATALOG_UNTAGGED_TEXT, EMPTY_TEXT, GROUP_TREND_NOT_SHOWN_TEXT, LEVEL_TREND_STEADY_SUCCESS_NOTE, LIVE_COVERAGE_UNTAGGED, V2_CLIENT_TEXT,
  gapReason, narrateAdminHiddenNote, narrateAdminNoResults, narrateAdminUnclassifiedNote, narrateEntryBasisNote, narrateErrorsTabSummary, narrateFinding, narrateGradeSize,
  narrateNoOpenSubjectNote, narrateOverviewSummary, narrateScopedCoverageNote, narrateShortBody, narrateStudentHeadline, narrateSubjectHeadline, narrateTrendNeedMore,
  narrateUnclassifiedNote, playsWithoutLevelSentence,
} from '../../../../src/shared/lib/findingsNarrative.js'
import type { Evidence } from '../../../../src/shared/types/analyticsV2.js'
import { EP } from '../../../../src/shared/types/analyticsV2.js'
import { MIN_CELL_CLASSES } from './adminPrivacy.js'
import { demoProvider, getAnalysis } from './demoProvider.js'
import { analyze } from './engine.js'
import { createProvider } from './providerCore.js'
import { CA, CB, adminViewer, fakeSource, grant, ids, live, spread, world } from './providerTestkit.js'
import type { ScopedGap } from './source.js'

const homeroom = (classId = CA.id) => live([grant(classId, { homeroom: true })])
const withData = (prefix: string, n: number, classId: string) => ids(prefix, n).map((id) => ({ id, classId, subjects: ['math'] as ('math')[] }))
const noData = (prefix: string, n: number, classId: string) => ids(prefix, n).map((id) => ({ id, classId, subjects: ['math'] as ('math')[], noData: true }))
const hasTerm = (s: string): string[] => FORBIDDEN_UI_TERMS.filter((t) => t.re.test(s)).map((t) => t.name)

/* ══════════════════════════════════════════════════════════════════════════
   UX#1 — קטלוג ריק (נתוני אמת בלי תיוג)
   ══════════════════════════════════════════════════════════════════════════ */
describe('קטלוג ריק: טעויות נפוצות ותחומים אינם פעילים — ולא מבטיחים שיופיעו', () => {
  const a = analyze(world([CA, CB], [...withData('a', 6, CA.id), ...withData('b', 6, CB.id)]))
  const emptyCatalog = createProvider(fakeSource(a, { coverage: () => ({ unclassifiedSessions: 0, detailAvailableFrom: null, catalogEmpty: true }) }))
  const ready = createProvider(fakeSource(a))

  it('סיכום מקצוע בכיתה: catalogReady=false, catalogNote המשפט הכן, ומשפט הלשונית "טעויות נפוצות" אינו מבטיח', async () => {
    const out = (await emptyCatalog.classSubject(homeroom(), CA.id, 'math')).data
    expect(EP.classSubject.response.safeParse({ dataState: 'ok', data: out }).success).toBe(true)
    expect(out.catalogReady).toBe(false)
    expect(out.catalogNote).toBe(LIVE_COVERAGE_UNTAGGED)
    expect(out.tabSummaries.misconceptions).toBe(CATALOG_UNTAGGED_TEXT.errorsTabSummary)
    expect(out.tabSummaries.misconceptions).not.toMatch(/יופיעו|יצטברו|כשיסיימו/)
  })

  it('המשפט הכן: מה זה, שזה לא פעיל בחשבון, שאין מה לעשות, ובלי הבטחת תאריך', () => {
    const t = LIVE_COVERAGE_UNTAGGED
    expect(t).toContain('טעויות נפוצות')
    expect(t).toContain('עדיין לא פעילים בחשבון שלכם')
    expect(t).toContain('אין מה לעשות מצדכם')
    expect(t).not.toMatch(/יופיעו|יצטברו|בקרוב|בהמשך|אחרי ש/)
    for (const s of [t, ...Object.values(CATALOG_UNTAGGED_TEXT).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)))]) {
      expect(hasTerm(s), s).toEqual([])
      expect(s).not.toMatch(/יופיעו|יצטברו|בקרוב/)
    }
  })

  it('סקירת כיתה, תלמיד/ה ומנהל מדווחים אותו דבר', async () => {
    const ov = (await emptyCatalog.classOverview(homeroom(), CA.id)).data
    expect(EP.classOverview.response.safeParse({ dataState: 'ok', data: ov }).success).toBe(true)
    expect(ov).toMatchObject({ catalogReady: false, catalogNote: LIVE_COVERAGE_UNTAGGED })
    const st = (await emptyCatalog.student(homeroom(), 'a-0')).data
    expect(st).toMatchObject({ catalogReady: false, catalogNote: LIVE_COVERAGE_UNTAGGED })
    const ad = (await emptyCatalog.admin(adminViewer)).data
    expect(EP.admin.response.safeParse({ dataState: 'ok', data: ad }).success).toBe(true)
    expect(ad).toMatchObject({ catalogReady: false, catalogNote: LIVE_COVERAGE_UNTAGGED })
  })

  it('קטלוג פעיל (או הדגמה): catalogReady=true, בלי הערה, והניסוח הרגיל נשמר', async () => {
    const out = (await ready.classSubject(homeroom(), CA.id, 'math')).data
    expect(out).toMatchObject({ catalogReady: true, catalogNote: null })
    expect(out.tabSummaries.misconceptions).toBe(EMPTY_TEXT.noCommonErrors)
    const demo = (await demoProvider.classOverview({ lens: 'homeroom', guest: true, homeroomClassId: 'c-v2', teachingClassIds: [], subjectCodes: [] }, 'c-v2')).data
    expect(demo).toMatchObject({ catalogReady: true, catalogNote: null, coverageNote: null })
  })

  it('narrateErrorsTabSummary: catalogReady=false גובר; חסר = כרגיל', () => {
    expect(narrateErrorsTabSummary({ common: [], anyReported: false, maxTitles: 3, catalogReady: false })).toBe(CATALOG_UNTAGGED_TEXT.errorsTabSummary)
    expect(narrateErrorsTabSummary({ common: [], anyReported: false, maxTitles: 3 })).toBe(EMPTY_TEXT.noCommonErrors)
    expect(V2_CLIENT_TEXT.areasDash).toBe('מקף (—) אומר שהנתון עוד לא נמדד.')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   UX#2 — הערת כיסוי ממוקדת: המצב הריק אומר את הסיבה האמיתית ואת הפעולה
   ══════════════════════════════════════════════════════════════════════════ */
describe('הערת כיסוי ממוקדת (כיתה / תלמיד/ה)', () => {
  const empty = analyze(world([CA], noData('e', 5, CA.id)))
  const gapOfIds = (perStudent: ScopedGap) => (_v: unknown, _a: unknown, studentIds: readonly string[]): ScopedGap => ({
    unclassified: perStudent.unclassified * studentIds.length, withoutLevel: perStudent.withoutLevel * studentIds.length,
  })
  const withGap = (g: ScopedGap) => createProvider(fakeSource(empty, { scopedGap: gapOfIds(g) as never }))

  it('כיתה: משחקים בהדמיות בלי מקצוע — הסיכום והמצב הריק אומרים זאת, ואין "התמונה תופיע כשתלמידים יסיימו"', async () => {
    const out = (await withGap({ unclassified: 2, withoutLevel: 0 }).classOverview(homeroom(), CA.id)).data
    expect(EP.classOverview.response.safeParse({ dataState: 'insufficient', data: out }).success).toBe(true)
    expect(out.coverageNote).toBe(narrateScopedCoverageNote({ unclassified: 10, withoutLevel: 0 }))
    expect(out.coverageNote).toContain('10 משחקים בהדמיות שעוד לא שויך להן מקצוע')
    expect(out.summary).toContain(gapReason({ unclassified: 10, withoutLevel: 0 })!)
    expect(out.summary).not.toContain('התמונה תופיע כשתלמידים יסיימו')
  })

  it('מקצוע בכיתה: אותה הערה, והכותרת אומרת את הסיבה', async () => {
    const out = (await withGap({ unclassified: 1, withoutLevel: 0 }).classSubject(homeroom(), CA.id, 'math')).data
    expect(out.coverageNote).toBe(narrateScopedCoverageNote({ unclassified: 5, withoutLevel: 0 }))
    expect(out.summary.headline).toContain(gapReason({ unclassified: 5, withoutLevel: 0 })!)
  })

  it('תלמיד/ה: ההערה לפי המשחקים של התלמיד/ה עצמו/ה; הסיכום אומר "עוד אין מספיק נתונים" + הסיבה, לא "אין דבר חריג"', async () => {
    const out = (await withGap({ unclassified: 3, withoutLevel: 0 }).student(homeroom(), 'e-0')).data
    expect(EP.student.response.safeParse({ dataState: 'insufficient', data: out }).success).toBe(true)
    expect(out.coverageNote).toBe(narrateScopedCoverageNote({ unclassified: 3, withoutLevel: 0 }))
    expect(out.summary).toBe(narrateStudentHeadline({ firstName: 'שם-e-0', attention: 0, positive: 0, crossSubject: false, hasBasis: false, gap: { unclassified: 3, withoutLevel: 0 } }))
    expect(out.summary).not.toContain('אין כרגע דבר חריג')
  })

  it('משחקים בהדמיות עם מקצוע שלא חושבה להם רמה: ההערה והסיבה מנוסחות בהתאם', async () => {
    const out = (await withGap({ unclassified: 0, withoutLevel: 2 }).classOverview(homeroom(), CA.id)).data
    expect(out.coverageNote).toBe(playsWithoutLevelSentence(10))
    expect(out.summary).toContain('לא חושבה להם רמה לפי מקצוע')
  })

  it('שיוך בדיעבד לא מחזיר משחקים שכבר שוחקו — ההערה אומרת זאת ואינה מבטיחה ש"התוצאות יתווספו"', () => {
    const t = narrateUnclassifiedNote(4)
    expect(t).toContain('לא ייכללו גם אחרי שיוך מקצוע')
    expect(t).toContain('משחקים חדשים ייספרו')
    expect(t).not.toContain('יתווספו')
    expect(gapReason({ unclassified: 1, withoutLevel: 0 })).toContain('משחקים חדשים ייספרו')
  })

  it('בלי פער (או ספק בלי scopedGap, כמו הדגמה): coverageNote=null והסיכום כמו תמיד', async () => {
    const none = (await createProvider(fakeSource(empty)).classOverview(homeroom(), CA.id)).data
    expect(none.coverageNote).toBeNull()
    expect(none.summary).toBe(narrateOverviewSummary({ className: CA.name, above: 0, within: 0, below: 0, attentionStudents: 0 }))
    expect(narrateScopedCoverageNote(null)).toBeNull()
    expect(narrateScopedCoverageNote({ unclassified: 0, withoutLevel: 0 })).toBeNull()
  })

  it('ללא תלות במקצוע/תלמיד אחר: הכיתה הזאת בלבד נספרת (מזהי התלמידים שמועברים למקור)', async () => {
    const seen: string[][] = []
    const p = createProvider(fakeSource(empty, { scopedGap: (_v, _a, studentIds) => { seen.push([...studentIds]); return { unclassified: 0, withoutLevel: 0 } } }))
    await p.classOverview(homeroom(), CA.id)
    await p.student(homeroom(), 'e-2')
    expect(seen).toEqual([ids('e', 5), ['e-2']])
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   UX#5 — שיוך בלי מקצוע; UX#9 — "אין חריג" רק עם בסיס
   ══════════════════════════════════════════════════════════════════════════ */
describe('מסך הכניסה: שיוך בלי מקצוע ובסיס ל"אין תלמידים לתשומת לב"', () => {
  it('שיוך בלי מקצוע: noOpenSubject וגודל הכיתה האמיתי; מחנך ומורה עם מקצוע — לא', async () => {
    const a = analyze(world([CA, CB], [...withData('a', 6, CA.id), ...withData('b', 4, CB.id)]))
    const p = createProvider(fakeSource(a))
    const v = live([grant(CA.id, { unspecified: true }), grant(CB.id, { subjects: ['math'] })])
    const e = (await p.entry(v)).data
    expect(EP.entry.response.safeParse({ dataState: 'ok', data: e }).success).toBe(true)
    const byId = Object.fromEntries(e.classes.map((c) => [c.id, c]))
    expect(byId[CA.id]).toMatchObject({ noOpenSubject: true, studentCount: 6, hasResults: false })
    expect(byId[CB.id]).toMatchObject({ noOpenSubject: false, studentCount: 4, hasResults: true })
    expect(e.coverageNote).toContain(narrateNoOpenSubjectNote([CA.name]))
    expect((await p.entry(homeroom())).data.classes[0].noOpenSubject).toBe(false)
  })

  it('המשפט אומר מה קרה ולמי לפנות: יחיד / רבים, בלי "יכולים להגדיר" ובלי לוכסנים חדשים', () => {
    const one = narrateNoOpenSubjectNote(['ו׳1'])
    expect(one).toBe('אתם משויכים לכיתה ו׳1 אבל עוד לא הוגדר לכם בה מקצוע, ולכן אין לכם נתונים בה. את המקצוע מגדירים בניהול הכיתות — פנו למנהל/ת בית הספר.')
    const two = narrateNoOpenSubjectNote(['ו׳1', 'ה׳2'])
    expect(two).toContain('לכיתות')
    expect(two).toContain('בהן')
    expect(narrateNoOpenSubjectNote(['א', 'ב', 'ג', 'ד'])).toContain('ל-4 כיתות')
    for (const t of [one, two]) expect(t.match(/\//g)?.length ?? 0).toBe(1) /* "מנהל/ת" — הלוכסן הקיים היחיד */
    expect(V2_CLIENT_TEXT.noOpenSubject.whatNext).not.toContain('יכולים להגדיר')
    expect(V2_CLIENT_TEXT.noOpenSubject.title).toContain('שלכם')
  })

  it('כיתה שנבדקו בה פחות ממחצית התלמידים וללא תשומת לב: basisNote במקום תג ירוק; מחצית ומעלה — null', async () => {
    const thin = analyze(world([CA], [...withData('d', 2, CA.id), ...noData('n', 6, CA.id)]))
    const e = (await createProvider(fakeSource(thin)).entry(homeroom())).data.classes[0]
    expect(e).toMatchObject({ hasResults: true, attentionCount: 0, studentsAssessed: 2, studentCount: 8 })
    expect(e.basisNote).toBe(narrateEntryBasisNote(2, 8))
    expect(e.basisNote).toBe('נתונים על 2 מתוך 8 תלמידים — עוד מוקדם לדעת.')
    const enough = analyze(world([CA], [...withData('d', 5, CA.id), ...noData('n', 3, CA.id)]))
    const e2 = (await createProvider(fakeSource(enough)).entry(homeroom())).data.classes[0]
    expect(e2).toMatchObject({ hasResults: true, attentionCount: 0, studentsAssessed: 5, basisNote: null })
    expect(narrateEntryBasisNote(0, 8)).toBe('עוד אין מספיק נתונים כדי לזהות שינוי.')
  })

  it('סיכום תלמיד/ה: בלי מגמה שנבדקה — "עוד אין מספיק נתונים כדי לזהות שינוי"; עם מגמה שנבדקה (גם כשיציבה) — "אין כרגע דבר חריג"', async () => {
    const a = analyze(world([CA], [{ id: 'few', classId: CA.id, subjects: ['math'], sessions: () => spread(2, () => [0.7, 6]) }, ...withData('d', 1, CA.id)]))
    const p = createProvider(fakeSource(a))
    const few = (await p.student(homeroom(), 'few')).data
    expect(few.summary).toBe('עוד אין מספיק נתונים כדי לזהות שינוי אצל שם-few.')
    expect(few.summary).not.toContain('אין כרגע דבר חריג')
    const steady = (await p.student(homeroom(), 'd-0')).data
    expect(steady.summary).toBe('שם-d-0: אין כרגע דבר חריג לדווח.')
  })

  it('סקירה ומקצוע בכיתה: "אין תלמידים לתשומת לב" רק כשנבדקה מגמה אצל לפחות מחצית; אחרת משפט ניטרלי', async () => {
    const thin = createProvider(fakeSource(analyze(world([CA], [...withData('d', 3, CA.id), ...noData('n', 8, CA.id)]))))
    const sub = (await thin.classSubject(homeroom(), CA.id, 'math')).data.summary.headline
    expect(sub).toContain(ATTENTION_THIN_TEXT)
    expect(sub).not.toContain('אין כרגע תלמידים לתשומת לב')
    const enough = createProvider(fakeSource(analyze(world([CA], withData('d', 6, CA.id)))))
    const sub2 = (await enough.classSubject(homeroom(), CA.id, 'math')).data.summary.headline
    expect(sub2).toContain('אין כרגע תלמידים לתשומת לב')
    expect(narrateSubjectHeadline({ className: 'ו׳1', subject: 'מתמטיקה', position: 'within', trend: 'steady', attentionStudents: 0, attentionThin: true })).toContain(ATTENTION_THIN_TEXT)
    expect(narrateSubjectHeadline({ className: 'ו׳1', subject: 'מתמטיקה', position: 'within', trend: 'steady', attentionStudents: 2, attentionThin: true })).toContain('2 תלמידים לתשומת לב')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   UX#10 — עמודת מגמה שאומרת כמה חסר; בחשבון אמיתי אין מגמה לכיתה
   ══════════════════════════════════════════════════════════════════════════ */
describe('עמודת מגמה: כמה משחקים יש וכמה צריך', () => {
  it('הדגמה (אותו חישוב שלפני): 4 משחקים → "עוד אין מגמה: יש 4 משחקים, וצריך לפחות 6"; מספיק משחקים → הניסוח הרגיל', async () => {
    const a = analyze(world([CA], [{ id: 'few', classId: CA.id, subjects: ['math'], sessions: () => spread(4, () => [0.7, 6]) }, ...withData('d', 5, CA.id)]))
    const p = createProvider(fakeSource(a))
    const few = (await p.student(homeroom(), 'few')).data.panels[0]
    expect(few.access === 'visible' && few.trend).toBe('insufficient')
    expect(few.access === 'visible' && few.trendText).toBe(narrateTrendNeedMore(4, 6))
    expect(narrateTrendNeedMore(4, 6)).toBe('עוד אין מגמה: יש 4 משחקים, וצריך לפחות 6')
    const many = (await p.student(homeroom(), 'd-0')).data.panels[0]
    expect(many.access === 'visible' && many.trendText).toBe('יציב/ה')
    const tab = (await p.classSubject(homeroom(), CA.id, 'math')).data.students.find((s) => s.id === 'few')!
    expect(tab.trendText).toBe(narrateTrendNeedMore(4, 6))
  })

  it('עולם חי: הסף הוא 2 × הסף של הממצא (16), ומגמת כיתה / מקצוע אינה מוצגת — לא "אין עדיין מספיק נתונים"', async () => {
    const w = world([CA], [{ id: 'few', classId: CA.id, subjects: ['math'], sessions: () => spread(6, () => [0.7, 6]) }, ...withData('d', 5, CA.id)])
    const p = createProvider(fakeSource(analyze({ ...w, live: true })))
    const st = (await p.student(homeroom(), 'few')).data.panels[0]
    expect(st.access === 'visible' && st.trendText).toBe(narrateTrendNeedMore(6, 16))
    const ov = (await p.classOverview(homeroom(), CA.id)).data
    expect(ov.rows[0].trend).toBe('insufficient')
    expect(ov.rows[0].trendText).toBe(GROUP_TREND_NOT_SHOWN_TEXT)
    const cs = (await p.classSubject(homeroom(), CA.id, 'math')).data
    expect(cs.trendText).toBe(GROUP_TREND_NOT_SHOWN_TEXT)
    expect(GROUP_TREND_NOT_SHOWN_TEXT).not.toMatch(/עדיין|יופיע|יצטבר/)
  })

  it('טאב התלמידים עם אפס מגמות: אומר מאיזה מספר משחקים נבדקת מגמה', async () => {
    const a = analyze(world([CA], noData('n', 3, CA.id)))
    const tab = (await createProvider(fakeSource(a)).classSubject(homeroom(), CA.id, 'math')).data.tabSummaries.students
    expect(tab).toBe('עוד אין מגמות לתלמידים. מגמה נבדקת כשיש לפחות 6 משחקים במקצוע.')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   מנהל: מצב ריק כן (UX#15), "נתונים שלא מוצגים" (UX#16), גודל שכבה, ספירת משחקים בלי מקצוע
   ══════════════════════════════════════════════════════════════════════════ */
describe('מנהל', () => {
  it('כיתה אחת בשכבה: אין תא מוצג — המשפט אומר שבבית ספר עם כיתה אחת בשכבה לא מוצגות תוצאות לפי שכבה, ולא מבטיח שיופיעו', async () => {
    const a = analyze(world([CA], withData('s', 6, CA.id)))
    const out = (await createProvider(fakeSource(a)).admin(adminViewer)).data
    expect(EP.admin.response.safeParse({ dataState: 'insufficient', data: out }).success).toBe(true)
    expect(out.cells.every((c) => c.status === 'hidden')).toBe(true)
    expect(out.highlights).toContain(narrateAdminNoResults({ singleClassPerGrade: true }))
    expect(narrateAdminNoResults({ singleClassPerGrade: true })).toContain('כיתה אחת בשכבה')
    expect(narrateAdminNoResults({ singleClassPerGrade: true })).toContain(`לפחות 5 תלמידים ולפחות ${MIN_CELL_CLASSES} כיתות`)
    for (const t of [narrateAdminNoResults(), narrateAdminNoResults({ singleClassPerGrade: true }), V2_CLIENT_TEXT.adminNoResults]) {
      expect(t).not.toMatch(/יופיעו|כשיסיימו|כשתלמידים/)
      expect(hasTerm(t)).toEqual([])
    }
    expect(V2_CLIENT_TEXT.adminNoResults).toBe(narrateAdminNoResults())
    expect(ADMIN_MIN_CELL_CLASSES).toBe(MIN_CELL_CLASSES)
  })

  it('שתי כיתות בשכבה: התא מוצג, ללא הסבר "אין תוצאות"; "נתונים לא מוצגים" ביחיד/רבים נכונים; sizeText ב"כיתה אחת" / "N כיתות"', async () => {
    const a = analyze(world([CA, CB], [...withData('a', 6, CA.id), ...withData('b', 6, CB.id)]))
    const out = (await createProvider(fakeSource(a)).admin(adminViewer)).data
    expect(out.cells.some((c) => c.status === 'shown')).toBe(true)
    expect(out.highlights).not.toContain(narrateAdminNoResults())
    expect(out.hiddenNote).toBeNull()
    expect(out.grades[0].sizeText).toBe('2 כיתות · 12 תלמידים')
    const single = (await createProvider(fakeSource(analyze(world([CA], withData('s', 6, CA.id))))).admin(adminViewer)).data
    expect(single.grades[0].sizeText).toBe('כיתה אחת · 6 תלמידים')
    expect(single.gradeRows[0].sizeText).toBe('כיתה אחת · 6 תלמידים')
    expect(single.hiddenNote).toBe(narrateAdminHiddenNote(single.hiddenCells))
  })

  it('"נתונים שלא מוצגים": בלי "תא", "בהם" ברבים, "בו" ביחיד', () => {
    expect(narrateAdminHiddenNote(1)).toBe('נתון אחד לא מוצג כי יש בו מעט תלמידים או כיתה אחת בלבד.')
    expect(narrateAdminHiddenNote(3)).toBe('3 נתונים לא מוצגים כי יש בהם מעט תלמידים או כיתה אחת בלבד.')
    expect(`${narrateAdminHiddenNote(1)} ${narrateAdminHiddenNote(3)}`).not.toContain('תא')
    expect(narrateGradeSize(1, 6)).toBe('כיתה אחת · 6 תלמידים')
    expect(narrateGradeSize(3, 80)).toBe('3 כיתות · 80 תלמידים')
  })

  it('משחקים בהדמיות בלי מקצוע: ההערה למנהל לא חושפת מספר קטן מהסף ולא אומרת שהתוצאות "יתווספו"', async () => {
    const a = analyze(world([CA, CB], [...withData('a', 6, CA.id), ...withData('b', 6, CB.id)]))
    const big = (await createProvider(fakeSource(a, { coverage: () => ({ unclassifiedSessions: 9, detailAvailableFrom: null }) })).admin(adminViewer)).data
    expect(big.coverageNote).toBe(narrateAdminUnclassifiedNote(9))
    expect(big.coverageNote).toContain('9 משחקים')
    const few = (await createProvider(fakeSource(a, { coverage: () => ({ unclassifiedSessions: 3, detailAvailableFrom: null }) })).admin(adminViewer)).data
    expect(few.coverageNote).toContain('כמה משחקים')
    expect(few.coverageNote).not.toMatch(/\b3\b/)
    const none = (await createProvider(fakeSource(a)).admin(adminViewer)).data
    expect(none.coverageNote).toBeNull()
    expect(JSON.stringify(big)).not.toMatch(/שם-a-/) /* אין שם תלמיד */
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   ניסוחים: UX#7 (אחוזים סותרים), UX#26 (תצפית), UX#21 (משחקים)
   ══════════════════════════════════════════════════════════════════════════ */
const lt = (over: Partial<Extract<Evidence, { kind: 'level_trend' }>> = {}): Evidence => ({
  kind: 'level_trend', direction: 'down', fromLevel: 11.2, toLevel: 8.9, deltaLevels: -2.3, changeDate: '2026-06-10T12:00:00Z', sessionsBefore: 9, sessionsAfter: 9, successBefore: 0.7, successAfter: 0.7, ...over,
})

describe('ירידה ברמה: המשפט לא מציג אחוזים שסותרים אותו (UX#7)', () => {
  it('הצלחה כמעט זהה (70% מול 70%): במקום המספרים — המערכת מתאימה את הקושי, ולכן ההצלחה נשארת דומה', () => {
    const t = narrateFinding(lt(), { studentName: 'דנה', subjectName: 'עברית' })
    expect(t).toContain(LEVEL_TREND_STEADY_SUCCESS_NOTE)
    expect(t).not.toMatch(/70%/)
    expect(t).toContain('נצפתה ירידה ברמה')
    expect(t).toContain('הנתונים אינם מסבירים את הסיבה')
    expect(narrateFinding(lt({ direction: 'up', successBefore: 0.6, successAfter: 0.62 }))).toContain(LEVEL_TREND_STEADY_SUCCESS_NOTE)
  })

  it('הפרש של 5 נקודות ומעלה בכיוון הממצא: האחוזים מוצגים, בלשון "משחקים"', () => {
    const t = narrateFinding(lt({ successBefore: 0.74, successAfter: 0.49, sessionsBefore: 23, sessionsAfter: 8 }))
    expect(t).toContain('ההצלחה הממוצעת ב-8 המשחקים האחרונים — 49%, לעומת 74% ב-23 המשחקים שלפניהם.')
    expect(t).not.toContain(LEVEL_TREND_STEADY_SUCCESS_NOTE)
    expect(narrateFinding(lt({ successBefore: 0.7, successAfter: 0.65 }))).toContain('65%')
    expect(narrateFinding(lt({ successBefore: 0.7, successAfter: 0.66 }))).toContain(LEVEL_TREND_STEADY_SUCCESS_NOTE)
  })

  it('בכל הדמו: אין ממצא רמה שבו אותו אחוז מופיע משני הצדדים', () => {
    const A = getAnalysis()
    let seen = 0
    for (const sa of A.ss.values()) for (const f of sa.findings) {
      if (f.status !== 'reported' || f.evidence.kind !== 'level_trend') continue
      seen++
      expect(f.text).not.toMatch(/(\d+)% לעומת \1%/)
    }
    expect(seen).toBeGreaterThan(0)
  })
})

describe('ממצאים קצרים: תצפית ולא תווית (UX#26)', () => {
  const mem = (randomLikelihood: number): Evidence => ({ kind: 'memory_random_pattern', games: 8, turns: 40, observedRate: 0.4, attentiveRate: 0.7, randomRate: 0.2, randomLikelihood })
  const bias: Evidence = { kind: 'position_bias', items: 10, firstChoices: 8, observedShare: 0.8, expectedShare: 0.3 }

  it('הטיית מיקום: "נצפה שהתשובה הראשונה נבחרה ב-8 מתוך 10 שאלות במתמטיקה" — בלי "נטייה"', () => {
    expect(narrateShortBody(bias, { subjectName: 'מתמטיקה' })).toBe('נצפה שהתשובה הראשונה נבחרה ב-8 מתוך 10 שאלות במתמטיקה')
  })
  it('זיכרון: מה נראה (לחיצות אקראיות) ובמידת ההסתברות — "נראה" / "ייתכן"', () => {
    expect(narrateShortBody(mem(0.95), { subjectName: 'עברית' })).toBe('נראה שחלק גדול מהלחיצות במשחק הזיכרון בעברית אקראיות')
    expect(narrateShortBody(mem(0.7), { subjectName: 'עברית' })).toBe('ייתכן שחלק גדול מהלחיצות במשחק הזיכרון בעברית אקראיות')
    expect(narrateShortBody(mem(0.95))).not.toContain('ראוי לבדיקה')
  })
})

describe('אחידות מונחים: משחקים (פעמים ששיחקו) מול הדמיות (תוכן)', () => {
  it('הערות הכיסוי והתדריך סופרים משחקים', () => {
    expect(narrateUnclassifiedNote(1)).toContain('משחק אחד בהדמיה')
    expect(narrateUnclassifiedNote(6)).toContain('6 משחקים בהדמיות')
    expect(narrateAdminUnclassifiedNote(8)).toContain('8 משחקים בהדמיות')
  })
})
