import { describe, expect, it } from 'vitest'
import { FDR_ALPHA, KIND_THRESHOLDS, MIN_CELL_SIZE as CONFIG_MIN_CELL, MISCONCEPTION_RULE } from '../../../../src/shared/lib/analyticsConfig.js'
import { termLabel, monthYear, termOf, latestTermStart } from '../../../../src/shared/lib/findingsNarrative.js'
import { EP, type Finding } from '../../../../src/shared/types/analyticsV2.js'
import { MIN_CELL_SIZE } from '../authz.js'
import { DEMO_HOMEROOM_CLASS, type V2Viewer } from './access.js'
import { demoProvider, demoViewerClasses, getAnalysis } from './demoProvider.js'
import { realProvider } from './provider.js'
import { buildWorld, skey } from './demoWorld.js'
import { analyze } from './engine.js'
import { simulateClass } from './liveTrendSim.js'
import { benjaminiHochberg, binomialUpperTail, normalCdf, poissonBinomialUpper, tTwoSided, welch, pairedT } from './stats.js'
import { DEMO_WORLD, LEVEL_TREND_BASIS, MEMORY_ATTENTIVE_RATE } from '../../../../src/shared/lib/analyticsConfig.js'
import { israelDayKey } from '../../../../src/shared/lib/findingsNarrative.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { DEMO_CATALOG, EMPTY_CATALOG, createCatalog } from './catalog.js'
import { commonErrorsOf, groupTrend, studentTrend, trendDelta } from './derive.js'
import { rngFor, type MemGame, type SessionRec, type StudentSubjectData, type World } from './demoWorld.js'
import { TERM_MIN_SCHOOL_DAYS, buildSchoolDays, dayIndexOf, israelMonthKey, liveTerm } from './schoolCalendar.js'
import { perfectSeparationP, tUpperTail } from './stats.js'

const NOW = new Date('2026-10-19T09:00:00Z')
const A = getAnalysis(NOW)
const homeroom: V2Viewer = { lens: 'homeroom', guest: true, homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] }
const admin: V2Viewer = { lens: 'admin', guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
const teacher = (subject: 'math' | 'hebrew' | 'history' | 'science' | 'english'): V2Viewer =>
  ({ lens: 'subject_teacher', guest: true, homeroomClassId: null, teachingClassIds: demoViewerClasses([subject]), subjectCodes: [subject] })

const studentIdByCast = (cast: string): string => A.world.students.find((s) => s.cast === cast)!.id
const allReported = (): Finding[] => {
  const out: Finding[] = []
  for (const sa of A.ss.values()) out.push(...sa.findings)
  for (const list of A.classFindings.values()) out.push(...list.map((x) => x.finding))
  for (const list of A.crossSubject.values()) out.push(...list)
  return out
}

describe('stats', () => {
  it('normalCdf / t / binomial ערכים ידועים', () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(tTwoSided(2.228, 10)).toBeCloseTo(0.05, 2)
    expect(binomialUpperTail(8, 10, 0.5)).toBeCloseTo(0.0547, 3)
    expect(poissonBinomialUpper(5, Array(10).fill(0.5))).toBeCloseTo(0.623, 1)
  })
  it('Benjamini-Hochberg: מונוטוני ובגודל הקלט', () => {
    const adj = benjaminiHochberg([0.001, 0.04, 0.03, 0.5])
    expect(adj).toHaveLength(4)
    expect(adj[0]).toBeCloseTo(0.004, 3)
    expect(adj[2]).toBeCloseTo(0.0533, 3)
    expect(adj[1]).toBeCloseTo(0.0533, 3) /* מונוטוניות: 0.04*4/3 = 0.0533 */
    expect(adj[3]).toBe(0.5)
  })
  it('Welch ו-t זוגי: כיוון וגודל אפקט', () => {
    const r = welch([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
    expect(r.d).toBeLessThan(-2)
    expect(r.pTwoSided).toBeLessThan(0.01)
    const z = pairedT([1, 1.2, 0.9, 1.1, 1.0, 0.8])
    expect(z.dz).toBeGreaterThan(3)
  })
})

describe('config', () => {
  it('MIN_CELL_SIZE ב-config זהה ל-authz', () => { expect(CONFIG_MIN_CELL).toBe(MIN_CELL_SIZE) })
})

describe('חוזה: כל ה-fixtures עוברים את סכמות ה-zod', () => {
  it('config / roster לכל עדשה', async () => {
    for (const v of [homeroom, admin, teacher('math'), teacher('hebrew')]) {
      expect(EP.config.response.safeParse(await demoProvider.config(v)).success).toBe(true)
      const r = EP.roster.response.safeParse(await demoProvider.roster(v))
      expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 2))).toBe(true)
      const e = EP.entry.response.safeParse(await demoProvider.entry(v))
      expect(e.success, JSON.stringify(e.error?.issues?.slice(0, 2))).toBe(true)
    }
  })
  it('student + feedback + briefing לכל תלמידי הכיתה (מחנך)', async () => {
    const cls = A.classById.get(DEMO_HOMEROOM_CLASS)!
    for (const sid of cls.studentIds) {
      const s = EP.student.response.safeParse(await demoProvider.student(homeroom, sid))
      expect(s.success, `${sid}: ${JSON.stringify(s.error?.issues?.slice(0, 2))}`).toBe(true)
      expect(EP.feedback.response.safeParse(await demoProvider.feedback(homeroom, sid)).success).toBe(true)
      const b = EP.briefing.response.safeParse(await demoProvider.briefing(homeroom, 'student', sid))
      expect(b.success, `${sid}: ${JSON.stringify(b.error?.issues?.slice(0, 2))}`).toBe(true)
    }
    expect(EP.briefing.response.safeParse(await demoProvider.briefing(homeroom, 'class', DEMO_HOMEROOM_CLASS)).success).toBe(true)
  })
  it('classSubject לכל מורה מקצועי בכל כיתותיו', async () => {
    for (const sub of ['math', 'hebrew', 'history', 'science', 'english'] as const) {
      const v = teacher(sub)
      for (const cid of v.teachingClassIds) {
        const r = EP.classSubject.response.safeParse(await demoProvider.classSubject(v, cid, sub))
        expect(r.success, `${sub}/${cid}: ${JSON.stringify(r.error?.issues?.slice(0, 2))}`).toBe(true)
        expect(EP.briefing.response.safeParse(await demoProvider.briefing(v, 'class', cid)).success).toBe(true)
      }
    }
  })
  it('admin overview עובר את הסכמה', async () => {
    const r = EP.admin.response.safeParse(await demoProvider.admin(admin))
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true)
  })
  it('הספק האמיתי מחזיר "אין עדיין מספיק נתונים" ועומד באותן סכמות', async () => {
    const v = homeroom
    const checks = [
      [EP.config.response, await realProvider.config(v)],
      [EP.roster.response, await realProvider.roster(v)],
      [EP.entry.response, await realProvider.entry(v)],
      [EP.classOverview.response, await realProvider.classOverview(v, 'c')],
      [EP.student.response, await realProvider.student(v, 'x')],
      [EP.feedback.response, await realProvider.feedback(v, 'x')],
      [EP.classSubject.response, await realProvider.classSubject(v, 'c', 'math')],
      [EP.admin.response, await realProvider.admin(admin)],
      [EP.briefing.response, await realProvider.briefing(v, 'class', 'c')],
    ] as const
    for (const [schema, env] of checks) {
      expect(env.dataState).toBe('insufficient')
      expect(schema.safeParse(env).success).toBe(true)
    }
  })
})

describe('עקביות: אחוזים מול ספירות, ממצאים מעל הספים', () => {
  it('כל ממצא מדווח עומד ב-N, ב-BH ובגודל האפקט; ממצא שלא — insufficient ללא ראיות', () => {
    const fs = allReported()
    expect(fs.length).toBeGreaterThan(10)
    for (const f of fs) {
      const th = KIND_THRESHOLDS[f.kind]
      if (f.status === 'reported') {
        expect(f.n, f.id).toBeGreaterThanOrEqual(th.minN)
        expect(f.pAdjusted, f.id).toBeLessThan(FDR_ALPHA)
        expect(Math.abs(f.effectSize), f.id).toBeGreaterThanOrEqual(th.minEffect)
        expect(f.evidence.kind).toBe(f.kind)
      } else {
        expect(f.evidence).toBeNull()
        if (f.reason === 'n_below_min') expect(f.n).toBeLessThan(th.minN)
        else expect((f.pAdjusted ?? 1) >= FDR_ALPHA).toBe(true)
        expect(f.text).toContain('אין עדיין מספיק נתונים')
      }
    }
  })
  it('sharePct = round(100·showing/exposed) בכל שורת תפיסה; שברים בשכבה ו׳ = 21/50 = 42%', async () => {
    for (const cid of A.world.classes.map((c) => c.id)) {
      for (const sub of ['math', 'hebrew', 'history', 'science', 'english', 'bible'] as const) {
        const v: V2Viewer = { lens: 'homeroom', guest: true, homeroomClassId: cid, teachingClassIds: [], subjectCodes: [] }
        const cls = A.classById.get(cid)!
        if (!cls.studentIds.some((s) => A.studentById.get(s)!.subjects.includes(sub))) continue
        const view = (await demoProvider.classSubject(v, cid, sub)).data
        for (const m of view.misconceptions) {
          if (m.sharePct !== null) expect(m.sharePct, m.id).toBe(Math.round((100 * m.studentsShowing) / m.studentsExposed))
          else expect(m.studentsExposed).toBeLessThan(MIN_CELL_SIZE)
          expect(m.students.length).toBe(m.studentsShowing)
        }
      }
    }
    const grade6 = A.misByGrade.get('6|mc-frac-add-straight')!
    expect([grade6.studentsShowing, grade6.studentsExposed, grade6.sharePct]).toEqual([21, 50, 42])
    const adm = (await demoProvider.admin(admin)).data
    const row = adm.misconceptions.find((m) => m.id === 'mc-frac-add-straight')!
    expect(row.sharePct).toBe(42)
    expect(row.text).toContain('42%')
  })
  it('כללי תפיסה: כל "מציג" עומד בספי החשיפות והפגיעות', () => {
    for (const stat of A.misByClass.values()) for (const s of stat.students) {
      expect(s.exposures).toBeGreaterThanOrEqual(MISCONCEPTION_RULE.minExposuresPerStudent)
      expect(s.hits).toBeGreaterThanOrEqual(MISCONCEPTION_RULE.minHitsPerStudent)
      expect(s.hits / s.exposures).toBeGreaterThanOrEqual(MISCONCEPTION_RULE.minHitShare)
    }
  })
  it('position_bias: חלק הבחירה הראשונה = ספירה/פריטים', () => {
    for (const sa of A.ss.values()) for (const f of sa.findings) {
      if (f.status === 'reported' && f.evidence.kind === 'position_bias') {
        expect(f.evidence.observedShare).toBeCloseTo(f.evidence.firstChoices / f.evidence.items, 2)
        expect(f.n).toBe(f.evidence.items)
      }
    }
  })
  it('התאריכים והתוויות מחושבים מהיום (מחצית ב׳ = פברואר 2026)', () => {
    const f = A.classFindings.get('c-v2')!.map((x) => x.finding).find((x) => x.status === 'reported')!
    expect(f.text).toContain(termLabel('half_b'))
    expect(f.text).toContain(monthYear(latestTermStart('half_b', NOW).toISOString()))
    expect(termOf('2026-10-19T00:00:00Z')).toBe('half_a')
  })
})

describe('התרחישים (סעיף 2) — כל אחד מנתונים', () => {
  const rep = (cast: string, kind: string, sub?: string): Finding | undefined =>
    A.world.students.find((s) => s.cast === cast)!.subjects.flatMap((s) => A.ss.get(skey(studentIdByCast(cast), s))!.findings)
      .find((f) => f.kind === kind && f.status === 'reported' && (!sub || f.subjectCode === sub))
  it('אלון: ירידה בהיסטוריה בלבד, בלי התרעה חוצת-מקצועות', () => {
    const f = rep('alon', 'level_trend', 'history')
    expect(f?.status === 'reported' && f.evidence.kind === 'level_trend' && f.evidence.direction).toBe('down')
    expect(A.crossSubject.has(studentIdByCast('alon'))).toBe(false)
    const others = A.world.students.find((s) => s.cast === 'alon')!.subjects.filter((s) => s !== 'history')
    for (const s of others) expect(A.ss.get(skey(studentIdByCast('alon'), s))!.findings.filter((x) => x.kind === 'level_trend' && x.status === 'reported')).toHaveLength(0)
  })
  it('אלון: עלייה רציפה לפני הירידה (סדרת הרמה)', () => {
    const series = A.ss.get(skey(studentIdByCast('alon'), 'history'))!.levelSeries
    const peak = Math.max(...series.map((p) => p.level))
    expect(peak - series[0].level).toBeGreaterThan(1.2)
    expect(series[series.length - 1].level).toBeLessThan(peak - 1)
  })
  it('כיתה ו׳2: שיפור ממוצע ≈ 2.4 רמות בהבנה מורפולוגית מאז תחילת מחצית ב׳', () => {
    const f = A.classFindings.get('c-v2')!.map((x) => x.finding).find((x) => x.status === 'reported' && x.evidence.kind === 'class_concept_improvement')!
    expect(f.status === 'reported' && f.evidence.kind === 'class_concept_improvement' && f.evidence.meanDelta).toBeCloseTo(2.4, 1)
    expect(f.n).toBeGreaterThanOrEqual(15)
    /* כיתות אחרות אינן מדווחות שיפור כזה */
    for (const cid of ['c-d1', 'c-d2', 'c-v1']) expect((A.classFindings.get(cid) ?? []).filter((x) => x.finding.status === 'reported')).toHaveLength(0)
  })
  it('יובל: דפוס זיכרון תואם אקראי; יהב ורועי: אין מספיק נתונים (מעט משחקים)', () => {
    const f = rep('yuval', 'memory_random_pattern', 'science')
    expect(f?.status === 'reported' && f.evidence.kind === 'memory_random_pattern' && f.evidence.randomLikelihood).toBeGreaterThan(0.9)
    for (const cast of ['yahav', 'roi']) {
      const st = A.world.students.find((s) => s.cast === cast)!
      const found = A.ss.get(skey(st.id, 'science'))!.findings.find((x) => x.kind === 'memory_random_pattern')
      expect(found?.status).toBe('insufficient')
    }
  })
  it('דניאל: הטיית מיקום (N מספיק); ליאור: גבולי ולכן לא מדווח; רועי: N קטן', () => {
    const d = rep('daniel', 'position_bias', 'math')
    expect(d?.n).toBeGreaterThanOrEqual(KIND_THRESHOLDS.position_bias.minN)
    expect(rep('lior', 'position_bias', 'math')).toBeUndefined()
    const lior = A.ss.get(skey(studentIdByCast('lior'), 'math'))!.findings.find((x) => x.kind === 'position_bias')
    expect(lior?.status === 'insufficient' && lior.reason).toBe('not_significant')
    const roi = A.ss.get(skey(studentIdByCast('roi'), 'math'))!.findings.find((x) => x.kind === 'position_bias')
    expect(roi?.status === 'insufficient' && roi.reason).toBe('n_below_min')
  })
  it('איתי: דילוג קריאה בשני מקצועות (לא במקצוע שלישי)', () => {
    expect(rep('itay', 'reading_skip', 'history')).toBeDefined()
    expect(rep('itay', 'reading_skip', 'science')).toBeDefined()
    expect(rep('itay', 'reading_skip', 'math')).toBeUndefined()
  })
  it('תמר: ירידה מקבילה בשלושה מקצועות → התרעה מוקדמת למחנך', () => {
    const f = A.crossSubject.get(studentIdByCast('tamar'))![0]
    expect(f.status === 'reported' && f.evidence.kind === 'cross_subject_dip' && f.evidence.subjects.length).toBeGreaterThanOrEqual(2)
  })
  it('מאיה ודנה: אירוע חיובי (עלייה)', () => {
    for (const [cast, sub] of [['maya', 'math'], ['dana', 'english']] as const) {
      const f = rep(cast, 'level_trend', sub)
      expect(f?.tone).toBe('positive')
    }
  })
  it('נועה: גבוהה מהנורמה באנגלית ונמוכה במתמטיקה — זה לצד זה אצל המחנך', async () => {
    const o = (await demoProvider.student(homeroom, studentIdByCast('noa'))).data
    const pos = new Map(o.panels.filter((p) => p.access === 'visible').map((p) => [p.subject.code, p.positionVsNorm]))
    expect(pos.get('english')).toBe('above')
    expect(pos.get('math')).toBe('below')
    expect(o.caveats.crossSubject.length).toBeGreaterThan(10)
  })
  it('תפיסה ½+⅓→⅖: המורה רואה מי וכמה פריטים; יש קישור לשיעור קיים', async () => {
    const v = teacher('math')
    const view = (await demoProvider.classSubject(v, 'c-v1', 'math')).data
    const row = view.misconceptions.find((m) => m.id === 'mc-frac-add-straight')!
    expect(row.students.length).toBe(row.studentsShowing)
    expect(row.students.every((s) => s.exposures >= 3 && s.hits >= 2)).toBe(true)
    expect(row.linkedQuest?.title).toBeTruthy()
    expect(row.curriculumGoal?.mappingStatus).toBe('sample')
    expect(view.recommendations.length).toBeGreaterThanOrEqual(1)
    expect(view.recommendations.length).toBeLessThanOrEqual(3)
  })
})

describe('הרשאות בבורר העדשה', () => {
  it('מנהל: אין שם/מזהה תלמיד באף תגובה, אין נתוני תלמיד, אין מידע על מורים', async () => {
    const payloads = [
      JSON.stringify(await demoProvider.admin(admin)),
      JSON.stringify(await demoProvider.roster(admin)),
      JSON.stringify(await demoProvider.entry(admin)),
      JSON.stringify(await demoProvider.config(admin)),
    ].join('\n')
    for (const st of A.world.students) {
      expect(payloads.includes(st.displayName), st.displayName).toBe(false)
      expect(payloads.includes(st.id), st.id).toBe(false)
    }
    expect((await demoProvider.roster(admin)).data.students).toEqual([])
    await expect(demoProvider.student(admin, studentIdByCast('alon'))).rejects.toMatchObject({ status: 403 })
    await expect(demoProvider.feedback(admin, studentIdByCast('alon'))).rejects.toMatchObject({ status: 403 })
    await expect(demoProvider.briefing(admin, 'student', studentIdByCast('alon'))).rejects.toMatchObject({ status: 403 })
    await expect(demoProvider.classSubject(admin, 'c-v2', 'math')).rejects.toMatchObject({ status: 403 })
    await expect(demoProvider.classOverview(admin, 'c-v2')).rejects.toMatchObject({ status: 403 })
    const noTeacherInfo = JSON.stringify([await demoProvider.admin(admin), await demoProvider.roster(admin), await demoProvider.entry(admin)])
    expect(noTeacherInfo).not.toMatch(/teacher|מורה/i)
  })
  it('מנהל: תא עם פחות מ-5 תלמידים מוסתר (ערבית בשכבה ו׳) ואינו חושף כמות', async () => {
    const a = (await demoProvider.admin(admin)).data
    const hidden = a.cells.find((c) => c.status === 'hidden' && c.subject.code === 'arabic')!
    expect(hidden).toBeDefined()
    expect(Object.keys(hidden)).not.toContain('studentCount')
    expect(a.hiddenCells).toBeGreaterThanOrEqual(1)
    for (const c of a.cells) if (c.status === 'shown') expect(c.studentCount).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
    for (const p of a.progress) for (const pt of p.series) expect(pt.n).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
    for (const m of a.misconceptions) expect(m.studentsExposed).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
    /* מנהל לא רואה התרעות מוקדמות ברמת תלמיד */
    expect(JSON.stringify(a)).not.toMatch(/cross_subject|earlyWarning/)
  })
  it('מורה מקצועי (חשבון): אין נתונים ממקצוע אחר — מקצועות אחרים אפורים בלבד', async () => {
    const v = teacher('math')
    const sid = studentIdByCast('noa')
    const o = (await demoProvider.student(v, sid)).data
    expect(o.access).toBe('subject_only')
    expect(o.crossSubject).toEqual([])
    for (const p of o.panels) {
      if (p.subject.code === 'math') expect(p.access).toBe('visible')
      else { expect(p.access).toBe('greyed'); expect(Object.keys(p).sort()).toEqual(['access', 'subject']) }
    }
    /* לא דולפים ממצאי/רמות מקצועות אחרים בשום מקום בתגובה (נועה גבוהה באנגלית — הרמה לא מופיעה) */
    const engLevel = A.ss.get(skey(sid, 'english'))!.currentLevel
    const json = JSON.stringify(o)
    expect(json.includes(`"currentLevel":${engLevel}`)).toBe(false)
    const fb = (await demoProvider.feedback(v, sid)).data
    expect(fb.items.every((i) => i.subject.code === 'math')).toBe(true)
    const br = (await demoProvider.briefing(v, 'student', sid)).data
    expect(br.sections.flatMap((s) => s.items).every((i) => i.subjectCode === null || i.subjectCode === 'math')).toBe(true)
    const roster = (await demoProvider.roster(v)).data
    expect(roster.students.every((s) => s.earlyWarning === false)).toBe(true)
  })
  it('מורה מקצועי: אין גישה לנתוני כיתה במקצוע אחר או בכיתה שאינו מלמד', async () => {
    const v = teacher('history') /* היסטוריה — רק שכבה ו׳ */
    await expect(demoProvider.classSubject(v, 'c-v2', 'math')).rejects.toMatchObject({ status: 403 })
    /* כיתה שאינו מלמד — מחוץ להיקף: 404 אחיד (כמו כיתה שאינה קיימת), ולא 403 שחושף קיום */
    await expect(demoProvider.classSubject(v, 'c-d1', 'history')).rejects.toMatchObject({ status: 404 })
    await expect(demoProvider.student(v, A.classById.get('c-d1')!.studentIds[0])).rejects.toMatchObject({ status: 404 })
    const ok = (await demoProvider.classSubject(v, 'c-v2', 'history')).data
    expect(ok.studentFindings.every((f) => f.finding.subjectCode === 'history')).toBe(true)
    expect(ok.otherSubjects.every((s) => s.code !== 'history')).toBe(true)
  })
  it('מחנך: רואה את כל המקצועות + התרעות חוצות-מקצועות, אך לא תלמידי כיתה אחרת', async () => {
    const o = (await demoProvider.student(homeroom, studentIdByCast('tamar'))).data
    expect(o.access).toBe('full')
    expect(o.panels.every((p) => p.access === 'visible')).toBe(true)
    expect(o.crossSubject).toHaveLength(1)
    await expect(demoProvider.student(homeroom, A.classById.get('c-v1')!.studentIds[0])).rejects.toMatchObject({ status: 404 })
  })
  it('משוב לתלמיד: צמיחה בלבד — בלי השוואה לאחרים ובלי תוויות', async () => {
    for (const sid of A.classById.get(DEMO_HOMEROOM_CLASS)!.studentIds) {
      const fb = (await demoProvider.feedback(homeroom, sid)).data
      const all = [fb.headline, ...fb.items.map((i) => i.text)].join(' ')
      expect(all).not.toMatch(/מתקשה|חלש|כיתה|חברים|לעומת|יותר מ|פחות מ|ירד|ירידה|נכשל/)
    }
  })
})

describe('דטרמיניזם ויציבות לאורך ימי השנה', () => {
  const sigOf = (a: typeof A): string[] => {
    const out: string[] = []
    for (const [k, sa] of a.ss) for (const f of sa.findings) out.push(`${k}|${f.kind}|${f.status}|${f.n}|${f.pAdjusted?.toFixed(4) ?? '-'}|${f.text}`)
    for (const [c, list] of a.classFindings) for (const x of list) out.push(`${c}|${x.finding.kind}|${x.finding.status}|${x.finding.n}|${x.finding.text}`)
    return out.sort()
  }
  it('אותו יום → בדיוק אותה תוצאה (כולל הטקסטים)', () => {
    expect(sigOf(analyze(buildWorld(NOW)))).toEqual(sigOf(A))
  })
  it('מערך הממצאים המדווחים זהה בכל ימות השנה; המחצית נבחרת לפי התאריך', () => {
    const expected = (a: typeof A): string[] => {
      const ids: string[] = []
      for (const sa of a.ss.values()) for (const f of sa.findings) if (f.status === 'reported') ids.push(f.id)
      for (const list of a.classFindings.values()) for (const x of list) if (x.finding.status === 'reported') ids.push(x.finding.id)
      for (const list of a.crossSubject.values()) ids.push(list[0].id)
      return ids.sort()
    }
    const base = expected(A)
    for (const d of ['2027-01-31', '2026-03-05', '2026-09-03', '2026-06-20', '2027-04-15']) {
      const w = buildWorld(new Date(`${d}T09:00:00Z`))
      const a = analyze(w)
      expect(expected(a), d).toEqual(base)
      expect(a.misByGrade.get('6|mc-frac-add-straight')!.sharePct, d).toBe(42)
      const f = a.classFindings.get('c-v2')![0].finding
      expect(f.status === 'reported' && f.evidence.kind === 'class_concept_improvement' && f.evidence.meanDelta, d).toBeCloseTo(2.4, 1)
      /* תחילת פברואר–מרץ: מחצית ב׳ עדיין צעירה → המדידה נעשית מול תחילת מחצית א׳ */
      if (d === '2026-03-05') expect(w.term.kind).toBe('half_a')
      if (d === '2027-04-15') expect(w.term.kind).toBe('half_a')
      if (d === '2026-09-03') expect(w.term.kind).toBe('half_b')
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   W1 — הקשחת המנוע לנתוני אמת: רשתות ביטחון, נתונים דלילים, קטלוג מוזרק, בסיס בדיקה 'level' לעולם חי, לוח ימי לימוד
   ══════════════════════════════════════════════════════════════════════════ */

describe('stats: רשתות ביטחון (p לא-סופי לא נולד)', () => {
  it('Welch: df ≤ 0 (שונות 0 / n=1) → p=1, d=0 — לא NaN', () => {
    const same = welch([1, 1, 1], [1, 1, 1])
    expect([same.pTwoSided, same.d]).toEqual([1, 0])
    const step = welch([5, 5, 5], [6, 6, 6]) /* שתי קבוצות קבועות שונות: המבחן לא מוגדר */
    expect([step.pTwoSided, step.d]).toEqual([1, 0])
    expect(Number.isFinite(step.t)).toBe(true) /* t נשמר (changePoint משתמש בו) */
    const one = welch([1], [2])
    expect([one.pTwoSided, one.d]).toEqual([1, 0])
  })
  it('t זוגי: n=1 → p=1, dz=0; tUpperTail עם df ≤ 0 → 0.5', () => {
    const r = pairedT([1])
    expect([r.pTwoSided, r.dz]).toEqual([1, 0])
    expect(tUpperTail(0, 0)).toBe(0.5)
    expect(tTwoSided(1.5, 0)).toBe(1)
    expect(tUpperTail(Number.NaN, 5)).toBe(0.5)
  })
  it('הפרדה מושלמת בין קבוצות קבועות: p מדויק של בדיקת תמורות (2 מתוך C(n1+n2,n1))', () => {
    expect(perfectSeparationP(8, 8)).toBeCloseTo(2 / 12870, 8)
    expect(perfectSeparationP(1, 1)).toBe(1)
    expect(perfectSeparationP(0, 5)).toBe(1)
    expect(perfectSeparationP(20, 40)).toBeLessThan(1e-12)
  })
  it('Welch על נתונים רגילים לא השתנה (ערכים ידועים)', () => {
    const r = welch([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
    expect(r.pTwoSided).toBeLessThan(0.01)
    expect(r.d).toBeCloseTo(-3.162, 2)
  })
})

/* ── עולם מינימלי לבדיקות ── */
const SP_NOW = new Date('2026-10-19T09:00:00Z')
const SP_DAYS = buildSchoolDays(SP_NOW, DEMO_WORLD.schoolDays)
const SP_TERM = { kind: 'half_a', startIso: '2026-09-01T12:00:00.000Z', idx: 100 } as const

interface SpSession { day: number; success: number; level: number; concepts?: Record<string, number>; scenes?: number; words?: number; closedMs?: number }
const mkSession = (s: SpSession): SessionRec => ({
  day: s.day, date: SP_DAYS[s.day], success: s.success, level: s.level, concepts: s.concepts ?? {},
  scenes: s.scenes ?? 6, words: s.words ?? 200, closedMs: s.closedMs ?? 60000, retries: { afterFail: 1, giveUps: 1 },
})
/* count מפגשים מפוזרים בשווה על `over` הימים האחרונים */
const spread = (count: number, f: (day: number, i: number) => Omit<SpSession, 'day'>, over = 200): SessionRec[] =>
  Array.from({ length: count }, (_, i) => { const day = Math.floor((i / count) * over); return mkSession({ day, ...f(day, i) }) })
const memGame = (day: number, hits: number, avail = 4): MemGame => ({ day, date: SP_DAYS[day], turns: Array.from({ length: avail }, (_, i) => ({ avail: true, hit: i < hits, pRandom: 0.1 })) })

interface SpStudent { id: string; grade?: number; subjects?: SubjectCode[]; sessions?: SessionRec[]; memory?: MemGame[]; noData?: boolean }
function spWorld(students: SpStudent[], opts: { live?: boolean; term?: World['term']; days?: string[]; classes?: World['classes'] } = {}): World {
  const grades = [...new Set(students.map((s) => s.grade ?? 6))]
  const classes: World['classes'] = opts.classes ?? grades.map((g) => ({
    id: `c${g}`, name: `כיתה ${g}`, gradeLabel: 'ה׳', grade: g, studentIds: students.filter((s) => (s.grade ?? 6) === g).map((s) => s.id),
  }))
  const data = new Map<string, StudentSubjectData>()
  const ws = students.map((s) => {
    const subjects = s.subjects ?? ['math']
    if (!s.noData) for (const sub of subjects) data.set(skey(s.id, sub), { sessions: s.sessions ?? [], mc: [], memory: s.memory ?? [] })
    return { id: s.id, firstName: 'ת', displayName: `ת${s.id}`, gender: 'male' as const, classId: `c${s.grade ?? 6}`, grade: s.grade ?? 6, subjects, cast: null }
  })
  return {
    now: SP_NOW, days: opts.days ?? SP_DAYS, term: opts.term === undefined ? SP_TERM : opts.term,
    school: { id: 'sp', name: 'בדיקה' }, classes, students: ws, data, live: opts.live,
  }
}
const findingOf = (a: ReturnType<typeof analyze>, studentId: string, kind: string, sub: SubjectCode = 'math'): Finding | undefined =>
  a.ss.get(skey(studentId, sub))!.findings.find((f) => f.kind === kind)

describe('נתונים דלילים', () => {
  it('תלמיד×מקצוע בלי רשומת נתונים: אין חריגה, רשומה ריקה (אין סשנים, אין ממצאים, וקטורים "אין מספיק נתונים")', () => {
    const w = spWorld([{ id: 'x', subjects: ['math', 'science'], noData: true }, { id: 'y', sessions: spread(20, () => ({ success: 0.7, level: 6 })) }])
    let a!: ReturnType<typeof analyze>
    expect(() => { a = analyze(w) }).not.toThrow()
    const sa = a.ss.get(skey('x', 'math'))!
    expect([sa.sessionsCount, sa.currentLevel, sa.findings.length, sa.levelSeries.length]).toEqual([0, null, 0, 0])
    expect(sa.behaviorVectors.every((v) => v.status === 'insufficient' && v.value === null)).toBe(true)
    expect(a.ss.has(skey('x', 'science'))).toBe(true)
  })

  it('תלמידי תקרה (הצלחה 100% קבועה) לצד יורד אמיתי: BH לא מזוהם בשום סדר, והיורד מדווח', () => {
    const decliner = (id: string): SessionRec[] => {
      const r = rngFor(`w1:dec:${id}`)
      return spread(70, (day) => ({ success: Math.min(0.98, Math.max(0.05, (day < 60 ? 0.35 : 0.85) + (r() - 0.5) * 0.08)), level: 9 }))
    }
    const ceiling = (): SessionRec[] => spread(70, () => ({ success: 1, level: 9 }))
    for (const order of [['d', 'c', 'c', 'c'], ['c', 'd', 'c', 'c'], ['c', 'c', 'd', 'c'], ['c', 'c', 'c', 'd']]) {
      const students: SpStudent[] = order.map((k, i) => ({ id: `s${i}`, sessions: k === 'd' ? decliner(`s${i}`) : ceiling() }))
      const a = analyze(spWorld(students))
      const f = findingOf(a, `s${order.indexOf('d')}`, 'level_trend')!
      expect(f.status, order.join()).toBe('reported')
      expect(f.status === 'reported' && f.evidence.kind === 'level_trend' && f.evidence.direction).toBe('down')
      for (const sa of a.ss.values()) for (const x of sa.findings) expect(x.pAdjusted === null || Number.isFinite(x.pAdjusted), `${order.join()} ${x.id}`).toBe(true)
      /* תלמיד התקרה עצמו: לא נבדק, לא ממצא */
      expect(findingOf(a, `s${order.indexOf('c')}`, 'level_trend')).toBeUndefined()
    }
  })

  it('בסיס קשב הזיכרון: חציון התלמידים נחתך ל-0.95 (כולם מושלמים ≠ p=0 לילד), ועם פחות מ-5 תורמים — קבוע 0.7', () => {
    const perfect = (): MemGame[] => Array.from({ length: 6 }, (_, g) => memGame(g * 20, 4))
    const weakAt = (hits: number[]): MemGame[] => hits.map((h, g) => memGame(g * 20, h))
    /* 6 תלמידים מושלמים + תלמיד שפוגע ב-13 מתוך 24 */
    const rich = analyze(spWorld([...Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, memory: perfect() })), { id: 'w', memory: weakAt([3, 2, 2, 2, 2, 2]) }]))
    const f = findingOf(rich, 'w', 'memory_random_pattern')!
    expect(f.status).toBe('reported')
    const ev = f.status === 'reported' && f.evidence.kind === 'memory_random_pattern' ? f.evidence : null
    expect(ev?.attentiveRate).toBe(MEMORY_ATTENTIVE_RATE.max)
    expect(ev!.randomLikelihood).toBeLessThan(1)
    expect(Number.isFinite(f.pAdjusted)).toBe(true)
    /* 3 תלמידים מושלמים + תלמיד שפוגע ב-8 מתוך 24: רק 4 תורמים → בסיס קבוע */
    const poor = analyze(spWorld([...Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, memory: perfect() })), { id: 'w', memory: weakAt([2, 2, 1, 1, 1, 1]) }]))
    const g = findingOf(poor, 'w', 'memory_random_pattern')!
    expect(g.status === 'reported' && g.evidence.kind === 'memory_random_pattern' && g.evidence.attentiveRate).toBe(MEMORY_ATTENTIVE_RATE.fallback)
    /* בסיס חיצוני גובר (ונחתך) */
    const injected = analyze(spWorld([...Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, memory: perfect() })), { id: 'w', memory: weakAt([2, 2, 1, 1, 1, 1]) }]), DEMO_CATALOG, { memoryAttentiveRate: 1 })
    const h = findingOf(injected, 'w', 'memory_random_pattern')!
    expect(h.status === 'reported' && h.evidence.kind === 'memory_random_pattern' && h.evidence.attentiveRate).toBe(MEMORY_ATTENTIVE_RATE.max)
  })

  it('שכבות 5 ו-7 (לא 4/6): בסיס קריאה לפי שכבות העולם; "דילוג קריאה" מזוהה; תפיסות דמו לא חלות; אין רשומות ריקות', () => {
    const readers = (grade: number, n: number, msPerWord: number): SpStudent[] => Array.from({ length: n }, (_, i) => {
      const r = rngFor(`w1:read:${grade}:${i}`)
      return { id: `g${grade}-${i}`, grade, sessions: spread(10, () => ({ success: 0.7, level: 6, words: 200, closedMs: Math.round(200 * msPerWord * (0.9 + r() * 0.2)) })) }
    })
    const students = [...readers(5, 6, 300), { ...readers(5, 1, 95)[0], id: 'g5-fast' }, ...readers(7, 6, 300)]
    const a = analyze(spWorld(students))
    for (const st of students) {
      const v = a.ss.get(skey(st.id, 'math'))!.behaviorVectors.find((b) => b.key === 'reading_attention')!
      expect(v.value, st.id).not.toBeNull()
    }
    expect(findingOf(a, 'g5-fast', 'reading_skip')?.status).toBe('reported')
    expect(findingOf(a, 'g7-0', 'reading_skip')?.status).not.toBe('reported')
    /* קטלוג הדמו חל רק על שכבות 4/6: אין 14 רשומות ריקות */
    expect(a.misByGrade.size).toBe(0)
    expect(a.misByClass.size).toBe(0)
    expect(a.ageNormOf(5).center).toBe(9)
    expect(a.ageNormOf(7).center).toBe(11)
  })

  it('תפיסה עם טווח שכבות (קטלוג חי): נספרת רק בשכבות העולם שבטווח', () => {
    const mis = (id: string, grades: { from: number; to: number } | null) => ({
      id, code: id, titleHe: 'תפיסה', descriptionHe: 'תיאור', conceptKey: 'k', subject: 'math' as const, prevalence: {}, grades, linkedQuest: null,
    })
    const catalog = createCatalog({ concepts: [], goals: [], misconceptions: [mis('m-range', { from: 5, to: 6 }), mis('m-all', null)] })
    const a = analyze(spWorld([{ id: 'a', grade: 5, sessions: [] }, { id: 'b', grade: 7, sessions: [] }]), catalog)
    expect([...a.misByGrade.keys()].sort()).toEqual(['5|m-all', '5|m-range', '7|m-all'])
    expect([...a.misByClass.keys()].sort()).toEqual(['c5|m-all', 'c5|m-range', 'c7|m-all'])
    expect(a.misByGrade.get('5|m-range')!.studentsExposed).toBe(0)
  })

  it('תא עם תורם יחיד: אין בסיס קריאה (פחות מ-5), אין "דילוג קריאה" ואין ערך קשב לקריאה', () => {
    const lone = spread(10, () => ({ success: 0.7, level: 6, words: 200, closedMs: 200 * 20 })) /* קריאה מהירה מאוד */
    const a = analyze(spWorld([{ id: 'solo', subjects: ['arabic'], sessions: lone }]))
    const sa = a.ss.get(skey('solo', 'arabic'))!
    expect(sa.behaviorVectors.find((b) => b.key === 'reading_attention')).toMatchObject({ value: null, classMedian: null, status: 'insufficient' })
    expect(sa.findings.find((f) => f.kind === 'reading_skip')).toBeUndefined()
    /* בסיס חיצוני (בית ספר) מאפשר מועמד גם לתא קטן */
    const withBase = analyze(spWorld([{ id: 'solo', subjects: ['arabic'], sessions: lone }]), DEMO_CATALOG, { readingMsPerWord: new Map([['6|arabic', 300]]) })
    expect(withBase.ss.get(skey('solo', 'arabic'))!.findings.find((f) => f.kind === 'reading_skip')).toBeDefined()
  })

  it('כיתה בלי תלמידים / בלי ימים / בלי מחצית: אין חריגה', () => {
    const empty = spWorld([], { classes: [{ id: 'c-empty', name: 'ריקה', gradeLabel: 'ה׳', grade: 5, studentIds: [] }], days: [], term: null })
    let a!: ReturnType<typeof analyze>
    expect(() => { a = analyze(empty) }).not.toThrow()
    expect(a.ss.size).toBe(0)
    expect(a.classFindings.size).toBe(0)
    expect(a.classById.get('c-empty')!.studentIds).toEqual([])
    expect(a.ageNormOf(5)).toMatchObject({ center: 9, gradeLabel: 'ה׳' })
    /* כיתה ריקה לצד כיתה עם תלמידים */
    const mixed = spWorld([{ id: 's', sessions: spread(12, () => ({ success: 0.7, level: 6 })) }], { classes: [
      { id: 'c6', name: 'כיתה 6', gradeLabel: 'ו׳', grade: 6, studentIds: ['s'] }, { id: 'c-empty', name: 'ריקה', gradeLabel: 'ה׳', grade: 5, studentIds: [] }] })
    expect(() => analyze(mixed)).not.toThrow()
  })
})

describe('עולם חי: term=null ובסיס בדיקה על הרמה', () => {
  const concept = { key: 'w1.concept', titleHe: 'מושג בדיקה', subject: 'math' as const, vector: 'factual' as const, goalId: null }
  const catalog = createCatalog({ concepts: [concept], misconceptions: [], goals: [] })
  const improvers = (): SpStudent[] => Array.from({ length: 16 }, (_, i) => {
    const r = rngFor(`w1:imp:${i}`)
    const at = (days: number[], base: number): SessionRec[] => days.map((day) => mkSession({ day, success: 0.7, level: 5, concepts: { [concept.key]: base + r() * 0.5 } }))
    return { id: `i${i}`, sessions: [...at([75, 80, 90], 4), ...at([2, 8, 15], 6.4)] }
  })
  it('שיפור כיתתי נמדד כשיש מחצית; term=null (חי, מחצית צעירה) → אין מועמד ואין ממצא', () => {
    const withTerm = analyze(spWorld(improvers()), catalog)
    const f = withTerm.classFindings.get('c6')?.find((x) => x.finding.kind === 'class_concept_improvement')?.finding
    expect(f?.status).toBe('reported')
    for (const world of [spWorld(improvers(), { term: null }), spWorld(improvers(), { term: null, live: true })]) {
      const a = analyze(world, catalog)
      expect(a.classFindings.size).toBe(0)
      expect(a.reportedKeys.size).toBe(0)
    }
  })

  /* ── מגמה אישית בעולם חי (FX1a): ההצלחה ביחס לשאר הכיתה באותה הדמיה. 8 תלמידים משלימים את אותן 24 הדמיות (q0..q23, השלמה ראשונה);
     החלון האחרון = 8 הדמיות, הקודם = 14. תלמיד/ה s0 הוא היחיד שיכול להשתנות. ── */
  interface Change { recent: number; prior: number; levelRecent: number; levelPrior: number }
  const liveClass = (change?: Change, o: { classShift?: number; students?: number; withQuestIds?: boolean; changeFor?: (s: number) => Change | undefined; skip?: (student: number, quest: number) => boolean } = {}): SpStudent[] =>
    Array.from({ length: o.students ?? 8 }, (_, s) => {
      const r = rngFor(`fx1a:cls:${s}`)
      const mine = o.changeFor ? o.changeFor(s) : s === 0 ? change : undefined
      const sessions = spread(24, (day) => {
        const recent = day < 60
        const base = mine ? (recent ? mine.recent : mine.prior) : 0.7 + (recent ? (o.classShift ?? 0) : 0) /* המשתנה/ת אינו נושא/ת את ההסטה הכיתתית */
        return { success: Math.min(1, Math.max(0, base + (r() - 0.5) * 0.1)), level: mine ? (recent ? mine.levelRecent : mine.levelPrior) : 8 }
      }).map((x, i) => (o.withQuestIds === false ? x : Object.assign(x, { questId: `q${i}` })))
        .filter((_, i) => !o.skip?.(s, i)) /* מי שמדלג על חלק מההדמיות */
      return { id: `s${s}`, sessions }
    })
  const reportedTrend = (a: ReturnType<typeof analyze>, id: string): Extract<Finding, { status: 'reported' }> | undefined => {
    const f = findingOf(a, id, 'level_trend')
    return f && f.status === 'reported' ? f : undefined
  }

  it('תלמיד/ה שהצליח/ה הרבה יותר מהכיתה בחלון האחרון: עלייה מדווחת, והמספרים מהחלונות שנבדקו; "משתפר/ת" נגזר מאותה בדיקה', () => {
    const a = analyze(spWorld(liveClass({ recent: 0.95, prior: 0.6, levelRecent: 8, levelPrior: 5 }), { live: true }))
    const f = reportedTrend(a, 's0')!
    expect(f).toBeDefined()
    if (f.evidence.kind !== 'level_trend') throw new Error('expected level_trend evidence')
    expect(f.evidence.direction).toBe('up')
    expect(f.tone).toBe('positive')
    expect([f.evidence.fromLevel, f.evidence.toLevel, f.evidence.deltaLevels, f.evidence.sessionsBefore, f.evidence.sessionsAfter]).toEqual([5, 8, 3, 14, 8])
    expect(f.evidence.successAfter).toBeGreaterThan(f.evidence.successBefore + 0.2)
    expect(f.effectSize).toBeGreaterThanOrEqual(KIND_THRESHOLDS.level_trend.minEffect)
    expect(f.pAdjusted).toBeLessThan(0.05)
    const sa = a.ss.get(skey('s0', 'math'))!
    expect(sa.liveTrend).toEqual({ tested: true, delta: 3 })
    expect(studentTrend(sa)).toBe('improving')
    expect(trendDelta(sa)).toBe(3)
    /* כל השאר נבדקו ולא נמצא שינוי: "יציב/ה", בלי הפרש */
    for (let i = 1; i < 8; i++) {
      const other = a.ss.get(skey(`s${i}`, 'math'))!
      expect(other.liveTrend).toEqual({ tested: true, delta: null })
      expect(studentTrend(other)).toBe('steady')
      expect(trendDelta(other)).toBeNull()
    }
    /* אין מגמה לכיתה שלמה בעולם חי */
    expect(groupTrend([...a.ss.values()])).toBe('insufficient')
  })

  it('ירידה ביחס לכיתה: מדווחת "ירידה" בטון תשומת לב, ומתויגת "בירידה"', () => {
    const a = analyze(spWorld(liveClass({ recent: 0.45, prior: 0.85, levelRecent: 6, levelPrior: 9 }), { live: true }))
    const f = reportedTrend(a, 's0')!
    expect(f).toBeDefined()
    if (f.evidence.kind !== 'level_trend') throw new Error('expected level_trend evidence')
    expect(f.evidence.direction).toBe('down')
    expect(f.tone).toBe('attention')
    expect(f.evidence.deltaLevels).toBe(-3)
    expect(f.evidence.successAfter).toBeLessThan(f.evidence.successBefore)
    expect(studentTrend(a.ss.get(skey('s0', 'math'))!)).toBe('declining')
  })

  it('רמה שקפצה בלי שההצלחה ביחס לכיתה השתנתה (למשל שיעורים קלים יותר): אין ממצא ואין תווית — "יציב/ה"', () => {
    const a = analyze(spWorld(liveClass({ recent: 0.7, prior: 0.7, levelRecent: 9, levelPrior: 5 }), { live: true }))
    expect(reportedTrend(a, 's0')).toBeUndefined()
    expect(studentTrend(a.ss.get(skey('s0', 'math'))!)).toBe('steady')
    /* ביקורת-שליטה: אותה רמה עם קפיצה בהצלחה כן מדווחת */
    expect(reportedTrend(analyze(spWorld(liveClass({ recent: 0.95, prior: 0.6, levelRecent: 9, levelPrior: 5 }), { live: true })), 's0')).toBeDefined()
  })

  it('הצלחה ביחס לכיתה השתנתה אך הרמה לא זזה (אין אישור מהרמה): לא מדווח', () => {
    const a = analyze(spWorld(liveClass({ recent: 0.95, prior: 0.6, levelRecent: 7, levelPrior: 7 }), { live: true }))
    expect(reportedTrend(a, 's0')).toBeUndefined()
  })

  it('שינוי קושי כיתתי (כל הכיתה מצליחה יותר בחלון האחרון): אין אף ממצא ואף תווית "משתפר/ת"', () => {
    for (const shift of [0.2, -0.2]) {
      const a = analyze(spWorld(liveClass(undefined, { classShift: shift }), { live: true }))
      for (const sa of a.ss.values()) {
        expect(reportedTrend(a, sa.studentId), `shift ${shift} ${sa.studentId}`).toBeUndefined()
        expect(studentTrend(sa)).toBe('steady')
      }
    }
  })

  it('הצלחה אחרי ירידה כיתתית: התלמיד/ה "השתפר/ה" ביחס לכיתה אך ההצלחה שלו/ה עצמו/ה לא עלתה — לא מדווח (אחרת הטקסט היה סותר את עצמו: 70% לעומת 70%)', () => {
    const a = analyze(spWorld(liveClass({ recent: 0.7, prior: 0.7, levelRecent: 8, levelPrior: 5 }, { classShift: -0.25 }), { live: true }))
    expect(reportedTrend(a, 's0')).toBeUndefined()
    /* ... ואותה הצלחה יחסית כשההצלחה עצמה כן עלתה כן מדווחת (ביקורת-שליטה) */
    const rose = analyze(spWorld(liveClass({ recent: 0.95, prior: 0.7, levelRecent: 8, levelPrior: 5 }, { classShift: -0.25 }), { live: true }))
    expect(reportedTrend(rose, 's0')).toBeDefined()
  })

  it('כמה תלמידים משתנים בכיוונים מנוגדים (תגובה לא אחידה לשינוי קושי): אף אחד לא חריג מול שאר הכיתה ← אין ממצא אישי', () => {
    const w = spWorld(liveClass(undefined, {
      changeFor: (s) => (s < 4 ? { recent: 0.9, prior: 0.7, levelRecent: 8, levelPrior: 5 } : { recent: 0.5, prior: 0.7, levelRecent: 5, levelPrior: 8 }),
    }), { live: true })
    const a = analyze(w)
    for (const sa of a.ss.values()) expect(reportedTrend(a, sa.studentId), sa.studentId).toBeUndefined()
    /* לעומת זאת תלמיד/ה בודד/ת שמשתנה מול כיתה יציבה — כן (ראו הבדיקה הראשונה) */
  })

  it('פחות מ-5 תלמידים עם מספיק שיעורים בכל חלון: אי אפשר להעריך מהו שינוי חריג בכיתה ← אין ממצא ו"אין עדיין מספיק נתונים" גם למי שנבדק', () => {
    /* s0..s3 משלימים/ות את כל 24 ההדמיות; s4..s7 מדלגים/ות על כל הדמיה רביעית בחלון האחרון (6 מתוך 8) ← הן עמיתים (לכל הדמיה 6 עמיתים) אבל לא נבדקים. נבדקים: 4 < 5 */
    const a = analyze(spWorld(liveClass({ recent: 0.95, prior: 0.6, levelRecent: 8, levelPrior: 5 }, { skip: (s, i) => s >= 4 && i < 8 && (i + s) % 4 === 3 }), { live: true }))
    for (const sa of a.ss.values()) {
      expect(sa.liveTrend, sa.studentId).toEqual({ tested: false, delta: null })
      expect(studentTrend(sa)).toBe('insufficient')
    }
    expect(reportedTrend(a, 's0')).toBeUndefined()
    /* ביקורת-שליטה: אם גם s4 משלים/ה הכול — חמישה נבדקים, והשינוי מדווח */
    const five = analyze(spWorld(liveClass({ recent: 0.95, prior: 0.6, levelRecent: 8, levelPrior: 5 }, { skip: (s, i) => s >= 5 && i < 8 && (i + s) % 4 === 3 }), { live: true }))
    expect(five.ss.get(skey('s4', 'math'))!.liveTrend?.tested).toBe(true)
    expect(reportedTrend(five, 's0')).toBeDefined()
  })

  it('מגמת כיתה בעולם חי אינה מוצגת גם כשכמה תלמידים מסומנים באותו כיוון', () => {
    const w = simulateClass({ mode: 'fixed', seed: 11, students: 25, changers: [0, 1, 2, 3, 4, 5].map((index) => ({ index, delta: -0.4 })) })
    const a = analyze(w)
    const flagged = [...a.ss.values()].filter((sa) => sa.liveTrend?.delta != null && sa.liveTrend.delta < 0)
    expect(flagged.length).toBeGreaterThanOrEqual(3) /* בלי זה הבדיקה לא בודקת כלום */
    expect(groupTrend([...a.ss.values()])).toBe('insufficient')
  })

  it('פחות מ-MIN_CELL_SIZE תלמידים שנבדקו, או שיעורים בלי מזהה / בלי עמיתים: אין ממצא ו"אין עדיין מספיק נתונים"', () => {
    for (const w of [
      spWorld(liveClass({ recent: 0.95, prior: 0.6, levelRecent: 8, levelPrior: 5 }, { students: 4 }), { live: true }), /* 3 עמיתים בלבד */
      spWorld(liveClass({ recent: 0.95, prior: 0.6, levelRecent: 8, levelPrior: 5 }, { withQuestIds: false }), { live: true }), /* אין מזהה הדמיה */
    ]) {
      const a = analyze(w)
      for (const sa of a.ss.values()) {
        expect(sa.liveTrend).toEqual({ tested: false, delta: null })
        expect(studentTrend(sa)).toBe('insufficient')
        expect(trendDelta(sa)).toBeNull()
      }
      expect(a.reportedKeys.size).toBe(0)
    }
  })

  it('כפילות של אותו שיעור אצל אותו תלמיד/ה בעולם חי נספרת פעם אחת (הגנה גם אם ה-assemble לא סינן)', () => {
    const base = liveClass({ recent: 0.7, prior: 0.7, levelRecent: 8, levelPrior: 8 })
    /* s0 "משנן" כל הדמיה בחלון האחרון עוד 5 פעמים, בהצלחה גבוהה ורמה עולה — לא אמור ליצור מגמה */
    const cheat = base[0].sessions!.flatMap((x) => (x.day < 60 ? [x, ...Array.from({ length: 5 }, (_, k) => ({ ...x, day: x.day, success: 1, level: 12 + k }))] : [x]))
    const a = analyze(spWorld([{ ...base[0], sessions: cheat }, ...base.slice(1)], { live: true }))
    expect(reportedTrend(a, 's0')).toBeUndefined()
  })

  it('בהדגמה (לא live) הבדיקה נשארת על ההצלחה הגולמית — לא נגעו בה', () => {
    const w = spWorld(liveClass({ recent: 0.95, prior: 0.6, levelRecent: 8, levelPrior: 5 }))
    const a = analyze(w)
    expect(a.ss.get(skey('s0', 'math'))!.liveTrend).toBeUndefined()
    expect(findingOf(a, 's0', 'level_trend')?.status).toBe('reported')
  })
  it('סף הרמות ב-config לא נמוך מרמה אחת (צעד הכיול)', () => { expect(LEVEL_TREND_BASIS.minDeltaLevels).toBeGreaterThanOrEqual(1) })
})

describe('קטלוג מוזרק', () => {
  it('ברירת מחדל = DEMO_CATALOG, והניתוח נושא אותו; derive.commonErrorsOf קורא a.catalog', () => {
    expect(A.catalog).toBe(DEMO_CATALOG)
    const w = buildWorld(NOW)
    const mine = analyze(w)
    expect(mine.catalog).toBe(DEMO_CATALOG)
    /* תלמיד מציג תפיסה בדמו → commonErrorsOf מוצא אותה; עם קטלוג ריק — לא */
    const stat = [...mine.misByClass.values()].find((s) => s.students.length > 0)!
    const sid = stat.students[0].id
    const subject = DEMO_CATALOG.misconceptions.find((m) => m.id === stat.misconceptionId)!.subject
    expect(commonErrorsOf(mine, sid, subject).length).toBeGreaterThan(0)
    const bare = analyze(w, EMPTY_CATALOG)
    expect(bare.misByClass.size).toBe(0)
    expect(bare.misByGrade.size).toBe(0)
    expect(commonErrorsOf(bare, sid, subject)).toEqual([])
    /* בלי מושגים בקטלוג: אין וקטורי תוכן ואין שיפור כיתתי; הרמות והממצאים ברמת התלמיד נשארים */
    for (const sa of bare.ss.values()) expect(sa.contentVectors).toEqual([])
    expect([...bare.classFindings.values()].flat().filter((x) => x.finding.kind === 'class_concept_improvement')).toEqual([])
    expect([...bare.ss.values()].flatMap((sa) => sa.findings).filter((f) => f.status === 'reported').length).toBeGreaterThan(5)
  })
  it('misconceptionAppliesTo: דמו לפי prevalence; חי לפי grades (null = הכול)', () => {
    const m = DEMO_CATALOG.misconceptions.find((x) => x.id === 'mc-frac-add-straight')!
    expect([4, 5, 6].map((g) => DEMO_CATALOG.misconceptionAppliesTo(m, g))).toEqual([false, false, true])
    const live = { ...m, prevalence: {}, grades: { from: 5, to: 7 } }
    expect([4, 5, 7, 8].map((g) => DEMO_CATALOG.misconceptionAppliesTo(live, g))).toEqual([false, true, true, false])
    expect(DEMO_CATALOG.misconceptionAppliesTo({ ...live, grades: null }, 12)).toBe(true)
  })
  it('createCatalog: חיפושים לפי מפתח / מקצוע / יעד, ויעדי הדמו מסומנים "מיפוי לדוגמה"', () => {
    expect(DEMO_CATALOG.conceptByKey('math.place_value')?.subject).toBe('math')
    expect(DEMO_CATALOG.conceptByKey('nope')).toBeUndefined()
    expect(DEMO_CATALOG.conceptsOfSubject('history').every((c) => c.subject === 'history')).toBe(true)
    expect(DEMO_CATALOG.goalById(null)).toBeNull()
    expect(DEMO_CATALOG.goals.length).toBeGreaterThan(5)
    expect(DEMO_CATALOG.goals.every((g) => g.mappingStatus === 'sample')).toBe(true)
    expect(EMPTY_CATALOG.concepts).toEqual([])
  })
})

describe('schoolCalendar: ימי לימוד', () => {
  /* המימוש המקורי מ-demoWorld (לפני ההעברה) — העתק מילולי, מסמן את ה"אותה תוצאה בדיוק" */
  const legacyBuildSchoolDays = (now: Date, count: number): string[] => {
    const out: string[] = []
    let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12)
    while (out.length < count) {
      const d = new Date(t)
      const dow = d.getUTCDay()
      const month = d.getUTCMonth()
      if (dow <= 4 && month !== 6 && month !== 7) out.push(d.toISOString())
      t -= 86400000
    }
    return out
  }
  it('buildSchoolDays זהה למימוש המקורי בכל ימות השנה, ו-buildWorld משתמש בו', () => {
    for (const d of ['2026-10-19T09:00:00Z', '2027-01-31T09:00:00Z', '2026-03-05T09:00:00Z', '2026-07-15T09:00:00Z', '2026-12-31T23:30:00Z', '2028-02-29T00:00:00Z']) {
      const now = new Date(d)
      expect(buildSchoolDays(now, DEMO_WORLD.schoolDays), d).toEqual(legacyBuildSchoolDays(now, DEMO_WORLD.schoolDays))
    }
    expect(buildWorld(SP_NOW).days).toEqual(buildSchoolDays(SP_NOW, DEMO_WORLD.schoolDays))
  })
  it('המבנה: אתמול ראשון, בלי שישי/שבת, בלי יולי–אוגוסט; endOffsetDays=0 מתחיל מהיום', () => {
    expect(SP_DAYS.slice(0, 4)).toEqual(['2026-10-18T12:00:00.000Z', '2026-10-15T12:00:00.000Z', '2026-10-14T12:00:00.000Z', '2026-10-13T12:00:00.000Z'])
    for (const d of SP_DAYS) { const x = new Date(d); expect(x.getUTCDay()).toBeLessThanOrEqual(4); expect([6, 7]).not.toContain(x.getUTCMonth()) }
    expect(buildSchoolDays(SP_NOW, 3, 0)[0]).toBe('2026-10-19T12:00:00.000Z') /* יום שני */
    expect(buildSchoolDays(new Date('2026-10-16T09:00:00Z'), 2, 0)[0]).toBe('2026-10-15T12:00:00.000Z') /* היום שישי → חמישי */
  })

  it('dayIndexOf: שישי ושבת → חמישי הקודם; ראשון עצמו; היום (אחרי days[0]) → 0', () => {
    expect(dayIndexOf(SP_DAYS, '2026-10-16T10:00:00Z')).toBe(1) /* שישי */
    expect(dayIndexOf(SP_DAYS, '2026-10-17T10:00:00Z')).toBe(1) /* שבת */
    expect(dayIndexOf(SP_DAYS, '2026-10-18T08:00:00Z')).toBe(0) /* ראשון */
    expect(dayIndexOf(SP_DAYS, '2026-10-19T08:00:00Z')).toBe(0) /* היום, אחרי days[0] */
    expect(SP_DAYS[dayIndexOf(SP_DAYS, '2026-10-15T23:00:00Z')!]).toBe('2026-10-15T12:00:00.000Z') /* חמישי בערב */
  })
  it('dayIndexOf: היום הישראלי ולא UTC (לילה בישראל)', () => {
    /* שבת 22:30 UTC = ראשון 01:30 בישראל (שעון קיץ, UTC+3) → ראשון, אינדקס 0 (לפי UTC היה חמישי, אינדקס 1) */
    expect(dayIndexOf(SP_DAYS, '2026-10-17T22:30:00Z')).toBe(0)
    /* רביעי 21:30 UTC = חמישי 00:30 בישראל → חמישי 15.10 (אינדקס 1), לא רביעי (אינדקס 2) */
    expect(dayIndexOf(SP_DAYS, '2026-10-14T21:30:00Z')).toBe(1)
    /* חמישי 21:30 UTC = שישי 00:30 בישראל → עדיין חמישי (floor) */
    expect(dayIndexOf(SP_DAYS, '2026-10-15T21:30:00Z')).toBe(1)
    /* בחורף (UTC+2): ראשון 22:30 UTC = שני 00:30 בישראל — יום לימוד שני */
    const winter = buildSchoolDays(new Date('2027-01-27T09:00:00Z'), 60)
    const idx = dayIndexOf(winter, '2027-01-24T22:30:00Z')! /* ראשון 24.1 22:30Z = שני 25.1 00:30 */
    expect(winter[idx]).toBe('2027-01-25T12:00:00.000Z')
  })
  it('dayIndexOf: קיץ → סוף יוני; מחוץ לאופק / לא תקין / ריק → null', () => {
    const days = buildSchoolDays(new Date('2026-09-10T09:00:00Z'), DEMO_WORLD.schoolDays)
    for (const iso of ['2026-07-15T10:00:00Z', '2026-08-31T10:00:00Z', '2026-07-01T00:00:00Z']) expect(days[dayIndexOf(days, iso)!], iso).toBe('2026-06-30T12:00:00.000Z')
    expect(dayIndexOf(SP_DAYS, '2020-01-01T00:00:00Z')).toBeNull()
    expect(dayIndexOf(SP_DAYS, 'לא תאריך')).toBeNull()
    expect(dayIndexOf([], '2026-10-15T10:00:00Z')).toBeNull()
  })
  it('dayIndexOf: תכונה — יום הלימוד שנבחר ≤ היום הישראלי, והבא אחריו (החדש יותר) מאוחר ממנו', () => {
    const r = rngFor('w1:dayindex')
    for (let i = 0; i < 400; i++) {
      const ms = Date.parse('2025-11-01T00:00:00Z') + Math.floor(r() * (Date.parse('2026-10-19T00:00:00Z') - Date.parse('2025-11-01T00:00:00Z')))
      const iso = new Date(ms).toISOString()
      const idx = dayIndexOf(SP_DAYS, iso)
      if (idx === null) continue
      const key = israelDayKey(iso)!
      expect(SP_DAYS[idx].slice(0, 10) <= key, iso).toBe(true)
      if (idx > 0) expect(SP_DAYS[idx - 1].slice(0, 10) > key, iso).toBe(true)
    }
  })
  it('israelMonthKey: חודש לפי היום הישראלי', () => {
    expect(israelMonthKey('2026-09-30T22:30:00Z')).toBe('2026-10') /* 01:30 בישראל ב-1 באוקטובר */
    expect(israelMonthKey('2026-10-18T12:00:00.000Z')).toBe('2026-10')
    expect(israelMonthKey('2026-12-31T23:30:00Z')).toBe('2027-01')
  })

  it('liveTerm: null כשחלפו פחות מ-60 ימי לימוד במחצית (אוקטובר), בניגוד ל-pickTerm של ההדגמה', () => {
    expect(TERM_MIN_SCHOOL_DAYS).toBe(60)
    expect(liveTerm(SP_NOW, SP_DAYS)).toBeNull()
    expect(buildWorld(SP_NOW).term.kind).toBe('half_b') /* ההדגמה נסוגה למחצית ב׳ הקודמת — נעול בטסטים, לא משתנה */
    expect(liveTerm(new Date('2027-02-20T09:00:00Z'), buildSchoolDays(new Date('2027-02-20T09:00:00Z'), 260))).toBeNull()
  })
  it('liveTerm: אחרי 60 ימי לימוד — המחצית הנוכחית, ו-idx הוא יום הלימוד הראשון שלה', () => {
    for (const [d, kind, startIso] of [
      ['2027-01-25T09:00:00Z', 'half_a', '2026-09-01T12:00:00.000Z'],
      ['2027-05-20T09:00:00Z', 'half_b', '2027-02-01T12:00:00.000Z'],
      ['2026-07-20T09:00:00Z', 'half_b', '2026-02-01T12:00:00.000Z'], /* קיץ: המחצית שהסתיימה */
    ] as const) {
      const now = new Date(d)
      const days = buildSchoolDays(now, DEMO_WORLD.schoolDays)
      const t = liveTerm(now, days)!
      expect([t.kind, t.startIso], d).toEqual([kind, startIso])
      expect(Date.parse(days[t.idx]), d).toBeGreaterThanOrEqual(Date.parse(startIso))
      expect(Date.parse(days[t.idx + 1]), d).toBeLessThan(Date.parse(startIso))
      expect(t.idx + 1).toBeGreaterThanOrEqual(TERM_MIN_SCHOOL_DAYS)
    }
  })
  it('liveTerm: אופק ימים שלא מגיע לתחילת המחצית, או ללא ימים → null (לא מתייגים תאריך שגוי)', () => {
    const now = new Date('2027-01-25T09:00:00Z')
    expect(liveTerm(now, buildSchoolDays(now, 50))).toBeNull()
    expect(liveTerm(now, [])).toBeNull()
  })
})
