/* ──────────────────────────────────────────────────────────────────────────
   liveTrend — מגמה אישית בעולם חי חייבת להחזיק משטרי-אפס (FX1a): כשלא השתנה דבר אצל אף תלמיד/ה, כמעט אין ממצא שווא ואין תווית "משתפר/ת" / "בירידה".
   · סימולציה דטרמיניסטית (liveTrendSim): כיתה של 25 עם לוח הדמיות משותף, seeds קבועים, מאות כיתות לכל משטר.
   · ביקורת-שליטה: הכלל הקודם (Welch על הרמה) נכשל באותן סימולציות בקצב של עשרות אחוזים — כלומר הסימולציה אכן רגישה.
   · עוצמה: שינוי אמיתי גדול אצל תלמיד/ה אחד/ת בכיתה מזוהה בכיוון הנכון, ולעולם לא בכיוון ההפוך.
   · ריפליי: 24 השלמות של אותה הדמיה אינן מגמה.
   ────────────────────────────────────────────────────────────────────────── */
import { describe, expect, it } from 'vitest'
import { KIND_THRESHOLDS, LIVE_TREND_RULE, MIN_CELL_SIZE } from '../../../../src/shared/lib/analyticsConfig.js'
import { EMPTY_CATALOG } from './catalog.js'
import { studentTrend } from './derive.js'
import { analyze } from './engine.js'
import { outcomeOf, rawFromWorld, rng, runRegime, simulateClass, SIM_NOW, type SimOpts } from './liveTrendSim.js'
import { analyzeRaw } from './realWorld/analyzeRaw.js'
import { benjaminiHochberg, mean, welch } from './stats.js'
import { skey, type MemGame, type McItem, type SessionRec, type World } from './demoWorld.js'
import { buildSchoolDays } from './schoolCalendar.js'
import { emptyClassRaw } from './realWorld/testkit.js'

const CLASSES = 200
const SEED = 7000

/* משטרי האפס. כל אחד: אין שינוי אמיתי ביכולת של אף תלמיד/ה. maxClassesPct = תקרת שיעור הכיתות עם ממצא שווא אחד לפחות */
const NULL_REGIMES: { name: string; opts: Omit<SimOpts, 'seed'> }[] = [
  { name: 'א. תוכן בקושי קבוע (הרמה נודדת עם הכיול)', opts: { mode: 'fixed' } },
  { name: 'א. תוכן בקושי קבוע, שימוש תכוף (שיעור כל 3 ימי לימוד)', opts: { mode: 'fixed', every: 3 } },
  { name: 'ב. כיול אדפטיבי מלא (התוכן מותאם לרמה)', opts: { mode: 'adaptive' } },
  { name: 'ג. הסטת קושי כיתתית, קלה יותר בחלון האחרון (לפי הקצאה)', opts: { mode: 'fixed', classShift: 0.15 } },
  { name: 'ג. הסטת קושי כיתתית, קשה יותר בחלון האחרון (לפי הקצאה)', opts: { mode: 'fixed', classShift: -0.15 } },
  { name: 'ג. הסטת קושי לפי יום ההשלמה (גם שיעור שחוצה את גבול החלון)', opts: { mode: 'fixed', classShift: 0.15, shiftBy: 'session' } },
  { name: 'ג. הסטת קושי כיתתית בכיול אדפטיבי', opts: { mode: 'adaptive', classShift: -0.15 } },
  { name: 'ד. חוזקות ידע ספציפיות לשיעור (אינטראקציה תלמיד×שיעור)', opts: { mode: 'fixed', interactionSd: 0.15 } },
  { name: 'ה. תלמידי תקרה ורצפה + הסטת קושי', opts: { mode: 'fixed', baseRange: [0.2, 0.97], classShift: 0.15 } },
  { name: 'ו. משחקים שנזנחו באמצע (זנבות כבדים) + הסטת קושי', opts: { mode: 'fixed', abandon: 0.08, classShift: 0.15 } },
]

describe('משטרי אפס: אין שינוי אמיתי ← כמעט אין ממצאי שווא ואין תוויות', () => {
  for (const r of NULL_REGIMES) {
    it(r.name, () => {
      const s = runRegime(r.opts, CLASSES, SEED)
      /* FWER ברמת הכיתה ≤ 5%; התלמידים המסומנים ≤ 1% (נמדד: 0 עד 0.3%); תוויות "משתפר/ת" ו"בירידה" בדיוק כמו הממצאים */
      expect(s.classesWithAnyFlagPct, JSON.stringify(s)).toBeLessThanOrEqual(5)
      expect(s.flaggedPct, JSON.stringify(s)).toBeLessThanOrEqual(1)
      expect(s.labelNonSteadyPct, JSON.stringify(s)).toBeLessThanOrEqual(1)
      expect(s.labelNonSteadyPct).toBe(s.flaggedPct)
      /* הבדיקה אכן רצה על כמעט כולם (לא "אין ממצא" כי לא נבדק) */
      expect(s.tested).toBeGreaterThan(0.95 * s.students)
    }, 60_000)
  }

  it('כל תלמיד/ה משחק/ת שיעורים משלו/ה (אין שיעורים משותפים): לא נבדק, אין ממצא, "אין עדיין מספיק נתונים"', () => {
    const w = simulateClass({ mode: 'fixed', seed: 1, solo: true, classShift: 0.3 })
    const a = analyze(w)
    const o = outcomeOf(a)
    expect([o.tested, o.flagged, o.labelUp, o.labelDown]).toEqual([0, 0, 0, 0])
    for (const sa of a.ss.values()) expect(studentTrend(sa)).toBe('insufficient')
  })
})

/* ── ביקורת-שליטה: הכלל הקודם (Welch על רמות הסשנים + BH + הפרש של רמה אחת), על אותן סימולציות ── */
function legacyFlaggedStudents(opts: Omit<SimOpts, 'seed'>, classes: number): { students: number; flagged: number; classesAny: number } {
  let students = 0, flagged = 0, classesAny = 0
  for (let i = 0; i < classes; i++) {
    const w = simulateClass({ ...opts, seed: SEED + i })
    const cand: { p: number; delta: number }[] = []
    for (const st of w.students) {
      students++
      const ss = w.data.get(skey(st.id, 'math'))!.sessions
      const recent = ss.filter((s) => s.day < 60).map((s) => s.level)
      const prior = ss.filter((s) => s.day >= 60 && s.day < 180).map((s) => s.level)
      if (recent.length < 8 || prior.length < 8) continue
      cand.push({ p: welch(recent, prior).pTwoSided, delta: mean(recent) - mean(prior) })
    }
    const adj = benjaminiHochberg(cand.map((c) => c.p))
    const n = cand.filter((c, k) => adj[k] < 0.05 && Math.abs(c.delta) >= 1).length
    flagged += n
    if (n > 0) classesAny++
  }
  return { students, flagged, classesAny }
}
describe('ביקורת-שליטה: הכלל הקודם (בדיקה על הרמה) היה יוצר ממצאי שווא רבים באותן סימולציות', () => {
  it('תוכן בקושי קבוע: עשרות אחוזים מהתלמידים; כיול אדפטיבי: כיתות רבות עם ממצא שווא', () => {
    const fixed = legacyFlaggedStudents({ mode: 'fixed' }, 60)
    expect(100 * fixed.flagged / fixed.students).toBeGreaterThan(15)
    expect(fixed.classesAny).toBeGreaterThan(0.9 * 60)
    const adaptive = legacyFlaggedStudents({ mode: 'adaptive' }, 60)
    expect(adaptive.classesAny).toBeGreaterThan(0.2 * 60)
    /* והכלל החדש על אותן 60 כיתות: כמעט כלום */
    expect(runRegime({ mode: 'fixed' }, 60, SEED).classesWithAnyFlagPct).toBeLessThanOrEqual(5)
    expect(runRegime({ mode: 'adaptive' }, 60, SEED).classesWithAnyFlagPct).toBeLessThanOrEqual(5)
  }, 60_000)
})

describe('עוצמה: שינוי אמיתי גדול אצל תלמיד/ה אחד/ת בכיתה מזוהה בכיוון הנכון ולעולם לא בכיוון ההפוך', () => {
  const detect = (delta: number, extra: Partial<SimOpts> = {}): { hit: number; wrong: number; labelHit: number } => {
    let hit = 0, wrong = 0, labelHit = 0
    for (let i = 0; i < 80; i++) {
      const a = analyze(simulateClass({ mode: 'fixed', seed: 9000 + i, changers: [{ index: 0, delta }], ...extra }))
      const sa = a.ss.get(skey('s0', 'math'))!
      const f = sa.findings.find((x) => x.kind === 'level_trend' && x.status === 'reported')
      if (f && f.status === 'reported' && f.evidence.kind === 'level_trend') {
        if ((delta > 0) === (f.evidence.direction === 'up')) hit++; else wrong++
      }
      const t = studentTrend(sa)
      if ((delta > 0 && t === 'improving') || (delta < 0 && t === 'declining')) labelHit++
    }
    return { hit, wrong, labelHit }
  }
  it('ירידה של 30 נקודות אחוז בהצלחה: מזוהה ברוב המקרים; עלייה של 30: לפחות בכל שני מקרים; אפס כיוון הפוך; התווית זהה לממצא', () => {
    const down = detect(-0.3)
    const up = detect(0.3)
    expect(down.hit).toBeGreaterThanOrEqual(40) /* נמדד ~65% */
    expect(up.hit).toBeGreaterThanOrEqual(30) /* נמדד ~55% (חסם תקרה על 97%) */
    expect(down.wrong + up.wrong).toBe(0)
    expect(down.labelHit).toBe(down.hit)
    expect(up.labelHit).toBe(up.hit)
  }, 60_000)

  it('שינוי קטן (10 נקודות אחוז) כמעט לא מדווח: זהירות מכוונת', () => {
    expect(detect(0.1).hit).toBeLessThanOrEqual(5)
    expect(detect(-0.1).hit).toBeLessThanOrEqual(5)
  }, 60_000)

  it('כיול אדפטיבי מלא: שינוי ביכולת נראה רק ברמה, והבדיקה היחסית אינה ממציאה אותו (מגבלה ידועה, מתועדת)', () => {
    const a = analyze(simulateClass({ mode: 'adaptive', seed: 4, changers: [{ index: 0, delta: 4 }] }))
    expect(outcomeOf(a).flagged).toBe(0)
  })

  it('הראיות של ממצא מדווח עקביות: כיוון, חלונות שנבדקו, הצלחה והרמה באותו כיוון, ספי N והפרש', () => {
    let checked = 0
    for (let i = 0; i < 60; i++) {
      const a = analyze(simulateClass({ mode: 'fixed', seed: 9000 + i, changers: [{ index: 0, delta: i % 2 ? 0.3 : -0.3 }] }))
      for (const sa of a.ss.values()) for (const f of sa.findings) {
        if (f.kind !== 'level_trend' || f.status !== 'reported' || f.evidence.kind !== 'level_trend') continue
        const e = f.evidence
        const sign = e.direction === 'up' ? 1 : -1
        expect(sign * e.deltaLevels).toBeGreaterThanOrEqual(1 - 0.05)
        expect(sign * (e.successAfter - e.successBefore)).toBeGreaterThanOrEqual(LIVE_TREND_RULE.minRawShift - 0.002)
        expect(e.sessionsBefore).toBeGreaterThanOrEqual(KIND_THRESHOLDS.level_trend.minN)
        expect(e.sessionsAfter).toBeGreaterThanOrEqual(KIND_THRESHOLDS.level_trend.minN)
        expect(f.n).toBe(Math.min(e.sessionsBefore, e.sessionsAfter))
        expect(f.effectSize).toBeGreaterThanOrEqual(KIND_THRESHOLDS.level_trend.minEffect)
        expect(f.pAdjusted).toBeLessThan(0.05)
        expect(Date.parse(e.changeDate)).toBeLessThanOrEqual(SIM_NOW.getTime())
        expect(e.changeDate >= f.window.start).toBe(true)
        expect(f.tone).toBe(e.direction === 'up' ? 'positive' : 'attention')
        checked++
      }
    }
    expect(checked).toBeGreaterThan(20)
  }, 60_000)
})

describe('צינור ההרכבה המלא (שורות DB ← assemble ← מנוע): שקול לעולם הישיר, וריפליי אינו מגמה', () => {
  it('אותו עולם כשורות גולמיות עם 3 השלמות חוזרות לכל השלמה: אותן תוצאות בדיוק (רק הראשון נספר)', () => {
    for (let i = 0; i < 12; i++) {
      const w = simulateClass({ mode: 'fixed', seed: 500 + i, changers: [{ index: 3, delta: i % 2 ? 0.3 : -0.3 }] })
      const direct = outcomeOf(analyze(w))
      const viaRaw = outcomeOf(analyzeRaw(rawFromWorld(w, { repeats: 3 }), SIM_NOW, EMPTY_CATALOG))
      expect({ ...viaRaw, flaggedIds: [...viaRaw.flaggedIds].sort() }).toEqual({ ...direct, flaggedIds: [...direct.flaggedIds].sort() })
    }
  })

  it('24 השלמות של אותו שיעור (הצלחה קבועה, הרמה עולה בכל חזרה): הסדרה = משחק אחד, אין ממצא, והחזרות נספרות', () => {
    const raw = emptyClassRaw('c1', { gradeLevel: 7, gradeLabel: 'ז׳1', name: 'ז׳1' })
    raw.classSubjects = ['math']
    const days = buildSchoolDays(new Date('2026-12-10T09:00:00Z'), 260, 0)
    for (let k = 0; k < 7; k++) raw.members.push({ id: `kid${k}`, name: `תלמיד ${k}`, classIds: ['c1'] })
    raw.quests = [{ id: 'Q', subject: 'math' }]
    let n = 0
    const push = (studentId: string, day: number, level: number): void => {
      const id = `s${n++}`
      raw.sessions.push({ id, studentId, questId: 'Q', completedAt: days[day] })
      raw.snapshots.push({ sessionId: id, studentId, classId: 'c1', subject: 'math', level, success: 0.85 })
    }
    for (const m of raw.members) push(m.id, 170, 8) /* ההשלמה הראשונה של כולם */
    for (let i = 0; i < 12; i++) push('kid0', 170 - 8 - i * 8, 8) /* 12 חזרות בחלון הקודם ברמה יציבה */
    for (let i = 0; i < 12; i++) push('kid0', 55 - i * 4, Math.min(12, 8 + i + 1)) /* 12 חזרות בחלון האחרון, הרמה עולה עם השינון */
    const a = analyzeRaw(raw, new Date('2026-12-10T09:00:00Z'), EMPTY_CATALOG)
    const sa = a.ss.get(skey('kid0', 'math'))!
    expect(sa.sessionsCount).toBe(1)
    expect(sa.findings.filter((f) => f.status === 'reported')).toEqual([])
    expect(a.coverage.sessionsTotal).toBe(31)
    expect(a.coverage.repeatSessions).toBe(24)
    expect(a.coverage.sessionsUsed).toBe(7)
    expect(a.reportedKeys.size).toBe(0)
  })
})

/* ── שאר הדפוסים (הטיית מיקום, זיכרון אקראי, דילוג קריאה): משטר-אפס קצר, כיתה של 25 ללא שום דפוס אמיתי ── */
describe('משטרי אפס קצרים לשאר הדפוסים', () => {
  const days = buildSchoolDays(SIM_NOW, 260, 0)
  const gauss = (r: () => number): number => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  function classOf(seed: number, fill: (r: () => number) => { sessions?: SessionRec[]; mc?: McItem[]; memory?: MemGame[] }): World {
    const students: World['students'] = []
    const data = new Map<string, { sessions: SessionRec[]; mc: McItem[]; memory: MemGame[] }>()
    for (let i = 0; i < 25; i++) {
      const id = `s${i}`
      const d = fill(rng(seed * 1000 + i))
      data.set(skey(id, 'math'), { sessions: d.sessions ?? [], mc: d.mc ?? [], memory: d.memory ?? [] })
      students.push({ id, firstName: id, displayName: id, gender: 'male', classId: 'c', grade: 6, subjects: ['math'], cast: null })
    }
    return { now: SIM_NOW, days, term: null, school: { id: 's', name: 's' }, classes: [{ id: 'c', name: 'ו׳1', gradeLabel: 'ו׳', grade: 6, studentIds: students.map((x) => x.id) }], students, data, live: true }
  }
  const rate = (kind: string, make: (seed: number) => World, classes = 100): { students: number; classesAny: number } => {
    let flagged = 0, any = 0
    for (let c = 0; c < classes; c++) {
      let hit = 0
      for (const sa of analyze(make(c + 1)).ss.values()) if (sa.findings.some((f) => f.kind === kind && f.status === 'reported')) hit++
      flagged += hit
      if (hit > 0) any++
    }
    return { students: (100 * flagged) / (classes * 25), classesAny: (100 * any) / classes }
  }

  it('הטיית מיקום: בחירה אחידה בין האפשרויות — כמעט אין ממצא (≤ 8% מהכיתות, ≤ 1% מהתלמידים)', () => {
    const r = rate('position_bias', (seed) => classOf(seed, (rnd) => ({
      mc: Array.from({ length: 60 }, (_, i) => {
        const k = 3 + Math.floor(rnd() * 3)
        return { day: i, date: days[i], k, correctPos: Math.floor(rnd() * k), selectedPos: Math.floor(rnd() * k), correct: false, conceptKey: 'x', exposure: null, tag: null }
      }),
    })))
    expect(r.classesAny).toBeLessThanOrEqual(8)
    expect(r.students).toBeLessThanOrEqual(1)
  }, 60_000)

  it('זיכרון אקראי: כל התלמידים מוצאים זוג מוכר בשיעור דומה — כמעט אין ממצא', () => {
    const r = rate('memory_random_pattern', (seed) => classOf(seed, (rnd) => {
      const q = Math.min(0.98, Math.max(0.2, 0.75 + gauss(rnd) * 0.04))
      return { memory: Array.from({ length: 8 }, (_, g) => ({ day: g * 10, date: days[g * 10], turns: Array.from({ length: 10 }, () => ({ avail: true, hit: rnd() < q, pRandom: 0.1 })) })) }
    }))
    expect(r.students).toBeLessThanOrEqual(0.5)
    expect(r.classesAny).toBeLessThanOrEqual(5)
  }, 60_000)

  it('דילוג קריאה: קצב קריאה דומה בכיתה — כמעט אין ממצא', () => {
    const r = rate('reading_skip', (seed) => classOf(seed, (rnd) => {
      const speed = Math.exp(gauss(rnd) * 0.15)
      return {
        sessions: Array.from({ length: 12 }, (_, i) => {
          const words = 100 + Math.floor(rnd() * 50)
          return { day: i * 8, date: days[i * 8], success: 0.7, level: 8, concepts: {}, scenes: 6, words, closedMs: words * 250 * speed * Math.exp(gauss(rnd) * 0.3), retries: { afterFail: 0, giveUps: 0 } }
        }),
      }
    }))
    expect(r.students).toBeLessThanOrEqual(0.5)
    expect(r.classesAny).toBeLessThanOrEqual(5)
  }, 60_000)
})

describe('תצורה', () => {
  it('ספי הכלל מתואמים עם שאר התצורה', () => {
    expect(LIVE_TREND_RULE.minPeers).toBe(MIN_CELL_SIZE)
    expect(KIND_THRESHOLDS.level_trend.minN).toBeGreaterThanOrEqual(8)
    expect(LIVE_TREND_RULE.minRelativeShift).toBeGreaterThanOrEqual(0.15)
    expect(LIVE_TREND_RULE.outlierK).toBeGreaterThanOrEqual(2)
  })
})
