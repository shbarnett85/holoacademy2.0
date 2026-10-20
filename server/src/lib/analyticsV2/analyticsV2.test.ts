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
import { benjaminiHochberg, binomialUpperTail, normalCdf, poissonBinomialUpper, tTwoSided, welch, pairedT } from './stats.js'

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
  it('תפיסה ½+⅓→⅖: המורה רואה מי וכמה פריטים; יש קישור להדמיה קיימת', async () => {
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
    await expect(demoProvider.classSubject(v, 'c-d1', 'history')).rejects.toMatchObject({ status: 403 })
    await expect(demoProvider.student(v, A.classById.get('c-d1')!.studentIds[0])).rejects.toMatchObject({ status: 403 })
    const ok = (await demoProvider.classSubject(v, 'c-v2', 'history')).data
    expect(ok.studentFindings.every((f) => f.finding.subjectCode === 'history')).toBe(true)
    expect(ok.otherSubjects.every((s) => s.code !== 'history')).toBe(true)
  })
  it('מחנך: רואה את כל המקצועות + התרעות חוצות-מקצועות, אך לא תלמידי כיתה אחרת', async () => {
    const o = (await demoProvider.student(homeroom, studentIdByCast('tamar'))).data
    expect(o.access).toBe('full')
    expect(o.panels.every((p) => p.access === 'visible')).toBe(true)
    expect(o.crossSubject).toHaveLength(1)
    await expect(demoProvider.student(homeroom, A.classById.get('c-v1')!.studentIds[0])).rejects.toMatchObject({ status: 403 })
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
