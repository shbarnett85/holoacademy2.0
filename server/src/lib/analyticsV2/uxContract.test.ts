import { describe, expect, it } from 'vitest'
import {
  AREA_MIN_DELTA, CONTENT_VECTOR_KINDS, ENTRY_MAX_ALERTS, GROUP_TREND_MIN_STUDENTS, MIN_CELL_SIZE, SUMMARY_RECENT_MAX, TREND_LABEL_MIN_DELTA, contentVectorLabel,
} from '../../../../src/shared/lib/analyticsConfig.js'
import {
  ADMIN_HIDDEN_CELL_TEXT, GROUP_TREND_TEXT, NO_DATA_YET, POSITION_TEXT, TREND_TEXT, basisLine, narrateInsufficient, narrateOverviewSummary, unitCount,
} from '../../../../src/shared/lib/findingsNarrative.js'
import { EP } from '../../../../src/shared/types/analyticsV2.js'
import { DEMO_HOMEROOM_CLASS, DEMO_SUBJECT_PERSONAS, type V2Viewer } from './access.js'
import { classAreaKeys, groupTrend, positionOf, studentAreaKeys, trendOfDelta } from './derive.js'
import { demoProvider, demoViewerClasses, getAnalysis } from './demoProvider.js'
import { skey } from './demoWorld.js'
import { realProvider } from './provider.js'

/* אותו ניתוח שהספק משתמש בו (התאריכים מחושבים מהיום; ספירות ורמות זהות בכל יום) */
const A = getAnalysis()
type Persona = (typeof DEMO_SUBJECT_PERSONAS)[number]
const homeroomOf = (cid: string): V2Viewer => ({ lens: 'homeroom', guest: true, homeroomClassId: cid, teachingClassIds: [], subjectCodes: [] })
const homeroom = homeroomOf(DEMO_HOMEROOM_CLASS)
const admin: V2Viewer = { lens: 'admin', guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
const teacher = (s: Persona): V2Viewer => ({ lens: 'subject_teacher', guest: true, homeroomClassId: null, teachingClassIds: demoViewerClasses([s]), subjectCodes: [s] })
const castId = (cast: string): string => A.world.students.find((s) => s.cast === cast)!.id
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length
const round1 = (x: number): number => Math.round(x * 10) / 10

/* ממצא מדווח בטון "תשומת לב" לתלמיד/ה במקצועות נתונים (+ התרעה חוצת-מקצועות למחנך) — חישוב עצמאי מהניתוח */
const hasAttention = (sid: string, subjects: string[], withCross: boolean): boolean => {
  const own = subjects.flatMap((s) => (A.ss.get(skey(sid, s as never))?.findings ?? []))
  const cross = withCross ? A.crossSubject.get(sid) ?? [] : []
  return [...own, ...cross].some((f) => f.status === 'reported' && f.tone === 'attention')
}

describe('חוזה: נקודות הקצה החדשות רשומות ועוברות את הסכמות בכל העדשות', () => {
  it('EP כולל entry ו-classOverview', () => {
    expect(EP.entry.path).toBe('/api/analytics-v2/entry')
    expect(EP.classOverview.path).toBe('/api/analytics-v2/class/:classId/overview')
  })

  it('entry: כל עדשה (מחנך לכל כיתה, כל מורה מקצועי, מנהל)', async () => {
    const viewers: V2Viewer[] = [...A.world.classes.map((c) => homeroomOf(c.id)), ...DEMO_SUBJECT_PERSONAS.map(teacher), admin]
    for (const v of viewers) {
      const r = EP.entry.response.safeParse(await demoProvider.entry(v))
      expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 2))).toBe(true)
    }
  })

  it('classOverview: מחנך של כל כיתה עובר את הסכמה; classSubject/student/briefing של כל העולם עוברים עם השדות החדשים', async () => {
    for (const c of A.world.classes) {
      const v = homeroomOf(c.id)
      const o = EP.classOverview.response.safeParse(await demoProvider.classOverview(v, c.id))
      expect(o.success, `${c.id}: ${JSON.stringify(o.error?.issues?.slice(0, 2))}`).toBe(true)
      for (const sub of new Set(c.studentIds.flatMap((sid) => A.studentById.get(sid)!.subjects))) {
        const r = EP.classSubject.response.safeParse(await demoProvider.classSubject(v, c.id, sub))
        expect(r.success, `${c.id}/${sub}: ${JSON.stringify(r.error?.issues?.slice(0, 2))}`).toBe(true)
      }
      for (const sid of c.studentIds) {
        const s = EP.student.response.safeParse(await demoProvider.student(v, sid))
        expect(s.success, `${sid}: ${JSON.stringify(s.error?.issues?.slice(0, 2))}`).toBe(true)
        expect(EP.briefing.response.safeParse(await demoProvider.briefing(v, 'student', sid)).success).toBe(true)
      }
    }
    for (const sub of DEMO_SUBJECT_PERSONAS) {
      const v = teacher(sub)
      for (const cid of v.teachingClassIds) {
        for (const sid of A.classById.get(cid)!.studentIds.filter((x) => A.studentById.get(x)!.subjects.includes(sub))) {
          expect(EP.student.response.safeParse(await demoProvider.student(v, sid)).success, `${sub}/${sid}`).toBe(true)
        }
      }
    }
  })

  it('הספק האמיתי: entry ו-classOverview מחזירים "אין עדיין מספיק נתונים" ועומדים בסכמות', async () => {
    const e = await realProvider.entry(homeroom)
    expect(e.dataState).toBe('insufficient')
    expect(EP.entry.response.safeParse(e).success).toBe(true)
    const o = await realProvider.classOverview(homeroom, DEMO_HOMEROOM_CLASS)
    expect(o.dataState).toBe('insufficient')
    expect(EP.classOverview.response.safeParse(o).success).toBe(true)
    const c = await realProvider.classSubject(homeroom, DEMO_HOMEROOM_CLASS, 'math')
    expect(EP.classSubject.response.safeParse(c).success).toBe(true)
    expect(c.data.summary.headline).toBe(NO_DATA_YET)
  })
})

describe('מסך הכניסה "בחרו כיתה"', () => {
  it('מחנך: הכיתה שלו; attentionCount = מספר התלמידים עם ממצא תשומת לב (כל המקצועות + התרעה חוצת-מקצועות)', async () => {
    const e = (await demoProvider.entry(homeroom)).data
    expect(e.classes.map((c) => c.id)).toEqual([DEMO_HOMEROOM_CLASS])
    const cls = A.classById.get(DEMO_HOMEROOM_CLASS)!
    expect(e.classes[0]).toMatchObject({ name: cls.name, gradeLabel: cls.gradeLabel, studentCount: cls.studentIds.length })
    const expected = cls.studentIds.filter((sid) => hasAttention(sid, A.studentById.get(sid)!.subjects, true)).length
    expect(e.classes[0].attentionCount).toBe(expected)
    expect(expected).toBeGreaterThanOrEqual(4)
  })

  it('מחנך: עד 3 התרעות, תלמיד אחד בכל התרעה, ההתרעה חוצת-המקצועות (תמר) ראשונה, ומשפט פשוט עם שם התלמיד', async () => {
    const e = (await demoProvider.entry(homeroom)).data
    expect(e.alerts.length).toBeGreaterThan(0)
    expect(e.alerts.length).toBeLessThanOrEqual(ENTRY_MAX_ALERTS)
    expect(new Set(e.alerts.map((a) => a.studentId)).size).toBe(e.alerts.length)
    expect(e.alerts[0].studentId).toBe(castId('tamar'))
    for (const a of e.alerts) {
      expect(a.classId).toBe(DEMO_HOMEROOM_CLASS)
      expect(a.className).toBe(A.classById.get(DEMO_HOMEROOM_CLASS)!.name)
      expect(a.studentName).toBe(A.studentById.get(a.studentId)!.displayName)
      expect(a.text).toContain(a.studentName)
      expect(hasAttention(a.studentId, A.studentById.get(a.studentId)!.subjects, true)).toBe(true)
    }
  })

  it('מורה מקצועי: רק כיתותיו; attentionCount והתרעות מתוך המקצוע שלו בלבד', async () => {
    for (const sub of DEMO_SUBJECT_PERSONAS) {
      const v = teacher(sub)
      const e = (await demoProvider.entry(v)).data
      expect(e.classes.map((c) => c.id).sort()).toEqual([...v.teachingClassIds].sort())
      for (const c of e.classes) {
        const mine = A.classById.get(c.id)!.studentIds.filter((sid) => A.studentById.get(sid)!.subjects.includes(sub))
        expect(c.studentCount, `${sub}/${c.id}`).toBe(mine.length)
        expect(c.attentionCount, `${sub}/${c.id}`).toBe(mine.filter((sid) => hasAttention(sid, [sub], false)).length)
      }
      expect(e.alerts.length).toBeLessThanOrEqual(ENTRY_MAX_ALERTS)
      for (const a of e.alerts) {
        expect(hasAttention(a.studentId, [sub], false), `${sub}: ${a.text}`).toBe(true)
        expect(a.text).toContain(a.studentName)
      }
    }
    /* עברית: תמר היא היחידה בכיתה ו׳2 עם ממצא בעברית; מתמטיקה: דניאל — ואין זליגה של ההתרעה החוצת-מקצועות */
    const heb = (await demoProvider.entry(teacher('hebrew'))).data
    expect(heb.classes.find((c) => c.id === DEMO_HOMEROOM_CLASS)!.attentionCount).toBe(1)
    const math = (await demoProvider.entry(teacher('math'))).data
    expect(math.alerts.map((a) => a.studentId)).toContain(castId('daniel'))
    expect(math.alerts.map((a) => a.studentId)).not.toContain(castId('tamar'))
    expect(math.alerts.every((a) => /מתמטיקה/.test(a.text))).toBe(true)
    const home = (await demoProvider.entry(homeroom)).data
    expect(home.classes[0].attentionCount).toBeGreaterThan(heb.classes.find((c) => c.id === DEMO_HOMEROOM_CLASS)!.attentionCount)
  })

  it('מנהל: מערכים ריקים, ואין שם/מזהה תלמיד או מידע על מורים באף תגובה (כולל entry)', async () => {
    const e = await demoProvider.entry(admin)
    expect(e.data).toEqual({ classes: [], alerts: [] })
    const config = await demoProvider.config(admin) /* מפתחות העדשות (subject_teacher) הם חלק מהחוזה — לא טקסט */
    const payloads = JSON.stringify([e, await demoProvider.admin(admin), await demoProvider.roster(admin), config])
    for (const st of A.world.students) {
      expect(payloads.includes(st.displayName), st.displayName).toBe(false)
      expect(payloads.includes(st.id), st.id).toBe(false)
    }
    expect(JSON.stringify([e, await demoProvider.admin(admin), await demoProvider.roster(admin)])).not.toMatch(/teacher|מורה/i)
    await expect(demoProvider.classOverview(admin, 'c-v2')).rejects.toMatchObject({ status: 403 })
  })
})

describe('"סקירה" של הכיתה (מחנך בלבד)', () => {
  const cls = A.classById.get(DEMO_HOMEROOM_CLASS)!
  const subjectsOf = (): string[] => [...new Set(cls.studentIds.flatMap((sid) => A.studentById.get(sid)!.subjects))]

  it('שורה לכל מקצוע בכיתה; הרמה, המיקום והמגמה מחושבים מהניתוח', async () => {
    const o = (await demoProvider.classOverview(homeroom, DEMO_HOMEROOM_CLASS)).data
    expect(o.class).toMatchObject({ id: cls.id, name: cls.name, studentCount: cls.studentIds.length })
    expect(o.rows.map((r) => r.subject.code)).toEqual(subjectsOf())
    expect(o.summary).toContain(cls.name)
    const norm = A.ageNormOf(cls.grade)
    for (const r of o.rows) {
      const sas = cls.studentIds.filter((s) => A.studentById.get(s)!.subjects.includes(r.subject.code)).map((s) => A.ss.get(skey(s, r.subject.code))!)
      const level = round1(mean(sas.map((x) => x.currentLevel).filter((x): x is number => x !== null)))
      expect(r.level).toBe(level)
      expect(r.ageNorm).toEqual(norm)
      expect(r.positionVsNorm).toBe(positionOf(level, norm))
      expect(r.positionText).toBe(POSITION_TEXT[r.positionVsNorm!])
      expect(r.trend).toBe(groupTrend(sas))
      expect(r.trendText).toBe(GROUP_TREND_TEXT[r.trend])
      const attention = sas.filter((x) => hasAttention(x.studentId, [r.subject.code], false)).length
      expect(r.alerts).toBe(attention)
      expect(r.alertTexts.length).toBe(Math.min(attention, 3))
    }
    expect(o.caveats.ageNorm.length).toBeGreaterThan(10)
  })

  it('תחומים: תוויות "תחום" בעברית פשוטה, חזק ומאתגר זרים זה לזה, ויש גיוון בדמו (מיקום, מגמה ותחומים)', async () => {
    const o = (await demoProvider.classOverview(homeroom, DEMO_HOMEROOM_CLASS)).data
    const labels = new Set<string>(CONTENT_VECTOR_KINDS.map((v) => v.labelHe))
    for (const r of o.rows) {
      for (const a of [...r.strongAreas, ...r.challengingAreas]) expect(labels.has(a), a).toBe(true)
      expect(r.strongAreas.filter((a) => r.challengingAreas.includes(a))).toEqual([])
    }
    expect(o.rows.some((r) => r.strongAreas.length > 0)).toBe(true)
    expect(o.rows.some((r) => r.challengingAreas.length > 0)).toBe(true)
    expect(new Set(o.rows.map((r) => r.positionVsNorm)).size).toBeGreaterThanOrEqual(3)
    expect(o.rows.some((r) => r.trend === 'improving')).toBe(true)
    expect(o.rows.some((r) => r.trend === 'declining')).toBe(true)
  })

  it('מורה מקצועי / מנהל / מחנך של כיתה אחרת: 403; כיתה לא קיימת: 404', async () => {
    for (const sub of DEMO_SUBJECT_PERSONAS) await expect(demoProvider.classOverview(teacher(sub), DEMO_HOMEROOM_CLASS), sub).rejects.toMatchObject({ status: 403 })
    await expect(demoProvider.classOverview(admin, DEMO_HOMEROOM_CLASS)).rejects.toMatchObject({ status: 403 })
    await expect(demoProvider.classOverview(homeroomOf('c-v1'), DEMO_HOMEROOM_CLASS)).rejects.toMatchObject({ status: 403 })
    await expect(demoProvider.classOverview(homeroom, 'no-such-class')).rejects.toMatchObject({ status: 404 })
  })
})

describe('מקצוע בכיתה: סיכום | טעויות נפוצות | התקדמות | תלמידים', () => {
  it('סיכום: משפט פתיחה, עד 3 משפטים של "מה קרה לאחרונה", ו"מה ללמד" = ההמלצות', async () => {
    for (const c of A.world.classes) {
      const v = homeroomOf(c.id)
      for (const sub of new Set(c.studentIds.flatMap((sid) => A.studentById.get(sid)!.subjects))) {
        const view = (await demoProvider.classSubject(v, c.id, sub)).data
        expect(view.summary.headline.length, `${c.id}/${sub}`).toBeGreaterThan(10)
        expect(view.summary.recent.length).toBeLessThanOrEqual(SUMMARY_RECENT_MAX)
        for (const s of view.summary.recent) expect(s.length).toBeGreaterThan(10)
        expect(view.summary.whatToTeach).toEqual(view.recommendations)
      }
    }
    const v2hebrew = (await demoProvider.classSubject(homeroom, DEMO_HOMEROOM_CLASS, 'hebrew')).data
    expect(v2hebrew.summary.recent.length).toBeGreaterThanOrEqual(2)
    expect(v2hebrew.summary.recent[0]).toMatch(/מאז תחילת מחצית/) /* השיפור הכיתתי בהבנה מורפולוגית — ראשון */
  })

  it('מורה רשאי לראות שמות תלמידים באירועים; מנהל אינו מקבל את המסך כלל', async () => {
    const v = teacher('math')
    const view = (await demoProvider.classSubject(v, 'c-v2', 'math')).data
    const names = new Set(view.students.map((s) => s.displayName))
    const sentences = [...view.summary.recent, ...view.progress.events.map((e) => e.text)]
    expect(sentences.some((t) => [...names].some((n) => t.includes(n)))).toBe(true)
    await expect(demoProvider.classSubject(admin, 'c-v2', 'math')).rejects.toMatchObject({ status: 403 })
  })

  it('התקדמות: ממוצע חודשי של הכיתה (n = כמה תלמידים), ממוין, עם רצועת נורמה ואירועים על ציר הזמן', async () => {
    const view = (await demoProvider.classSubject(teacher('math'), 'c-v2', 'math')).data
    const p = view.progress
    expect(p.ageNorm).toEqual(view.classLevel.ageNorm)
    expect(p.series.length).toBeGreaterThanOrEqual(6)
    for (let i = 1; i < p.series.length; i++) expect(p.series[i].date > p.series[i - 1].date).toBe(true)
    const cls = A.classById.get('c-v2')!
    const sas = cls.studentIds.map((s) => A.ss.get(skey(s, 'math'))!)
    for (const pt of p.series) {
      const month = pt.date.slice(0, 7)
      const perStudent = sas.map((sa) => sa.levelSeries.find((x) => x.date.slice(0, 7) === month)?.level).filter((x): x is number => x !== undefined)
      expect(pt.n).toBe(perStudent.length)
      expect(pt.n).toBeGreaterThanOrEqual(1)
      expect(pt.level).toBe(round1(mean(perStudent)))
    }
    for (let i = 1; i < p.events.length; i++) expect(p.events[i].date >= p.events[i - 1].date).toBe(true)
    for (const e of p.events) { expect(['positive', 'attention', 'neutral']).toContain(e.tone); expect(e.text.length).toBeGreaterThan(10) }
    /* דניאל: הטיית מיקום במתמטיקה מסומנת כאירוע תשומת לב */
    expect(p.events.some((e) => e.tone === 'attention' && e.text.includes(A.studentById.get(castId('daniel'))!.displayName))).toBe(true)
  })

  it('תלמידים: מגמה מחושבת מרמת 60 הימים האחרונים מול 90–150 (סף חצי רמה); חסר צד → אין עדיין מספיק נתונים', async () => {
    const view = (await demoProvider.classSubject(homeroom, DEMO_HOMEROOM_CLASS, 'math')).data
    for (const s of view.students) {
      const sa = A.ss.get(skey(s.id, 'math'))!
      let expected: string
      if (sa.level60 === null || sa.level90to150 === null) expected = 'insufficient'
      else {
        const d = round1(sa.level60 - sa.level90to150)
        expected = d >= TREND_LABEL_MIN_DELTA ? 'improving' : d <= -TREND_LABEL_MIN_DELTA ? 'declining' : 'steady'
      }
      expect(s.trend, s.displayName).toBe(expected)
      expect(s.trendText).toBe(TREND_TEXT[s.trend])
      expect(s.positionText).toBe(s.positionVsNorm ? POSITION_TEXT[s.positionVsNorm] : null)
    }
    const byCast = async (cast: string, sub: 'math' | 'history' | 'hebrew'): Promise<string> =>
      (await demoProvider.classSubject(homeroom, DEMO_HOMEROOM_CLASS, sub)).data.students.find((s) => s.id === castId(cast))!.trend
    expect(await byCast('maya', 'math')).toBe('improving')
    expect(await byCast('alon', 'history')).toBe('declining')
    expect(await byCast('tamar', 'history')).toBe('declining')
    expect(await byCast('roi', 'math')).toBe('insufficient')
    expect(view.trendText).toBe(GROUP_TREND_TEXT[view.trend])
  })

  it('טעויות נפוצות: כל מספר ניתן להצגה כ"X מתוך Y" (שורה ותלמידים)', async () => {
    for (const cid of ['c-v1', 'c-v2']) {
      const view = (await demoProvider.classSubject(homeroomOf(cid), cid, 'math')).data
      for (const m of view.misconceptions) {
        if (m.status === 'reported') expect(m.countText).toContain(`${m.studentsShowing} מתוך ${m.studentsExposed}`)
        else expect(m.countText).toContain(NO_DATA_YET)
        for (const s of m.students) { expect(s.hits).toBeLessThanOrEqual(s.exposures); expect(s.exposures).toBeGreaterThan(0) }
      }
    }
  })
})

describe('עמוד התלמיד/ה: מגמה, תחומים וטעויות נפוצות', () => {
  it('לוח מקצוע גלוי: trend/trendText/areas/commonErrors, משפט סיכום בראש העמוד', async () => {
    const o = (await demoProvider.student(homeroom, castId('tamar'))).data
    expect(o.summary).toContain('תמר')
    expect(o.summary).toMatch(/כמה מקצועות/)
    const byCode = new Map(o.panels.filter((p) => p.access === 'visible').map((p) => [p.subject.code, p]))
    for (const sub of ['history', 'science', 'hebrew'] as const) {
      const p = byCode.get(sub)!
      expect(p.access === 'visible' && p.trend).toBe('declining')
      expect(p.access === 'visible' && p.trendText).toBe(TREND_TEXT.declining)
    }
    const labels = new Set<string>(CONTENT_VECTOR_KINDS.map((v) => v.labelHe))
    for (const p of byCode.values()) {
      if (p.access !== 'visible') continue
      for (const a of [...p.areas.strong, ...p.areas.challenging]) expect(labels.has(a), a).toBe(true)
      expect(p.positionText).toBe(p.positionVsNorm ? POSITION_TEXT[p.positionVsNorm] : null)
    }
    /* טעות נפוצה של תמר במתמטיקה: ½+⅓→⅖ — hits מתוך exposures, ממוין */
    const math = byCode.get('math')!
    expect(math.access === 'visible' && math.commonErrors.map((e) => e.id)).toContain('mc-frac-add-straight')
    if (math.access === 'visible') {
      for (const e of math.commonErrors) { expect(e.hits).toBeGreaterThanOrEqual(2); expect(e.exposures).toBeGreaterThanOrEqual(3); expect(e.hits).toBeLessThanOrEqual(e.exposures) }
      for (let i = 1; i < math.commonErrors.length; i++) expect(math.commonErrors[i - 1].hits).toBeGreaterThanOrEqual(math.commonErrors[i].hits)
    }
  })

  it('commonErrors תואם בדיוק את רשימת "מציגי התפיסה" של הכיתה; תחומים רק מתחומים מדווחים', async () => {
    const cls = A.classById.get(DEMO_HOMEROOM_CLASS)!
    for (const sid of cls.studentIds) {
      const o = (await demoProvider.student(homeroom, sid)).data
      for (const p of o.panels) {
        if (p.access !== 'visible') continue
        for (const e of p.commonErrors) {
          const mine = A.misByClass.get(`${DEMO_HOMEROOM_CLASS}|${e.id}`)!.students.find((x) => x.id === sid)
          expect(mine, `${sid}/${e.id}`).toBeDefined()
          expect([e.hits, e.exposures]).toEqual([mine!.hits, mine!.exposures])
        }
        const reported = new Set<string>(p.contentVectors.filter((c) => c.status === 'reported').map((c) => contentVectorLabel(c.key)))
        for (const a of [...p.areas.strong, ...p.areas.challenging]) expect(reported.has(a), `${sid}/${a}`).toBe(true)
      }
    }
  })

  it('מורה מקצועי: אין זליגה של משפט הסיכום (התרעה חוצת-מקצועות) ואין לוח של מקצוע אחר', async () => {
    const o = (await demoProvider.student(teacher('math'), castId('tamar'))).data
    expect(o.summary).not.toMatch(/כמה מקצועות/)
    for (const p of o.panels) if (p.subject.code !== 'math') expect(Object.keys(p).sort()).toEqual(['access', 'subject'])
  })
})

describe('מנהל: חיתוכים לטאבים סקירה | שכבות | מקצועות | טעויות נפוצות', () => {
  it('highlights, gradeRows, subjectRows מאותם תאים; תא קטן מוסתר בכל החיתוכים; ללא שם/מזהה תלמיד', async () => {
    const a = (await demoProvider.admin(admin)).data
    expect(a.highlights.length).toBeGreaterThanOrEqual(1)
    expect(a.highlights.length).toBeLessThanOrEqual(3)
    expect(a.gradeRows.map((g) => g.grade)).toEqual(a.grades.map((g) => g.grade))
    for (const g of a.gradeRows) {
      expect(g.summary.length).toBeGreaterThan(10)
      expect(g.cells).toEqual(a.cells.filter((c) => c.grade === g.grade))
    }
    const codes = [...new Set(a.cells.map((c) => c.subject.code))]
    expect(a.subjectRows.map((r) => r.subject.code).sort()).toEqual([...codes].sort())
    for (const r of a.subjectRows) {
      expect(r.cells).toEqual(a.cells.filter((c) => c.subject.code === r.subject.code).sort((x, y) => x.grade - y.grade))
      expect(r.summary).toContain(r.subject.nameHe)
    }
    const hidden = a.subjectRows.find((r) => r.subject.code === 'arabic')!.cells[0]
    expect(hidden).toMatchObject({ status: 'hidden', text: ADMIN_HIDDEN_CELL_TEXT })
    expect(Object.keys(hidden)).not.toContain('studentCount')
    for (const c of a.cells) {
      if (c.status !== 'shown') continue
      expect(c.studentCount).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
      expect(c.positionText).toBe(POSITION_TEXT[c.position])
      expect(c.trendText).toBe(GROUP_TREND_TEXT[c.trend])
      expect(c.gradeLabel.length).toBeGreaterThan(0)
    }
    expect(new Set(a.cells.flatMap((c) => (c.status === 'shown' ? [c.position] : []))).size).toBeGreaterThanOrEqual(2)
    const json = JSON.stringify(a)
    for (const st of A.world.students) { expect(json.includes(st.displayName)).toBe(false); expect(json.includes(st.id)).toBe(false) }
    expect(json).not.toMatch(/teacher|מורה/i)
  })

  it('טעויות נפוצות: X מתוך Y תלמידים, מכנה ≥ סף התא', async () => {
    const a = (await demoProvider.admin(admin)).data
    expect(a.misconceptions.length).toBeGreaterThan(3)
    for (const m of a.misconceptions) {
      expect(m.studentsShowing).toBeLessThanOrEqual(m.studentsExposed)
      expect(m.studentsExposed).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
      expect(m.text).toContain(`${m.studentsShowing} מתוך ${m.studentsExposed}`)
      expect(m.countText).toContain(`${m.studentsShowing} מתוך ${m.studentsExposed}`)
      expect(m.sharePct).toBe(Math.round((100 * m.studentsShowing) / m.studentsExposed))
    }
  })
})

describe('חישובי תצוגה טהורים (derive)', () => {
  it('מגמה: סף חצי רמה, חסר נתון → אין עדיין מספיק נתונים', () => {
    expect(trendOfDelta(0.5)).toBe('improving')
    expect(trendOfDelta(0.49)).toBe('steady')
    expect(trendOfDelta(-0.5)).toBe('declining')
    expect(trendOfDelta(-0.44)).toBe('steady')
    expect(trendOfDelta(null)).toBe('insufficient')
    expect(trendOfDelta(Number.NaN)).toBe('insufficient')
  })
  it('מגמת קבוצה דורשת מינימום תלמידים עם מגמה', () => {
    const s = (a: number | null, b: number | null) => ({ level60: a, level90to150: b })
    expect(groupTrend([s(10, 8), s(10, 8)])).toBe('insufficient')
    expect(GROUP_TREND_MIN_STUDENTS).toBe(3)
    expect(groupTrend([s(10, 8), s(11, 9), s(10, 9), s(null, 9)])).toBe('improving')
    expect(groupTrend([s(8, 10), s(8, 9), s(8, 8.5)])).toBe('declining')
    expect(groupTrend([s(9, 9), s(9.1, 9), s(9, 9.2)])).toBe('steady')
  })
  it('מיקום מול הטווח המיועד', () => {
    const norm = { gradeLabel: 'ו׳', center: 10, low: 8.5, high: 11.5 }
    expect([positionOf(12, norm), positionOf(10, norm), positionOf(8, norm), positionOf(null, norm)]).toEqual(['above', 'within', 'below', null])
    expect([positionOf(11.5, norm), positionOf(8.5, norm)]).toEqual(['within', 'within'])
  })
  it('תחומים: רק מדווחים, ורק כשהפער לפחות רמה אחת מרמת הייחוס; ברמת כיתה — מינימום תלמידים', () => {
    const v = (key: string, level: number | null, status: 'reported' | 'insufficient' = 'reported') => ({ key, level, status })
    const keys = studentAreaKeys([v('factual', 12), v('concept_understanding', 8), v('sequence_causality', 10.5), v('domain_reading', 14, 'insufficient'), v('application_inference', null)], 10)
    expect(keys.strong).toEqual(['factual'])
    expect(keys.challenging).toEqual(['concept_understanding'])
    expect(AREA_MIN_DELTA).toBe(1)
    expect(studentAreaKeys([v('factual', 12)], null)).toEqual({ strong: [], challenging: [] })
    const sa = (level: number) => ({ contentVectors: [{ key: 'factual', level, deltaLevels: null, n: 9, status: 'reported' as const }] })
    expect(classAreaKeys([sa(12), sa(12), sa(12), sa(12)], 10).strong).toEqual([])
    expect(classAreaKeys([sa(12), sa(12), sa(12), sa(12), sa(12)], 10).strong).toEqual(['factual'])
  })
})

describe('תבניות עברית פשוטה', () => {
  it('מגמה במילים כפי שהוגדר, וספירות כ"X מתוך Y"', () => {
    expect(TREND_TEXT).toEqual({ improving: 'משתפר/ת', steady: 'יציב/ה', declining: 'בירידה', insufficient: 'אין עדיין מספיק נתונים' })
    expect(unitCount('level_trend', 1)).toBe('הדמיה אחת')
    expect(unitCount('level_trend', 10)).toBe('10 הדמיות')
    expect(basisLine(unitCount('level_trend', 10), '2025-12-01T12:00:00Z', '2026-10-01T12:00:00Z')).toBe('מבוסס על 10 הדמיות, מדצמבר 2025 עד אוקטובר 2026')
    const t = narrateInsufficient('memory_random_pattern', 'n_below_min', 3, 6, { studentName: 'דנה', subjectName: 'מדעים' })
    expect(t).toContain('אין עדיין מספיק נתונים')
    expect(t).toContain('3 משחקי זיכרון')
    expect(narrateOverviewSummary({ className: 'ו׳2', above: 0, within: 0, below: 0, attentionStudents: 0 })).toContain('אין עדיין מספיק נתונים')
    expect(narrateOverviewSummary({ className: 'ו׳2', above: 1, within: 3, below: 1, attentionStudents: 2 })).toMatch(/מתוך 5 מקצועות: 1 מעל הטווח המיועד לשכבה, 3 בתוכו, 1 מתחתיו\. 2 תלמידים לתשומת לב\./)
  })
})
