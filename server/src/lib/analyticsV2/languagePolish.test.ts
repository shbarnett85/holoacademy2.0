import { describe, expect, it } from 'vitest'
import {
  AREA_MIN_DELTA, CLASS_COMMON_ERROR_MIN_SHARE_PCT, ENTRY_MAX_ALERTS, TREND_LABEL_MIN_DELTA, type Position, type Trend,
} from '../../../../src/shared/lib/analyticsConfig.js'
import * as narrative from '../../../../src/shared/lib/findingsNarrative.js'
import {
  ANALYTICS_CAVEATS, ANALYTICS_TEXT, BRIEFING_SECTION_TITLES, CAVEAT_CROSS_SUBJECT, FEEDBACK_INTRO_TEXT, HOW_WE_CALC, NO_DATA_YET, POSITION_TEXT, areaRef,
  narrateAlertsMore, narrateAlertsTitle, narrateErrorsTabSummary, narrateProgressTabSummary, narrateShort, narrateShortBody, narrateStudentHeadline,
  narrateStudentsTabSummary, narrateSubjectHeadline, narrateVectorGap, narrateVectorStrength, normBandLine, numberRange, trendConnective,
} from '../../../../src/shared/lib/findingsNarrative.js'
import { EP, type Evidence } from '../../../../src/shared/types/analyticsV2.js'
import { DEMO_HOMEROOM_CLASS, DEMO_SUBJECT_PERSONAS, type V2Viewer } from './access.js'
import { areaDirection, classAreaKeys, compareHebrewNames, compareLevels, levelAtLeast, levelAtMost, positionOf, studentAreaKeys, trendOfDelta } from './derive.js'
import { demoProvider, demoViewerClasses, getAnalysis } from './demoProvider.js'
import { skey } from './demoWorld.js'
import { realProvider } from './provider.js'
import { collectAll, strings, withoutHowWeCalculated } from './responseWalker.js'

const A = getAnalysis()
const homeroomOf = (cid: string): V2Viewer => ({ lens: 'homeroom', guest: true, homeroomClassId: cid, teachingClassIds: [], subjectCodes: [] })
const homeroom = homeroomOf(DEMO_HOMEROOM_CLASS)
const admin: V2Viewer = { lens: 'admin', guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
const teacher = (s: (typeof DEMO_SUBJECT_PERSONAS)[number]): V2Viewer => ({ lens: 'subject_teacher', guest: true, homeroomClassId: null, teachingClassIds: demoViewerClasses([s]), subjectCodes: [s] })
const castId = (cast: string): string => A.world.students.find((s) => s.cast === cast)!.id

const allViewers = (): { v: V2Viewer; label: string }[] => [
  ...A.world.classes.map((c) => ({ v: homeroomOf(c.id), label: `מחנך ${c.id}` })),
  ...DEMO_SUBJECT_PERSONAS.map((s) => ({ v: teacher(s), label: `מורה ${s}` })),
  { v: admin, label: 'מנהל' },
]

/* ══════════════════════════════════════════════════════════════════════════
   1. מילת החיבור במשפט המקצוע: "ו" כשהמיקום והמגמה באותו כיוון, "אך" כשהם מנוגדים
   ══════════════════════════════════════════════════════════════════════════ */
describe('משפט הסיכום של מקצוע: ו / אך לפי מיקום ומגמה (3x3)', () => {
  const positions: Position[] = ['above', 'within', 'below']
  const trends: Exclude<Trend, 'insufficient'>[] = ['improving', 'steady', 'declining']
  /* מעל/בתוך = טוב, מתחת = גרוע; בעלייה = טוב, בירידה = גרוע, יציבה = ניטרלית ("ו") */
  const expected: Record<Position, Record<'improving' | 'steady' | 'declining', 'ו' | 'אך'>> = {
    above: { improving: 'ו', steady: 'ו', declining: 'אך' },
    within: { improving: 'ו', steady: 'ו', declining: 'אך' },
    below: { improving: 'אך', steady: 'ו', declining: 'ו' },
  }
  const TREND_WORDS = { improving: 'בעלייה', steady: 'יציבה', declining: 'בירידה' } as const

  for (const position of positions) {
    for (const trend of trends) {
      it(`${position} + ${trend} → ${expected[position][trend]}`, () => {
        expect(trendConnective(position, trend)).toBe(expected[position][trend])
        const text = narrateSubjectHeadline({ className: 'ו׳2', subject: 'מתמטיקה', position, trend, attentionStudents: 0 })
        const clause = expected[position][trend] === 'ו' ? `, והמגמה ${TREND_WORDS[trend]}` : `, אך המגמה ${TREND_WORDS[trend]}`
        expect(text).toBe(`בכיתה ו׳2 הרמה במתמטיקה ${POSITION_TEXT[position]}${clause}. אין כרגע תלמידים לתשומת לב.`)
      })
    }
  }

  it('בלי מגמה (אין עדיין מספיק נתונים) אין מילת חיבור; בלי מיקום — משפט "אין עדיין מספיק נתונים"', () => {
    for (const position of positions) {
      expect(trendConnective(position, 'insufficient')).toBeNull()
      expect(narrateSubjectHeadline({ className: 'ו׳2', subject: 'מתמטיקה', position, trend: 'insufficient', attentionStudents: 1 })).not.toMatch(/המגמה/)
    }
    expect(narrateSubjectHeadline({ className: 'ו׳2', subject: 'מתמטיקה', position: null, trend: 'declining', attentionStudents: 0 })).toContain(NO_DATA_YET)
  })

  it('הספק: כל משפט מקצוע בדמו משתמש במילה הנכונה לפי המיקום והמגמה שלו', async () => {
    let checked = 0
    for (const c of A.world.classes) {
      for (const sub of new Set(c.studentIds.flatMap((sid) => A.studentById.get(sid)!.subjects))) {
        const view = (await demoProvider.classSubject(homeroomOf(c.id), c.id, sub)).data
        const position = positionOf(view.classLevel.mean, view.classLevel.ageNorm)
        if (!position || view.trend === 'insufficient') continue
        checked++
        const joiner = expected[position][view.trend]
        const headline = view.summary.headline
        if (joiner === 'אך') expect(headline, `${c.id}/${sub}`).toMatch(/, אך המגמה/)
        else expect(headline, `${c.id}/${sub}`).toMatch(/, והמגמה/)
      }
    }
    expect(checked).toBeGreaterThan(10)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   2. משפט הסיכום של עמוד התלמיד/ה אומר מה נצפה
   ══════════════════════════════════════════════════════════════════════════ */
describe('משפט הסיכום של התלמיד/ה: אומר את הדבר עצמו', () => {
  const levelDown = (changeDate: string): Evidence => ({
    kind: 'level_trend', direction: 'down', fromLevel: 11, toLevel: 9, deltaLevels: -2, changeDate, sessionsBefore: 8, sessionsAfter: 8, successBefore: 0.8, successAfter: 0.5,
  })

  it('narrateShort: "אלון: ירידה ברמה בהיסטוריה מאז יוני." — השם, מה קרה, איפה ומאז מתי', () => {
    const ev = levelDown('2026-06-10T12:00:00.000Z')
    expect(narrateShort(ev, { studentName: 'אלון', subjectName: 'היסטוריה' })).toBe('אלון: ירידה ברמה בהיסטוריה מאז יוני.')
    expect(narrateShortBody(ev, { subjectName: 'היסטוריה' })).toBe('ירידה ברמה בהיסטוריה מאז יוני')
    expect(narrateShort(ev, { subjectName: 'היסטוריה' })).toBe('התלמיד/ה: ירידה ברמה בהיסטוריה מאז יוני.')
  })

  it('פונקציה: אחד → המשפט עצמו; כמה → הספירה והחשוב ביותר; חוצה-מקצועות → כדאי לשוחח; אין דבר → ניסוח רגיל', () => {
    const top = 'ירידה ברמה בהיסטוריה מאז יוני'
    expect(narrateStudentHeadline({ firstName: 'אלון', attention: 1, positive: 0, crossSubject: false, topAttention: top })).toBe('אלון: ירידה ברמה בהיסטוריה מאז יוני.')
    expect(narrateStudentHeadline({ firstName: 'איתי', attention: 3, positive: 0, crossSubject: false, topAttention: top }))
      .toBe('איתי: יש 3 דברים שכדאי לבדוק. הדחוף ביותר: ירידה ברמה בהיסטוריה מאז יוני.')
    expect(narrateStudentHeadline({ firstName: 'תמר', attention: 3, positive: 0, crossSubject: true, topAttention: 'ירידה ברמה בכמה מקצועות יחד (היסטוריה ומדעים)' }))
      .toBe('תמר: ירידה ברמה בכמה מקצועות יחד (היסטוריה ומדעים) — כדאי לשוחח.')
    expect(narrateStudentHeadline({ firstName: 'מאיה', attention: 0, positive: 1, crossSubject: false })).toBe('מאיה: נצפתה התקדמות.')
    expect(narrateStudentHeadline({ firstName: 'דנה', attention: 0, positive: 0, crossSubject: false })).toBe('דנה: אין כרגע דבר חריג לדווח.')
    /* תאימות לאחור: בלי topAttention הניסוח הכללי הישן נשמר */
    expect(narrateStudentHeadline({ firstName: 'אלון', attention: 1, positive: 0, crossSubject: false })).toBe('אלון: יש דבר אחד שכדאי לבדוק.')
  })

  it('הספק (מחנך): אלון — ירידה בהיסטוריה בשמה; דניאל — הטיית מיקום במתמטיקה; אין "יש דבר אחד שכדאי לבדוק"', async () => {
    const alon = A.studentById.get(castId('alon'))!
    const alonOverview = (await demoProvider.student(homeroom, alon.id)).data
    const f = A.ss.get(skey(alon.id, 'history'))!.findings.find((x) => x.status === 'reported' && x.evidence.kind === 'level_trend')!
    expect(f.status === 'reported' && alonOverview.summary).toBe(`${alon.firstName}: ${narrateShortBody((f as Extract<typeof f, { status: 'reported' }>).evidence, { subjectName: 'היסטוריה' })}.`)
    expect(alonOverview.summary).toMatch(/^[^:]+: ירידה ברמה בהיסטוריה מאז [א-ת]+\.$/)

    const daniel = A.studentById.get(castId('daniel'))!
    expect((await demoProvider.student(homeroom, daniel.id)).data.summary).toBe(`${daniel.firstName}: נטייה לבחור בתשובה הראשונה במתמטיקה.`)
  })

  it('הספק: אף תלמיד לא מקבל ניסוח ריק מתוכן; כמה דברים → ספירה + "הדחוף ביותר"; מורה מקצועי לא רואה מקצוע אחר', async () => {
    const vague = /יש (דבר אחד|\d+ דברים) שכדאי לבדוק\.$/
    let several = 0
    for (const sid of A.classById.get(DEMO_HOMEROOM_CLASS)!.studentIds) {
      const o = (await demoProvider.student(homeroom, sid)).data
      expect(o.summary, sid).not.toMatch(vague)
      if (/יש \d+ דברים שכדאי לבדוק\. הדחוף ביותר: /.test(o.summary)) several++
    }
    expect(several, 'יש בדמו לפחות תלמיד/ה אחד/ת עם כמה דברים לבדוק (איתי)').toBeGreaterThanOrEqual(1)
    const itay = (await demoProvider.student(homeroom, castId('itay'))).data.summary
    expect(itay).toMatch(/^[^:]+: יש 2 דברים שכדאי לבדוק\. הדחוף ביותר: /)

    /* מורה מתמטיקה רואה את תמר רק דרך מקצועו: המשפט לא מזכיר מקצועות אחרים ולא "כמה מקצועות" */
    const tamarMath = (await demoProvider.student(teacher('math'), castId('tamar'))).data.summary
    expect(tamarMath).not.toMatch(/כמה מקצועות|היסטוריה|מדעים|עברית/)
    /* ומחנך רואה את ההתרעה החוצת-מקצועות, עם שמות המקצועות */
    const tamar = (await demoProvider.student(homeroom, castId('tamar'))).data.summary
    expect(tamar).toMatch(/ירידה ברמה בכמה מקצועות יחד \(.+\) — כדאי לשוחח\.$/)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3. מסך הכניסה: alertsTotal, כותרת הרצועה, "ועוד N"
   ══════════════════════════════════════════════════════════════════════════ */
describe('מסך הכניסה: alertsTotal, כותרת הרצועה ו"ועוד N בכיתה"', () => {
  it('ניסוח: "3 מתוך 5 התלמידים לתשומת לב — הדחופים ביותר", ו"ועוד 2 תלמידים בכיתה"', () => {
    expect(narrateAlertsTitle(3, 5)).toBe('3 מתוך 5 התלמידים לתשומת לב — הדחופים ביותר')
    expect(narrateAlertsMore(3, 5)).toBe('ועוד 2 תלמידים בכיתה')
    expect(narrateAlertsMore(3, 4)).toBe('ועוד תלמיד/ה אחד/ת בכיתה')
    expect(narrateAlertsMore(3, 7, true)).toBe('ועוד 4 תלמידים בכיתות')
    expect(narrateAlertsMore(3, 3)).toBeNull()
    expect(narrateAlertsMore(0, 0)).toBeNull()
    /* הכול מוצג: אין "מתוך" */
    expect(narrateAlertsTitle(3, 3)).toBe('3 תלמידים לתשומת לב')
    expect(narrateAlertsTitle(1, 1)).toBe('תלמיד/ה אחד/ת לתשומת לב')
    expect(narrateAlertsTitle(0, 0)).toBe(ANALYTICS_TEXT.alertsTitle)
  })

  it('מחנך: alertsTotal = סכום attentionCount של הכיתות, גדול ממספר ההתרעות המוצגות, והכותרת וההמשך מנוסחים ממנו', async () => {
    const e = (await demoProvider.entry(homeroom)).data
    const sum = e.classes.reduce((s, c) => s + c.attentionCount, 0)
    expect(e.alertsTotal).toBe(sum)
    expect(e.alerts.length).toBe(ENTRY_MAX_ALERTS)
    expect(e.alertsTotal, 'בדמו יש יותר תלמידים לתשומת לב ממה שהרצועה מציגה').toBeGreaterThan(e.alerts.length)
    expect(e.alertsTitle).toBe(`${ENTRY_MAX_ALERTS} מתוך ${e.alertsTotal} התלמידים לתשומת לב — הדחופים ביותר`)
    expect(e.alertsMore).toBe(narrateAlertsMore(e.alerts.length, e.alertsTotal))
    expect(e.alertsMore).toBe(`ועוד ${e.alertsTotal - e.alerts.length} תלמידים בכיתה`)
    expect(EP.entry.response.safeParse({ dataState: 'ok', data: e }).success).toBe(true)
  })

  it('לכל עדשה: alertsTotal = סכום attentionCount; ההתרעות המוצגות הן המובילות; כשהכול מוצג — אין alertsMore', async () => {
    for (const { v, label } of allViewers()) {
      const e = (await demoProvider.entry(v)).data
      expect(e.alertsTotal, label).toBe(e.classes.reduce((s, c) => s + c.attentionCount, 0))
      expect(e.alertsTotal, label).toBeGreaterThanOrEqual(e.alerts.length)
      expect(e.alerts.length, label).toBe(Math.min(ENTRY_MAX_ALERTS, e.alertsTotal))
      expect(e.alertsMore === null, label).toBe(e.alertsTotal <= e.alerts.length)
      expect(e.alertsTitle, label).toBe(narrateAlertsTitle(e.alerts.length, e.alertsTotal))
    }
    const hebrew = (await demoProvider.entry(teacher('hebrew'))).data
    expect(hebrew.alertsTotal).toBe(1)
    expect(hebrew.alertsMore).toBeNull()
  })

  it('מנהל והספק האמיתי: אפס, בלי "ועוד", ובלי מידע על תלמידים; הסכמה דורשת alertsTotal >= מספר ההתרעות', async () => {
    const ad = (await demoProvider.entry(admin)).data
    expect(ad).toMatchObject({ classes: [], alerts: [], alertsTotal: 0, alertsMore: null })
    const real = (await realProvider.entry(homeroom)).data
    expect(real).toMatchObject({ classes: [], alerts: [], alertsTotal: 0, alertsMore: null })
    expect(EP.entry.response.safeParse(await realProvider.entry(homeroom)).success).toBe(true)

    const e = (await demoProvider.entry(homeroom)).data
    const broken = { dataState: 'ok', data: { ...e, alertsTotal: e.alerts.length - 1 } }
    expect(EP.entry.response.safeParse(broken).success).toBe(false)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4. משפט אחד לכל תת-טאב
   ══════════════════════════════════════════════════════════════════════════ */
describe('משפט סיכום לכל תת-טאב של מקצוע בכיתה', () => {
  it('תלמידים: הקבוצה הגדולה ראשונה כ"X מתוך Y", ואחריה השאר ומי שאין עליו נתונים', () => {
    expect(narrateStudentsTabSummary({ total: 22, improving: 0, steady: 0, declining: 20 }))
      .toBe('20 מתוך 22 תלמידים בירידה, ולגבי 2 תלמידים אין עדיין מספיק נתונים.')
    expect(narrateStudentsTabSummary({ total: 22, improving: 0, steady: 2, declining: 20 })).toBe('20 מתוך 22 תלמידים בירידה, 2 תלמידים יציבים.')
    expect(narrateStudentsTabSummary({ total: 22, improving: 3, steady: 4, declining: 15 })).toBe('15 מתוך 22 תלמידים בירידה, 4 תלמידים יציבים ו-3 תלמידים משתפרים.')
    expect(narrateStudentsTabSummary({ total: 6, improving: 6, steady: 0, declining: 0 })).toBe('כל 6 התלמידים משתפרים.')
    expect(narrateStudentsTabSummary({ total: 5, improving: 1, steady: 1, declining: 1 })).toBe('1 מתוך 5 תלמידים בירידה, תלמיד/ה אחד/ת משתפר/ת ותלמיד/ה אחד/ת יציב/ה, ולגבי 2 תלמידים אין עדיין מספיק נתונים.')
    expect(narrateStudentsTabSummary({ total: 8, improving: 0, steady: 0, declining: 0 })).toContain(NO_DATA_YET)
    expect(narrateStudentsTabSummary({ total: 0, improving: 0, steady: 0, declining: 0 })).toBe(narrative.EMPTY_TEXT.noStudents)
  })

  it('התקדמות: "הרמה הממוצעת עלתה ב-0.6 רמות מאז ספטמבר." / ירדה / כמעט לא השתנתה / חסר נתונים', () => {
    const s = (a: [string, number][]): { date: string; level: number }[] => a.map(([date, level]) => ({ date, level }))
    expect(narrateProgressTabSummary({ series: s([['2025-09-01T12:00:00.000Z', 8], ['2025-12-01T12:00:00.000Z', 8.3], ['2026-04-01T12:00:00.000Z', 8.6]]) }))
      .toBe('הרמה הממוצעת עלתה ב-0.6 רמות מאז ספטמבר.')
    expect(narrateProgressTabSummary({ series: s([['2025-09-01T12:00:00.000Z', 9], ['2026-01-01T12:00:00.000Z', 8]]) })).toBe('הרמה הממוצעת ירדה ברמה אחת מאז ספטמבר.')
    expect(narrateProgressTabSummary({ series: s([['2025-09-01T12:00:00.000Z', 9], ['2026-01-01T12:00:00.000Z', 9.04]]) })).toBe('הרמה הממוצעת של הכיתה כמעט לא השתנתה מאז ספטמבר.')
    /* שנה אחרת: מצרפים את השנה, כדי שלא יהיה ספק איזה ספטמבר */
    expect(narrateProgressTabSummary({ series: s([['2025-10-01T12:00:00.000Z', 9], ['2026-09-01T12:00:00.000Z', 10]]) })).toBe('הרמה הממוצעת עלתה ברמה אחת מאז אוקטובר 2025.')
    expect(narrateProgressTabSummary({ series: s([['2025-10-01T12:00:00.000Z', 9]]) })).toBe(narrative.EMPTY_TEXT.noProgress)
    /* חודש שתלמיד/ה בודד/ת תרם/ה לו אינו נקודת קצה */
    const thin = [{ date: '2025-09-01T12:00:00.000Z', level: 5, n: 1 }, { date: '2025-10-01T12:00:00.000Z', level: 8, n: 20 }, { date: '2026-01-01T12:00:00.000Z', level: 8.4, n: 20 }]
    expect(narrateProgressTabSummary({ series: thin })).toBe('הרמה הממוצעת עלתה ב-0.4 רמות מאז אוקטובר.')
    expect(narrateProgressTabSummary({ series: thin.slice(0, 2) })).toBe(narrative.EMPTY_TEXT.noProgress)
  })

  it('טעויות נפוצות: "2 טעויות נפוצות: …", "ועוד N", אין טעות נפוצה, אין נתונים', () => {
    expect(narrateErrorsTabSummary({ common: ['א ב', 'ג ד'], anyReported: true, maxTitles: 3 })).toBe('2 טעויות נפוצות: "א ב" ו"ג ד".')
    expect(narrateErrorsTabSummary({ common: ['א ב'], anyReported: true, maxTitles: 3 })).toBe('טעות נפוצה אחת: "א ב".')
    expect(narrateErrorsTabSummary({ common: ['א', 'ב', 'ג', 'ד', 'ה'], anyReported: true, maxTitles: 2 })).toBe('5 טעויות נפוצות: "א" ו"ב" ועוד 3.')
    expect(narrateErrorsTabSummary({ common: [], anyReported: true, maxTitles: 3 })).toBe('אין כרגע טעות שחוזרת אצל חלק גדול מהכיתה.')
    expect(narrateErrorsTabSummary({ common: [], anyReported: false, maxTitles: 3 })).toBe(narrative.EMPTY_TEXT.noCommonErrors)
  })

  it('הספק: tabSummaries בכל מקצוע בכל כיתה, מחושבים מאותם נתונים שהטאבים מציגים', async () => {
    let checked = 0
    for (const c of A.world.classes) {
      const v = homeroomOf(c.id)
      for (const sub of new Set(c.studentIds.flatMap((sid) => A.studentById.get(sid)!.subjects))) {
        const view = (await demoProvider.classSubject(v, c.id, sub)).data
        checked++
        const t = view.tabSummaries
        expect(t.students.length, `${c.id}/${sub}`).toBeGreaterThan(10)
        expect(t.progress.length).toBeGreaterThan(10)
        expect(t.misconceptions.length).toBeGreaterThan(10)
        /* תלמידים: אותה ספירה כמו בשורות הטאב */
        const count = (tr: string): number => view.students.filter((s) => s.trend === tr).length
        expect(t.students).toBe(narrateStudentsTabSummary({ total: view.students.length, improving: count('improving'), steady: count('steady'), declining: count('declining') }))
        /* התקדמות: מהחודש הראשון לאחרון בגרף */
        expect(t.progress).toBe(narrateProgressTabSummary({ series: view.progress.series }))
        /* טעויות נפוצות: אותן שורות שמזינות את "מה ללמד" */
        const common = view.misconceptions.filter((m) => m.status === 'reported' && (m.sharePct ?? 0) >= CLASS_COMMON_ERROR_MIN_SHARE_PCT)
        expect(t.misconceptions).toBe(narrateErrorsTabSummary({ common: common.map((m) => m.titleHe), anyReported: view.misconceptions.some((m) => m.status === 'reported'), maxTitles: 3 }))
        expect(view.recommendations.length).toBe(Math.min(3, common.length))
        expect(EP.classSubject.response.safeParse({ dataState: 'ok', data: view }).success).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(10)
    /* שברים בשכבה ו׳: טעות נפוצה אחת לפחות, בשמה */
    const frac = (await demoProvider.classSubject(homeroom, DEMO_HOMEROOM_CLASS, 'math')).data
    expect(frac.tabSummaries.misconceptions).toMatch(/^(\d+ טעויות נפוצות|טעות נפוצה אחת): "/)
    expect(frac.tabSummaries.students).toMatch(/^(כל \d+ התלמידים|\d+ מתוך \d+ תלמידים) /)
    /* היסטוריה: מגמת הכיתה בירידה אצל חלק מהתלמידים — המשפט מזכיר אותם */
    expect(frac.tabSummaries.progress).toMatch(/^הרמה הממוצעת (עלתה|ירדה) ב-.+ מאז |כמעט לא השתנתה/)
  })

  it('הספק האמיתי ("אין עדיין מספיק נתונים") עומד בסכמה ומחזיר משפט בכל תת-טאב', async () => {
    const r = await realProvider.classSubject(homeroom, DEMO_HOMEROOM_CLASS, 'math')
    expect(EP.classSubject.response.safeParse(r).success).toBe(true)
    expect(r.data.tabSummaries).toEqual({ misconceptions: NO_DATA_YET, progress: NO_DATA_YET, students: NO_DATA_YET })
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5. השוואת רמות בטוחה לנקודה צפה
   ══════════════════════════════════════════════════════════════════════════ */
describe('השוואת רמות: סבילות 1e-9, לא עיגול', () => {
  const levels: number[] = []
  for (let i = 10; i <= 200; i++) levels.push(i / 10)
  const FLOAT_FAILING_PAIRS: [number, number][] = [[1.3, 2.3], [1.8, 2.8], [3.1, 4.1], [3.6, 4.6], [7.2, 8.2], [7.7, 8.7], [15.4, 16.4], [15.9, 16.9]]

  it('התיעוד של הבאג: בנקודה צפה "רמה אחת" נכשלת בדיוק על 8 זוגות בין 1 ל-20', () => {
    const failing: [number, number][] = []
    for (let i = 10; i + 10 <= 200; i++) if (!((i + 10) / 10 - i / 10 >= 1)) failing.push([i / 10, (i + 10) / 10])
    expect(failing).toEqual(FLOAT_FAILING_PAIRS)
  })

  it('compareLevels: 4.1 − 3.1 הוא בדיוק רמה אחת', () => {
    expect(4.1 - 3.1).toBeLessThan(1)
    expect(compareLevels(4.1 - 3.1, 1)).toBe(0)
    expect(levelAtLeast(4.1 - 3.1, 1)).toBe(true)
    expect(levelAtMost(3.1 - 4.1, -1)).toBe(true)
    expect(compareLevels(1, 1.0001)).toBe(-1)
    expect(compareLevels(1.0001, 1)).toBe(1)
  })

  it('8 הזוגות: תחום חזק/מאתגר לפי פער של רמה אחת — בשני הכיוונים, ברמת תלמיד ובכיתה', () => {
    for (const [lo, hi] of FLOAT_FAILING_PAIRS) {
      expect(areaDirection(hi - lo), `${hi} מול ${lo}`).toBe('strong')
      expect(areaDirection(lo - hi), `${lo} מול ${hi}`).toBe('challenging')
      expect(studentAreaKeys([{ key: 'factual', level: hi, status: 'reported' }], lo).strong).toEqual(['factual'])
      expect(studentAreaKeys([{ key: 'factual', level: lo, status: 'reported' }], hi).challenging).toEqual(['factual'])
      const cls = (level: number) => ({ contentVectors: [{ key: 'factual', level, deltaLevels: null, n: 9, status: 'reported' as const }] })
      expect(classAreaKeys([cls(hi), cls(hi), cls(hi), cls(hi), cls(hi)], lo).strong).toEqual(['factual'])
    }
  })

  it('כל הזוגות בין 1 ל-20 (צעד 0.1): פער של AREA_MIN_DELTA תמיד חזק/מאתגר; פחות מזה (0.9) לעולם לא', () => {
    const step = Math.round(AREA_MIN_DELTA * 10)
    for (let i = 0; i < levels.length; i++) {
      const j = i + step
      if (j < levels.length) {
        expect(areaDirection(levels[j] - levels[i]), `${levels[j]} מול ${levels[i]}`).toBe('strong')
        expect(areaDirection(levels[i] - levels[j]), `${levels[i]} מול ${levels[j]}`).toBe('challenging')
      }
      if (i + step - 1 < levels.length) expect(areaDirection(levels[i + step - 1] - levels[i]), `${levels[i + step - 1]} מול ${levels[i]}`).toBeNull()
    }
  })

  it('מגמה: חצי רמה מדויק היא עלייה/ירידה גם כשהנקודה הצפה קצת מתחת (4 זוגות), ו-0.496 עדיין יציב (בלי עיגול לשתי ספרות)', () => {
    const half = Math.round(TREND_LABEL_MIN_DELTA * 10)
    let flagged = 0
    for (let i = 0; i + half < levels.length; i++) {
      const d = levels[i + half] - levels[i]
      if (d < TREND_LABEL_MIN_DELTA) flagged++
      expect(trendOfDelta(d), `${levels[i + half]} מול ${levels[i]}`).toBe('improving')
      expect(trendOfDelta(-d), `${levels[i]} מול ${levels[i + half]}`).toBe('declining')
    }
    expect(flagged, 'ארבעה זוגות נכשלים בהשוואה חשופה').toBe(4)
    expect(trendOfDelta(0.496)).toBe('steady')
    expect(trendOfDelta(-0.496)).toBe('steady')
    expect(trendOfDelta(0.5 - 1e-12)).toBe('improving')
    expect(trendOfDelta(0.4999)).toBe('steady')
    expect(trendOfDelta(null)).toBe('insufficient')
  })

  it('מיקום מול הטווח המיועד: גבולות הטווח שייכים ל"בתוך", גם עם רעש נקודה צפה', () => {
    const norm = { gradeLabel: 'ו׳', center: 10.1, low: 10.1 - 1.5, high: 10.1 + 1.5 }
    expect(positionOf(norm.high + 1e-12, norm)).toBe('within')
    expect(positionOf(norm.low - 1e-12, norm)).toBe('within')
    expect(positionOf(11.7, norm)).toBe('above')
    expect(positionOf(8.5, norm)).toBe('below')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   6. כיווניות (RTL): טווחים, מינוס ואחוזים
   ══════════════════════════════════════════════════════════════════════════ */
describe('כיווניות: טווח מספרי נכתב במילים ולא במקף', () => {
  it('normBandLine: "מ-8.5 עד 11.5" — לא "8.5–11.5" שמוצג בפסקה מימין לשמאל כ-"11.5–8.5"', () => {
    expect(normBandLine(8.5, 11.5)).toBe('הטווח המיועד לשכבה: מ-8.5 עד 11.5')
    expect(numberRange(8, 11)).toBe('מ-8 עד 11')
    expect(normBandLine(8.5, 11.5)).not.toMatch(/\d\s*[–—-]\s*\d/)
  })

  it('בשום מחרוזת בשום תגובה (כל העדשות, כל התלמידים והכיתות) אין טווח מספרי עם מקף, מספר שלילי חשוף או אחוז הפוך', async () => {
    const RANGE = /\d\s*[–—−-]\s*\d/
    const BARE_MINUS = /(^|[\s(])[−-]\d/
    const REVERSED_PERCENT = /%\s*\d/
    const bad: string[] = []
    let walked = 0
    /* מזהים, קודים ותאריכים הם נתונים ולא טקסט מוצג */
    const DATA_KEY = /\.(id|code|key|date|start|end|generatedAt|[a-zA-Z]*Id|[a-zA-Z]*Key|[a-zA-Z]*Date|[a-zA-Z]*Code)$/
    for (const { v, label } of allViewers()) {
      for (const r of await collectAll(demoProvider, v, label)) {
        for (const s of strings(r.data)) {
          if (DATA_KEY.test(s.path)) continue
          walked++
          if (RANGE.test(s.text) || BARE_MINUS.test(s.text) || REVERSED_PERCENT.test(s.text)) bad.push(`${r.label} ${s.path}: ${s.text}`)
        }
      }
    }
    expect(walked).toBeGreaterThan(5000)
    expect(bad.slice(0, 10)).toEqual([])
  })

  it('התדריך מציג את הטווח המיועד במילים', async () => {
    const sid = castId('noa')
    const b = (await demoProvider.briefing(homeroom, 'student', sid)).data
    const lines = b.sections.flatMap((s) => s.items.flatMap((it) => it.evidence))
    const band = lines.filter((l) => l.startsWith('הטווח המיועד לשכבה:'))
    expect(band.length).toBeGreaterThan(0)
    for (const l of band) expect(l).toMatch(/^הטווח המיועד לשכבה: מ-\d+(\.\d)? עד \d+(\.\d)?$/)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   7. הסתייגות חוצת-מקצועות: משפט אחד קצר, זהה בכל מקום
   ══════════════════════════════════════════════════════════════════════════ */
describe('הסתייגות בין מקצועות: משפט קצר אחד, זהה בכל מסך', () => {
  it('הנוסח', () => {
    expect(CAVEAT_CROSS_SUBJECT).toBe('הרמות של מקצועות שונים אינן ניתנות להשוואה ישירה.')
    expect(CAVEAT_CROSS_SUBJECT.length).toBeLessThanOrEqual(60)
    expect(CAVEAT_CROSS_SUBJECT.match(/\./g)).toHaveLength(1)
    expect(ANALYTICS_CAVEATS.crossSubject).toBe(CAVEAT_CROSS_SUBJECT)
  })

  it('ההסבר המלא עבר ל"איך חישבנו?"', () => {
    const explanation = HOW_WE_CALC.lines.find((l) => /סולם רמות משלו/.test(l))
    expect(explanation, 'שורת הסבר ב-HOW_WE_CALC.lines').toBeDefined()
    expect(explanation).toMatch(/אי אפשר להשוות ישירות/)
    expect(explanation).toMatch(/אין כאן ציון אחד מאוחד/)
    for (const [name, value] of Object.entries(ANALYTICS_CAVEATS)) expect(value, name).not.toMatch(/סולם רמות משלו|ציון אחד מאוחד/)
  })

  it('כל תגובה של כל ספק נושאת בדיוק את אותו משפט', async () => {
    let checked = 0
    for (const { v, label } of allViewers()) {
      for (const r of await collectAll(demoProvider, v, label)) {
        const caveats = (r.data as { caveats?: { crossSubject: string } }).caveats
        if (!caveats) continue
        checked++
        expect(caveats.crossSubject, r.label).toBe(CAVEAT_CROSS_SUBJECT)
      }
    }
    expect(checked).toBeGreaterThan(50)
    for (const r of [await realProvider.config(homeroom), await realProvider.student(homeroom, 'x'), await realProvider.classOverview(homeroom, 'c'), await realProvider.classSubject(homeroom, 'c', 'math'), await realProvider.admin(admin), await realProvider.briefing(homeroom, 'class', 'c')]) {
      expect((r.data as { caveats: { crossSubject: string } }).caveats.crossSubject).toBe(CAVEAT_CROSS_SUBJECT)
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   8. ניסוח התדריך ותצוגת התלמיד/ה
   ══════════════════════════════════════════════════════════════════════════ */
describe('תדריך ומשוב: ניסוח', () => {
  it('כותרת הסעיף: "על מה זה מבוסס" — בלי "בסיס ראייתי" ובלי "תל״א"', async () => {
    expect(BRIEFING_SECTION_TITLES.evidence_basis).toBe('על מה זה מבוסס')
    expect(JSON.stringify(BRIEFING_SECTION_TITLES)).not.toMatch(/בסיס ראייתי|תל״א/)
    const b = (await demoProvider.briefing(homeroom, 'student', castId('alon'))).data
    expect(b.sections.find((s) => s.id === 'evidence_basis')!.title).toBe('על מה זה מבוסס')
    for (const { v, label } of allViewers()) {
      for (const r of await collectAll(demoProvider, v, label)) {
        if (r.endpoint !== 'briefing') continue
        const text = JSON.stringify(r.data)
        expect(text, r.label).not.toMatch(/בסיס ראייתי|תל״א/)
      }
    }
  })

  it('שם תחום שמסתיים ב"בתחום" לא מקבל "בתחום" כפול', () => {
    expect(areaRef('factual')).toBe('בתחום "ידע עובדתי"')
    expect(areaRef('domain_reading')).toBe('ב"הבנת הנקרא בתחום"')
    for (const fn of [narrateVectorStrength, narrateVectorGap]) {
      for (const key of ['factual', 'concept_understanding', 'sequence_causality', 'domain_reading', 'application_inference']) {
        const text = fn(key, 'היסטוריה', 12, 10)
        expect(text, key).not.toMatch(/בתחום\s+"[^"]*בתחום"/)
        expect((text.match(/בתחום/g) ?? []).length, key).toBeLessThanOrEqual(1)
      }
    }
    expect(narrateVectorStrength('domain_reading', 'היסטוריה', 12, 10)).toBe('בהיסטוריה, הרמה ב"הבנת הנקרא בתחום" (12) גבוהה מהרמה הכללית במקצוע (10).')
  })

  it('בשום תדריך אין "בתחום" כפול', async () => {
    let briefings = 0
    for (const { v, label } of allViewers()) {
      for (const r of await collectAll(demoProvider, v, label)) {
        if (r.endpoint !== 'briefing') continue
        briefings++
        for (const s of strings(withoutHowWeCalculated(r.data))) expect(s.text, `${r.label} ${s.path}`).not.toMatch(/בתחום\s+"[^"]*בתחום"/)
      }
    }
    expect(briefings).toBeGreaterThan(20)
  })

  it('פתיח תצוגת התלמיד/ה מגיע מהניסוח המרכזי ומהחוזה', async () => {
    expect(FEEDBACK_INTRO_TEXT).toBe('כך נראה המסך לתלמיד/ה. אין בו השוואה לתלמידים אחרים.')
    const fb = (await demoProvider.feedback(homeroom, castId('maya'))).data
    expect(fb.intro).toBe(FEEDBACK_INTRO_TEXT)
    expect(EP.feedback.response.safeParse({ dataState: 'ok', data: fb }).success).toBe(true)
    const real = await realProvider.feedback(homeroom, 'x')
    expect(real.data.intro).toBe(FEEDBACK_INTRO_TEXT)
    expect(EP.feedback.response.safeParse(real).success).toBe(true)
    /* המורה לא רואה כאן אף השוואה — והפתיח עצמו אומר זאת, בלי ניסוח על "המורה" */
    expect(fb.intro).not.toMatch(/המורה/)
  })

  it('צמיחה במשוב נקבעת באותה השוואה כמו המגמה (עלייה של חצי רמה לפחות)', async () => {
    const maya = (await demoProvider.feedback(homeroom, castId('maya'))).data
    expect(maya.items.some((i) => i.kind === 'growth')).toBe(true)
    for (const sid of A.classById.get(DEMO_HOMEROOM_CLASS)!.studentIds) {
      const fb = (await demoProvider.feedback(homeroom, sid)).data
      for (const it of fb.items.filter((i) => i.kind === 'growth')) {
        const sa = A.ss.get(skey(sid, it.subject.code))!
        expect(trendOfDelta((sa.level60 as number) - (sa.level90to150 as number)), `${sid}/${it.subject.code}`).toBe('improving')
      }
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   9. מיון תלמידים א-ב
   ══════════════════════════════════════════════════════════════════════════ */
describe('מיון תלמידים: א-ב, ובשוויון לפי מזהה', () => {
  const names = (xs: { displayName: string }[]): string[] => xs.map((x) => x.displayName)

  it('compareHebrewNames: סדר אלפביתי עברי, אותיות סופיות, ומזהה כשובר שוויון', () => {
    const rows = ['תמר כהן', 'דנה לוי', 'דן לוי', 'אבי כהן', 'שירה בר', 'נועה גל', 'מאיה דרור', 'אלון אשכנזי', 'יובל כהן'].map((displayName, i) => ({ displayName, id: `s${i}` }))
    expect(names([...rows].sort(compareHebrewNames))).toEqual(['אבי כהן', 'אלון אשכנזי', 'דן לוי', 'דנה לוי', 'יובל כהן', 'מאיה דרור', 'נועה גל', 'שירה בר', 'תמר כהן'])
    const same = [{ displayName: 'דנה כהן', id: 'b' }, { displayName: 'דנה כהן', id: 'a' }, { displayName: 'דנה כהן', id: 'c' }]
    expect([...same].sort(compareHebrewNames).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect([...same].reverse().sort(compareHebrewNames).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  const sorted = (xs: { displayName: string; id: string }[]): boolean => xs.every((x, i) => i === 0 || compareHebrewNames(xs[i - 1], x) <= 0)

  it('ClassSubjectView.students ממוין א-ב בכל מקצוע בכל כיתה', async () => {
    let lists = 0
    let longest = 0
    for (const c of A.world.classes) {
      for (const sub of new Set(c.studentIds.flatMap((sid) => A.studentById.get(sid)!.subjects))) {
        const view = (await demoProvider.classSubject(homeroomOf(c.id), c.id, sub)).data
        lists++
        longest = Math.max(longest, view.students.length)
        expect(sorted(view.students), `${c.id}/${sub}`).toBe(true)
        expect(view.students.length).toBeGreaterThan(0)
      }
    }
    expect(lists).toBeGreaterThan(10)
    expect(longest, 'לפחות רשימה אחת ארוכה מספיק כדי שהמיון יהיה משמעותי').toBeGreaterThanOrEqual(15)
  })

  it('roster.students ממוין א-ב לכל עדשה (ועדיין כולל את אותם תלמידים)', async () => {
    for (const { v, label } of allViewers()) {
      const r = (await demoProvider.roster(v)).data
      expect(sorted(r.students), label).toBe(true)
      if (v.lens === 'homeroom') expect(r.students.length, label).toBe(A.classById.get(v.homeroomClassId!)!.studentIds.length)
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   10. עברית פשוטה: אין מונחים טכניים (נורמה, ריבוע, סטטיסטי…) בשום ניסוח שמוצג
   ══════════════════════════════════════════════════════════════════════════ */
describe('אין מונחים טכניים בניסוח שמוצג (מחוץ ל"איך חישבנו?")', () => {
  const TECH = /סטטיסט|נורמה|נורמת|נורמות|ריבוע|סטיית\s*תקן|רגרסי|אחוזון|חציון|פוסטרי/
  it('כל מחרוזת בכל תגובה, בכל עדשה', async () => {
    const bad: string[] = []
    for (const { v, label } of allViewers()) {
      for (const r of await collectAll(demoProvider, v, label)) {
        for (const s of strings(withoutHowWeCalculated(r.data))) if (TECH.test(s.text)) bad.push(`${r.label} ${s.path}: ${s.text}`)
      }
    }
    expect(bad.slice(0, 10)).toEqual([])
  })
  it('כל מחרוזת קבועה במודול התבניות פרט ל-HOW_WE_CALC', () => {
    const bad: string[] = []
    for (const [name, value] of Object.entries(narrative)) {
      if (name === 'HOW_WE_CALC' || typeof value === 'function') continue
      for (const s of strings(value, name)) if (TECH.test(s.text)) bad.push(`${s.path}: ${s.text}`)
    }
    expect(bad).toEqual([])
  })
})
