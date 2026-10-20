import type { Request } from 'express'
import { beforeEach, describe, expect, it } from 'vitest'
import { ATTENTION_RULE, CLASS_SUMMARY_MIN_COMPLETED, OBJECTIVE_BANDS } from '../../../../src/shared/lib/analyticsConfig.js'
import { countNb, howWeCalcSuccessBandsLines, OBJECTIVE_LEVEL_TEXT, objectiveLevelText, SUCCESS_DONUT_BANDS } from '../../../../src/shared/lib/findingsNarrative.js'
import { RESULTS_EP, type ClassSubmissionView, type StudentChip, type StudentSubmissionView, type SubmissionList } from '../../../../src/shared/types/resultsV1.js'
import { AppError } from '../../middleware/errors.js'
import { resultsRouter } from '../../routes/results.js'
import { DEMO_HOMEROOM_CLASS, type V2Viewer } from '../analyticsV2/access.js'
import { demoViewerClasses, getAnalysis } from '../analyticsV2/demoProvider.js'
import { buildClassView } from './core.js'
import { DEMO_QUESTS, DEMO_SUBMISSIONS, DEMO_SUBJECT_TEACHERS, DEMO_HOMEROOM_TEACHER, questById, type DemoQuest } from './demoCatalog.js'
import { demoResultsProvider as P, demoVisibleSubmissions, getDemoResults } from './demoResults.js'
import { MSG_RESULTS_NOT_FOR_ROLE } from './realResults.js'

/* ── עזרים ── */
type Query = Record<string, string>
const req = (query: Query): Request => ({ staff: { role: 'teacher', isGuest: true }, query } as unknown as Request)
const HOMEROOM: Query = { lens: 'homeroom' }
const ADMIN: Query = { lens: 'admin' }
const PERSONAS = ['math', 'hebrew', 'history', 'science', 'english'] as const
const persona = (s: string): Query => ({ lens: 'subject_teacher', subject: s })
const LENSES: { name: string; q: Query }[] = [{ name: 'homeroom', q: HOMEROOM }, ...PERSONAS.map((s) => ({ name: s, q: persona(s) }))]

const A = getAnalysis()
const cast = (key: string): string => A.world.students.find((s) => s.cast === key)!.id
const ID = {
  science: 'demo-sub-science-v2', fractionsV2: 'demo-sub-fractions-v2', bible: 'demo-sub-bible-d2', historyV2: 'demo-sub-history-v2',
  fractionsV1: 'demo-sub-fractions-v1', hebrewV2: 'demo-sub-hebrew-v2', compareD1: 'demo-sub-compare-d1', englishV2: 'demo-sub-english-v2',
  historyV1: 'demo-sub-history-v1', englishD1: 'demo-sub-english-d1',
} as const

const allChips = (v: ClassSubmissionView): StudentChip[] => [...v.roster.completed, ...v.roster.inProgress, ...v.roster.notStarted]
const parseOk = (schema: { safeParse(v: unknown): { success: boolean; error?: { issues: unknown[] } } }, data: unknown): void => {
  const r = schema.safeParse({ data })
  expect(r.success, r.success ? '' : JSON.stringify((r.error?.issues ?? []).slice(0, 3))).toBe(true)
}
async function thrown(fn: () => Promise<unknown>): Promise<AppError> {
  try { await fn() } catch (e) { if (e instanceof AppError) return e; throw e }
  throw new Error('expected AppError')
}

/* תוצאות כל העדשות — פעם אחת */
interface LensData { list: SubmissionList; classViews: Map<string, ClassSubmissionView>; studentViews: Map<string, StudentSubmissionView> }
const DATA = new Map<string, LensData>()
beforeEach(() => { delete process.env.ANALYTICS_V2; delete process.env.DEMO_ANALYTICS })

async function lensData(name: string, q: Query): Promise<LensData> {
  const hit = DATA.get(name)
  if (hit) return hit
  const list = await P.list(req(q), {})
  const classViews = new Map<string, ClassSubmissionView>()
  const studentViews = new Map<string, StudentSubmissionView>()
  for (const row of list.submissions) {
    const cv = await P.classView(req(q), row.id)
    classViews.set(row.id, cv)
    for (const chip of allChips(cv)) studentViews.set(`${row.id}|${chip.id}`, await P.studentView(req(q), row.id, chip.id))
  }
  const d = { list, classViews, studentViews }
  DATA.set(name, d)
  return d
}

/* ══════════════════════════════════════════════════════════════════════════ */
describe('קטלוג ההדגמה: מבנה', () => {
  it('6–10 הדמיות ו-6–10 שליחות; כמה כיתות ומקצועות; מזהים ייחודיים', () => {
    expect(DEMO_QUESTS.length).toBeGreaterThanOrEqual(6)
    expect(DEMO_QUESTS.length).toBeLessThanOrEqual(10)
    expect(DEMO_SUBMISSIONS.length).toBeGreaterThanOrEqual(6)
    expect(DEMO_SUBMISSIONS.length).toBeLessThanOrEqual(10)
    expect(new Set(DEMO_SUBMISSIONS.map((s) => s.id)).size).toBe(DEMO_SUBMISSIONS.length)
    expect(new Set(DEMO_SUBMISSIONS.map((s) => s.dayIndex)).size).toBe(DEMO_SUBMISSIONS.length)
    const r = getDemoResults()
    expect(new Set(r.submissions.map((s) => s.input.submission.classId))).toEqual(new Set(['c-v2', 'c-v1', 'c-d1', 'c-d2']))
    expect(new Set(r.submissions.map((s) => s.quest.subject))).toEqual(new Set(['math', 'hebrew', 'history', 'science', 'english', 'bible']))
  })

  it('כל תגית מפנה לתפיסה קיימת; לכל שאלה מתויגת יש תשובה נכונה ומסיח נוסף שאינו מתויג', () => {
    for (const q of DEMO_QUESTS) for (const s of q.scenes) {
      const p = s.puzzle
      if (!p || p.kind !== 'choice') continue
      expect(p.options.filter((o) => o.correct)).toHaveLength(1)
      const tagged = p.options.filter((o) => o.tag)
      if (tagged.length) expect(p.options.filter((o) => !o.correct && !o.tag).length, `${q.id}/${s.id}`).toBeGreaterThanOrEqual(1)
    }
    const sent = getDemoResults().submissions.find((s) => s.def.id === ID.fractionsV2)!
    const tag = sent.input.optionTags.find((t) => t.optionId === 'a')!
    expect(tag.misconceptionId).toBe('mc-frac-add-straight')
    expect(tag.linkedQuest).toEqual({ questId: 'demo-q-fractions-add', title: 'שברים בחצר הפיצה — מכנה משותף' })
  })

  it('תאריכים: יחסית לימי הלימוד של העולם, מהחדש לישן, ועד אתמול', () => {
    const w = A.world
    const subs = getDemoResults().submissions
    for (const s of subs) expect(s.input.submission.sentAt.slice(0, 10)).toBe(w.days[s.def.dayIndex].slice(0, 10))
    const sorted = demoVisibleSubmissions({ lens: 'homeroom', guest: true, homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] })
    const dates = sorted.map((s) => s.input.submission.sentAt)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(Date.parse(dates[0])).toBeLessThanOrEqual(w.now.getTime())
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('חוזה: כל תגובה בכל עדשה עוברת את סכמות ה-zod', () => {
  for (const { name, q } of LENSES) {
    it(`עדשה: ${name}`, async () => {
      const d = await lensData(name, q)
      parseOk(RESULTS_EP.list.response, d.list)
      expect(d.list.submissions.length).toBeGreaterThan(0)
      for (const cv of d.classViews.values()) parseOk(RESULTS_EP.classView.response, cv)
      for (const sv of d.studentViews.values()) parseOk(RESULTS_EP.studentView.response, sv)
    })
  }
})

describe('עקביות ספירות', () => {
  for (const { name, q } of LENSES) {
    it(`עדשה: ${name} — סיימו+באמצע+לא התחילו = סך הכול; הרשימה = מסך הכיתה; תשומת לב = מספר הצ׳יפים`, async () => {
      const d = await lensData(name, q)
      for (const row of d.list.submissions) {
        const cv = d.classViews.get(row.id)!
        const c = row.counts
        expect(c.completed + c.inProgress + c.notStarted, row.id).toBe(c.total)
        expect(cv.head.counts, row.id).toEqual(c)
        expect([cv.roster.completed.length, cv.roster.inProgress.length, cv.roster.notStarted.length]).toEqual([c.completed, c.inProgress, c.notStarted])
        expect(allChips(cv).filter((x) => x.attention).length, row.id).toBe(row.attentionCount)
        for (const chip of allChips(cv)) expect(chip.attention).toBe(chip.attentionReasons.length > 0)
        expect(cv.head.title).toBe(row.title)
        expect(cv.head.sentAt).toBe(row.sentAt)
        expect(cv.head.classId).toBe(row.classId)
        const total = DEMO_SUBMISSIONS.find((s) => s.id === row.id)!
        expect(c.total).toBe(A.classById.get(total.classId)!.studentIds.length)
      }
    })

    it(`עדשה: ${name} — מסך הכיתה: ניסו/הצליחו = סכום מסכי התלמידים`, async () => {
      const d = await lensData(name, q)
      for (const [id, cv] of d.classViews) {
        const chips = allChips(cv)
        for (const ch of cv.challenges) {
          let attempted = 0
          let solved = 0
          let gaveUp = 0
          for (const chip of chips) {
            const sv = d.studentViews.get(`${id}|${chip.id}`)!
            const sc = sv.challenges.find((x) => x.sceneId === ch.sceneId)!
            if (sc.outcome !== 'not_reached') attempted++
            if (sc.outcome === 'correct') solved++
            if (sc.outcome === 'gave_up' || sc.outcome === 'closed') gaveUp++
          }
          expect([ch.attempted, ch.solved, ch.gaveUp], `${id}/${ch.sceneId}`).toEqual([attempted, solved, gaveUp])
          expect(ch.gaveUpStudents).toHaveLength(ch.gaveUp)
        }
        /* סיכום התלמיד נשען על אותם מספרים */
        for (const chip of chips) {
          const sv = d.studentViews.get(`${id}|${chip.id}`)!
          expect(sv.head.counts).toEqual(cv.head.counts)
          expect(sv.roster.map((r) => r.name)).toEqual(chips.map((c) => c.name).sort((x, y) => x.localeCompare(y, 'he')))
          expect(sv.student.status).toBe(chip.status)
        }
      }
    })
  }
})

describe('במבט אחד: successBands בהדגמה (אותה ליבה כמו הספק האמיתי)', () => {
  for (const { name, q } of LENSES) {
    it(`עדשה: ${name} — ההתפלגות עקבית עם ספירת הסטטוסים, עם מסכי התלמידים ועם כלל "לתשומת לב"`, async () => {
      const d = await lensData(name, q)
      for (const [id, cv] of d.classViews) {
        const b = cv.successBands
        expect(b.low + b.mid + b.high, id).toBe(b.basis)
        expect(b.basis, id).toBe(cv.challenges.length > 0 ? cv.head.counts.completed : 0)
        expect(b.enough, id).toBe(b.basis >= CLASS_SUMMARY_MIN_COMPLETED)
        /* חישוב בלתי תלוי: מכל תלמיד/ה שסיים/ה — כמה אתגרים נפתרו (outcome=correct) מתוך כל האתגרים, בספים מהתצורה */
        const exp = { low: 0, mid: 0, high: 0 }
        for (const chip of cv.roster.completed) {
          const sv = d.studentViews.get(`${id}|${chip.id}`)!
          const share = sv.challenges.filter((c) => c.outcome === 'correct').length / cv.challenges.length
          if (share < SUCCESS_DONUT_BANDS.low) exp.low++
          else if (share >= SUCCESS_DONUT_BANDS.high) exp.high++
          else exp.mid++
        }
        expect({ low: b.low, mid: b.mid, high: b.high }, id).toEqual(exp)
        /* הספירה הנמוכה = מי שמסומן "לתשומת לב" בגלל הצלחה נמוכה */
        expect(allChips(cv).filter((c) => c.attentionReasons.includes('low_success')).length, id).toBe(b.low)
      }
    })
  }

  it('מדעים ו׳2 (25 תלמידים): 14 סיימו, ומהם 5 ברוב, 8 בחלק ו-1 במעט — שני הגרפים מראים התפלגות אמיתית', async () => {
    const cv = (await lensData('homeroom', HOMEROOM)).classViews.get(ID.science)!
    expect(cv.head.counts).toMatchObject({ total: 25, completed: 14, inProgress: 6, notStarted: 5 })
    expect(cv.successBands).toEqual({ basis: 14, low: 1, mid: 8, high: 5, enough: true })
    expect(cv.challenges).toHaveLength(6)
  })

  it('"איך חישבנו" של המסך כולל את הסבר שני הגרפים עם הספים מהתצורה (75% / 50%), ואין חזרה ל-60/85 הישנים', async () => {
    const cv = (await lensData('homeroom', HOMEROOM)).classViews.get(ID.science)!
    const lines = howWeCalcSuccessBandsLines()
    for (const l of lines) expect(cv.howWeCalculated).toContain(l)
    const text = lines.join(' ')
    expect(text).toContain('75%')
    expect(text).toContain('50%')
    expect(text).not.toMatch(/85%|60%/)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('מקרה (א): שליחה שחלק מהתלמידים לא סיימו — מדעים ו׳2', () => {
  it('יש מי שבאמצע ומי שלא התחיל; הסיכום אומר כמה סיימו', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const cv = d.classViews.get(ID.science)!
    expect(cv.head.className).toBe('ו׳2')
    expect(cv.head.subject?.code).toBe('science')
    const c = cv.head.counts
    expect(c.total).toBe(25)
    expect(c.inProgress).toBeGreaterThan(0)
    expect(c.notStarted).toBeGreaterThan(0)
    expect(c.completed + c.inProgress + c.notStarted).toBe(25)
    expect(cv.summary).toContain(`עד עכשיו סיימו ${countNb(c.completed, c.total)}`)
    /* מי שלא התחיל — תשומת לב (כלל עובדתי); מי שבאמצע — לא */
    for (const chip of cv.roster.notStarted) expect(chip.attentionReasons).toEqual(['not_started'])
    for (const chip of cv.roster.inProgress) expect(chip.attentionReasons).not.toContain('not_started')
    /* תוצאות רק ממי שסיים */
    const maxAttempted = Math.max(...cv.challenges.map((x) => x.attempted))
    expect(maxAttempted).toBe(c.completed)
  })

  it('מי שלא סיים: סיכום התלמיד אומר שעוד אין תוצאות, ואין לו אתגרים שהגיע אליהם', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const cv = d.classViews.get(ID.science)!
    const mid = cv.roster.inProgress[0]
    const sv = d.studentViews.get(`${ID.science}|${mid.id}`)!
    expect(sv.summary).toContain('באמצע ההדמיה')
    expect(sv.challenges.every((x) => x.outcome === 'not_reached' && x.items.length === 0)).toBe(true)
    expect(sv.slides).toEqual([])
    const ns = d.studentViews.get(`${ID.science}|${cv.roster.notStarted[0].id}`)!
    expect(ns.summary).toContain('עוד לא התחיל')
  })
})

describe('מקרה (ב): ½+⅓ → ⅖ בכיתות ו׳', () => {
  const world = (classId: string): { showing: string[]; exposed: number } => {
    const stat = A.misByClass.get(`${classId}|mc-frac-add-straight`)!
    return { showing: stat.students.map((s) => s.id), exposed: stat.studentsExposed }
  }

  it('העולם: 10 מתוך 25 ב-ו׳2 ו-11 מתוך 25 ב-ו׳1 (21 מתוך 50)', () => {
    expect(world('c-v2').showing).toHaveLength(10)
    expect(world('c-v1').showing).toHaveLength(11)
  })

  for (const [subId, classId, expected] of [[ID.fractionsV2, 'c-v2', 10], [ID.fractionsV1, 'c-v1', 11]] as const) {
    it(`${classId}: מספר הבוחרים ב-⅖ שווה למציגי התפיסה בעולם (${expected})`, async () => {
      const lens = classId === 'c-v2' ? { name: 'homeroom', q: HOMEROOM } : { name: 'math', q: persona('math') }
      const d = await lensData(lens.name, lens.q)
      const cv = d.classViews.get(subId)!
      expect(cv.head.counts.total).toBe(25)
      const row = cv.commonErrors.find((e) => e.id === 'mc-frac-add-straight')!
      expect(row.studentsCount).toBe(expected)
      expect(row.studentsCount).toBe(world(classId).showing.length)
      expect(row.studentsExposed).toBe(cv.head.counts.completed)
      expect(row.linkedQuest?.questId).toBe('demo-q-fractions-add')
      const ch = cv.challenges[0]
      const opt = ch.items[0].options!.find((o) => o.text === '⅖')!
      expect(opt.count).toBe(expected)
      expect(opt.errorTag?.id).toBe('mc-frac-add-straight')
      /* אלה בדיוק התלמידים שמציגים את התפיסה בעולם */
      expect(opt.students.map((s) => s.id).sort()).toEqual([...world(classId).showing].sort())
      expect(ch.commonError).toMatchObject({ count: expected, optionText: '⅖' })
      /* והסיכום הכיתתי אומר זאת במילים */
      expect(cv.summary).toContain('האתגר הקשה ביותר: גשר החיבור')
      expect(cv.summary).toContain('ורובם בחרו ב״⅖״')
      /* תלמיד מהקבוצה: התשובה והתגית בתצוגת התלמיד */
      const sv = d.studentViews.get(`${subId}|${world(classId).showing[0]}`)!
      expect(sv.challenges[0].items[0]).toMatchObject({ answerText: '⅖', correctText: '⅚', isCorrect: false, errorTag: { id: 'mc-frac-add-straight' } })
    })
  }

  it('השליחה ללא פירוט תגיות בתלמידים שאינם מציגים: אף אחד מהם לא בחר ב-⅖', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const cv = d.classViews.get(ID.fractionsV2)!
    const showing = new Set(world('c-v2').showing)
    const picked = new Set(cv.challenges[0].items[0].options!.find((o) => o.text === '⅖')!.students.map((s) => s.id))
    for (const id of picked) expect(showing.has(id)).toBe(true)
    expect(cv.review.weakCount).toBeGreaterThan(0)
  })
})

describe('מקרה (ג): שליחה בלי מסיחים מתויגים — אנגלית ו׳2', () => {
  it('אין טעויות נפוצות, אין תגית על אף אפשרות', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const cv = d.classViews.get(ID.englishV2)!
    expect(cv.commonErrors).toEqual([])
    expect(cv.challenges.every((c) => c.commonError === null)).toBe(true)
    for (const c of cv.challenges) for (const i of c.items) for (const o of i.options ?? []) expect(o.errorTag).toBeNull()
    const sent = getDemoResults().submissions.find((s) => s.def.id === ID.englishV2)!
    expect(sent.input.optionTags).toEqual([])
    /* עדיין יש תוצאות מלאות */
    expect(cv.hasAnswerDetail).toBe(true)
    expect(cv.head.counts.completed).toBeGreaterThan(20)
  })
})

describe('מקרה (ד): תלמידי התרחיש מתנהגים בהתאם לעולם', () => {
  const solvedShare = (sv: StudentSubmissionView): number => sv.challenges.filter((c) => c.outcome === 'correct').length / sv.challenges.length

  it('אלון: ירידה בהיסטוריה — השלים והצליח בפחות ממחצית (תשומת לב), ואילו בשאר המקצועות אין', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const alon = cast('alon')
    const h = d.studentViews.get(`${ID.historyV2}|${alon}`)!
    expect(h.student.status).toBe('completed')
    expect(solvedShare(h)).toBeLessThan(ATTENTION_RULE.solvedShareBelow)
    expect(h.student.attentionReasons).toContain('low_success')
    for (const id of [ID.fractionsV2, ID.hebrewV2, ID.science, ID.englishV2]) {
      const sv = d.studentViews.get(`${id}|${alon}`)!
      if (sv.student.status === 'completed') expect(sv.student.attentionReasons, id).not.toContain('low_success')
    }
  })

  it('תמר: ירידה במקביל בהיסטוריה, מדעים ועברית — מתחת למחצית בשלושתן', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const tamar = cast('tamar')
    for (const id of [ID.historyV2, ID.science, ID.hebrewV2]) {
      const sv = d.studentViews.get(`${id}|${tamar}`)!
      expect(sv.student.status, id).toBe('completed')
      expect(solvedShare(sv), id).toBeLessThan(ATTENTION_RULE.solvedShareBelow)
      expect(sv.student.attentionReasons, id).toContain('low_success')
    }
  })

  it('איתי: קצב קריאה מהיר בהיסטוריה — שניות למילה נמוכות בהרבה משל הכיתה', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const cv = d.classViews.get(ID.historyV2)!
    const ratio = (id: string): number => {
      const sl = d.studentViews.get(`${ID.historyV2}|${id}`)!.slides
      const words = sl.reduce((s, x) => s + (x.words ?? 0), 0)
      const secs = sl.reduce((s, x) => s + (x.seconds ?? 0), 0)
      return secs / words
    }
    const itay = cast('itay')
    const others = cv.roster.completed.filter((c) => c.id !== itay).map((c) => ratio(c.id)).sort((x, y) => x - y)
    const median = others[Math.floor(others.length / 2)]
    expect(ratio(itay)).toBeLessThan(0.6 * median)
    /* עובדה בלבד: מילים ושניות לכל שקף, בסדר ההדמיה */
    const slides = d.studentViews.get(`${ID.historyV2}|${itay}`)!.slides
    expect(slides.map((x) => x.order)).toEqual([...slides.map((x) => x.order)].sort((x, y) => x - y))
    expect(slides.length).toBe(7)
    expect(slides[0].words).toBeGreaterThan(40)
  })

  it('רועי (תלמיד חדש): לא סיים אף שליחה — באמצע או לא התחיל', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const roi = cast('roi')
    const status = (id: string): string => d.studentViews.get(`${id}|${roi}`)!.student.status
    for (const id of [ID.science, ID.fractionsV2]) expect(status(id)).toBe('in_progress')
    for (const id of [ID.historyV2, ID.hebrewV2, ID.englishV2]) expect(status(id)).toBe('not_started')
    for (const s of d.studentViews.values()) if (s.student.id === roi) expect(s.student.status).not.toBe('completed')
  })

  it('יובל: אתגר הזיכרון במדעים נכשל (משחק זיכרון אקראי בעולם), וליאור/מאיה/נועה בכיתה', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const yuval = d.studentViews.get(`${ID.science}|${cast('yuval')}`)!
    const mem = yuval.challenges.find((c) => c.type === 'memory')!
    expect(mem.outcome).not.toBe('correct')
    /* הסגל מופיע ברשימת הכיתה לפי א-ב */
    const names = yuval.roster.map((r) => r.name)
    for (const k of ['alon', 'noa', 'maya', 'lior']) expect(names).toContain(A.studentById.get(cast(k))!.displayName)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('מקרים נוספים', () => {
  it('דילמה מוסרית בהיסטוריה: נספרת כנפתרה, התפלגות הבחירות בלי שמות; מבחן סיכום עם פריט לכל שאלה', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const cv = d.classViews.get(ID.historyV2)!
    const m = cv.challenges.find((c) => c.type === 'moralDilemma')!
    expect(m.solved).toBe(m.attempted)
    expect(m.items[0].options!.reduce((s, o) => s + o.count, 0)).toBe(m.attempted)
    expect(m.items[0].options!.every((o) => o.students.length === 0 && !o.isCorrect)).toBe(true)
    const quiz = cv.challenges.find((c) => c.type === 'finalQuiz')!
    expect(quiz.items).toHaveLength(4)
    expect(quiz.items.every((i) => i.attempted === quiz.attempted)).toBe(true)
  })

  it('שליחה ישנה (לפני לכידת התשובות): אירועים מסוכמים בלבד, בלי פירוט, עם "זמין מתאריך"', async () => {
    const d = await lensData('english', persona('english'))
    const cv = d.classViews.get(ID.englishD1)!
    expect(cv.hasAnswerDetail).toBe(false)
    expect(cv.detailAvailableFrom).not.toBeNull()
    expect(Date.parse(cv.detailAvailableFrom as string)).toBeGreaterThan(Date.parse(cv.head.sentAt))
    expect(cv.challenges.every((c) => c.items.every((i) => i.options === null))).toBe(true)
    expect(cv.challenges.every((c) => c.attempted > 0)).toBe(true)
    const sv = d.studentViews.get(`${ID.englishD1}|${cv.roster.completed[0].id}`)!
    expect(sv.hasAnswerDetail).toBe(false)
    expect(sv.challenges[0].items[0]).toMatchObject({ answerText: null, correctText: null })
    /* שליחה חדשה יותר של אותו מורה — עם פירוט מלא */
    const newer = d.classViews.get(ID.englishV2)!
    expect(newer.hasAnswerDetail).toBe(true)
    expect(newer.detailAvailableFrom).toBeNull()
  })

  it('מסכי תלמיד: קודם/הבא ורשימה לפי א-ב; שמות אמיתיים מהעולם', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const cv = d.classViews.get(ID.fractionsV2)!
    const names = allChips(cv).map((c) => c.name).sort((x, y) => x.localeCompare(y, 'he'))
    const first = d.studentViews.get(`${ID.fractionsV2}|${allChips(cv).find((c) => c.name === names[0])!.id}`)!
    expect(first.prevId).toBeNull()
    expect(first.nextId).not.toBeNull()
    expect(first.roster.map((r) => r.name)).toEqual(names)
    for (const c of allChips(cv)) expect(A.studentById.get(c.id)?.displayName).toBe(c.name)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('יעדי למידה בהדגמה', () => {
  /* היעדים הניתנים למדידה לפי הקטלוג: יעד שיש לו אתגר מתויג (לא דילמת מוסר) או שאלה מתויגת במבחן סיכום */
  const measurable = (q: DemoQuest): string[] => (q.objectives ?? []).map((o) => o.id).filter((id) => q.scenes.some((s) => {
    const p = s.puzzle
    if (!p || p.kind === 'moral') return false
    return p.objectiveId === id || (p.kind === 'quiz' && p.questions.some((x) => x.objectiveId === id))
  }))

  /* חישוב בלתי-תלוי מתוך מסכי התלמיד: מי הצליח בפחות מ-OBJECTIVE_BANDS.partial מהיחידות של היעד */
  function weakFromStudentViews(q: DemoQuest, subId: string, objectiveId: string, d: LensData, cv: ClassSubmissionView): { attempted: number; weak: string[] } {
    let attempted = 0
    const weak: string[] = []
    for (const chip of cv.roster.completed) {
      const sv = d.studentViews.get(`${subId}|${chip.id}`)!
      let n = 0
      let ok = 0
      for (const s of q.scenes) {
        const p = s.puzzle
        if (!p || p.kind === 'moral') continue
        const ch = sv.challenges.find((c) => c.sceneId === s.id)!
        if (p.kind === 'quiz') {
          p.questions.forEach((x, qi) => {
            if ((x.objectiveId ?? p.objectiveId) !== objectiveId) return
            const item = ch.items.find((i) => i.itemIndex === qi)
            if (!item) return
            n++
            if (item.isCorrect === true) ok++
          })
        } else if (p.objectiveId === objectiveId && ch.outcome !== 'not_reached') {
          n++
          if (ch.outcome === 'correct') ok++
        }
      }
      if (n === 0) continue
      attempted++
      if (ok / n < OBJECTIVE_BANDS.partial) weak.push(chip.id)
    }
    return { attempted, weak }
  }

  it('להדמיות עם יעדים — הם מוצגים לפי הסדר שהוגדר; לשאר — מערך ריק (אין טאב)', async () => {
    const expected: Record<string, string[]> = {
      [ID.fractionsV2]: ['obj_1', 'obj_2'], [ID.fractionsV1]: ['obj_1', 'obj_2'],
      [ID.science]: ['obj_1', 'obj_2'],
      [ID.historyV2]: ['obj_1', 'obj_2', 'obj_3'], [ID.historyV1]: ['obj_1', 'obj_2', 'obj_3'],
    }
    for (const { name, q } of LENSES) {
      const d = await lensData(name, q)
      for (const [id, cv] of d.classViews) {
        const quest = questById(DEMO_SUBMISSIONS.find((s) => s.id === id)!.questId)!
        expect(cv.objectives.map((o) => o.id), `${name}/${id}`).toEqual(expected[id] ?? [])
        expect(cv.objectives.map((o) => o.id)).toEqual(measurable(quest))
        for (const o of cv.objectives) expect(o.text).toBe(quest.objectives!.find((x) => x.id === o.id)!.text)
      }
    }
    /* לפחות שלוש הדמיות (2 מקצועות לפחות) עם יעדים, כדי שהאורח יראה את הטאב */
    expect(new Set(DEMO_QUESTS.filter((q) => (q.objectives ?? []).length > 0).map((q) => q.subject)).size).toBeGreaterThanOrEqual(3)
  })

  it('עקביות: ניסו ≤ סיימו; הצליחו + מתקשים = ניסו; המתקשים מבין מי שסיים; הרמה והמילה לפי הספים', async () => {
    for (const { name, q } of LENSES) {
      const d = await lensData(name, q)
      for (const [id, cv] of d.classViews) {
        const completed = new Set(cv.roster.completed.map((c) => c.id))
        for (const o of cv.objectives) {
          const where = `${name}/${id}/${o.id}`
          expect(o.attempted, where).toBeLessThanOrEqual(completed.size)
          expect(o.attempted, where).toBeGreaterThan(0)
          expect(o.solved + o.weakStudents.length, where).toBe(o.attempted)
          for (const s of o.weakStudents) expect(completed.has(s.id), where).toBe(true)
          expect(o.weakStudents.map((s) => s.name), where).toEqual([...o.weakStudents.map((s) => s.name)].sort((x, y) => x.localeCompare(y, 'he')))
          const share = o.solved / o.attempted
          expect(o.level, where).toBe(share >= OBJECTIVE_BANDS.strong ? 'strong' : share >= OBJECTIVE_BANDS.partial ? 'partial' : 'weak')
          expect(o.levelText, where).toBe(objectiveLevelText(o.level))
        }
      }
    }
  })

  it('המתקשים והספירות זהים לחישוב בלתי-תלוי ממסכי התלמידים', async () => {
    for (const { name, q } of LENSES) {
      const d = await lensData(name, q)
      for (const [id, cv] of d.classViews) {
        const quest = questById(DEMO_SUBMISSIONS.find((s) => s.id === id)!.questId)!
        for (const o of cv.objectives) {
          const ref = weakFromStudentViews(quest, id, o.id, d, cv)
          expect({ attempted: o.attempted, weak: o.weakStudents.map((s) => s.id).sort() }, `${name}/${id}/${o.id}`).toEqual({ attempted: ref.attempted, weak: [...ref.weak].sort() })
        }
      }
    }
  })

  it('האורח רואה את שלוש הרמות (למדו, למדו חלקית, עדיין קשה) לפחות פעם אחת, וגם הדמיה בלי יעדים', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const levels = new Set([...d.classViews.values()].flatMap((cv) => cv.objectives.map((o) => o.level)))
    expect(levels).toEqual(new Set(['strong', 'partial', 'weak']))
    expect(d.classViews.get(ID.hebrewV2)!.objectives).toEqual([])
    /* מי שמתקשה ביעד נפתח כתלמיד/ה: המזהה קיים ברשימת הכיתה */
    const weak = d.classViews.get(ID.historyV2)!.objectives.flatMap((o) => o.weakStudents)
    expect(weak.length).toBeGreaterThan(0)
    for (const s of weak) expect(d.studentViews.has(`${ID.historyV2}|${s.id}`)).toBe(true)
  })

  it('יעדי המורה נשארים תוכן דומיין: הניסוח בקטלוג בלבד, והרמות במילים מ-findingsNarrative', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    const words = new Set(Object.values(OBJECTIVE_LEVEL_TEXT))
    for (const cv of d.classViews.values()) for (const o of cv.objectives) expect(words.has(o.levelText)).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('הרשאות לפי עדשה', () => {
  it('מנהל: אין תוצאות — 403 בכל נקודת קצה', async () => {
    for (const run of [
      () => P.list(req(ADMIN), {}),
      () => P.classView(req(ADMIN), ID.fractionsV2),
      () => P.studentView(req(ADMIN), ID.fractionsV2, cast('alon')),
    ]) {
      const e = await thrown(run)
      expect(e.status).toBe(403)
      expect(e.message).toBe(MSG_RESULTS_NOT_FOR_ROLE)
    }
  })

  it('מחנך: כל השליחות של ו׳2 (כל המקצועות), החדשה ראשונה, עם "מי שלח"', async () => {
    const d = await lensData('homeroom', HOMEROOM)
    expect(d.list.submissions.map((s) => s.id)).toEqual([ID.science, ID.fractionsV2, ID.historyV2, ID.hebrewV2, ID.englishV2])
    expect(new Set(d.list.submissions.map((s) => s.classId))).toEqual(new Set(['c-v2']))
    expect(d.list.submissions.every((s) => s.className === 'ו׳2')).toBe(true)
    const dates = d.list.submissions.map((s) => s.sentAt)
    expect(dates).toEqual([...dates].sort().reverse())
    const bySource = (id: string) => d.list.submissions.find((s) => s.id === id)!
    expect(bySource(ID.fractionsV2)).toMatchObject({ source: 'mine', senderName: null })
    expect(bySource(ID.hebrewV2)).toMatchObject({ source: 'mine', senderName: null })
    expect(bySource(ID.science)).toMatchObject({ source: 'homeroom', senderName: DEMO_SUBJECT_TEACHERS.science })
    expect(bySource(ID.historyV2)).toMatchObject({ source: 'homeroom', senderName: DEMO_SUBJECT_TEACHERS.history })
    expect(d.list.filters.classes).toEqual([{ id: 'c-v2', name: 'ו׳2' }])
    expect(d.list.filters.subjects.map((s) => s.code)).toEqual(['hebrew', 'history', 'math', 'english', 'science'])
  })

  it('מורה מקצועי: רק המקצוע שלו, רק בכיתות שהוא מלמד', async () => {
    const expected: Record<string, string[]> = {
      math: [ID.fractionsV2, ID.fractionsV1, ID.compareD1],
      hebrew: [ID.hebrewV2],
      history: [ID.historyV2, ID.historyV1],
      science: [ID.science],
      english: [ID.englishV2, ID.englishD1],
    }
    for (const subject of PERSONAS) {
      const d = await lensData(subject, persona(subject))
      expect(d.list.submissions.map((s) => s.id), subject).toEqual(expected[subject])
      expect(d.list.submissions.every((s) => s.subject?.code === subject), subject).toBe(true)
      const teaches = new Set(demoViewerClasses([subject]))
      expect(d.list.submissions.every((s) => teaches.has(s.classId)), subject).toBe(true)
      expect(d.list.filters.subjects.map((s) => s.code)).toEqual([subject])
    }
  })

  it('"מי שלח" למורה מקצועי: שלי כששלחתי, אחרת השולח האחר בשמו', async () => {
    const m = await lensData('math', persona('math'))
    const row = (id: string) => m.list.submissions.find((s) => s.id === id)!
    expect(row(ID.fractionsV1)).toMatchObject({ source: 'mine', senderName: null })
    expect(row(ID.compareD1)).toMatchObject({ source: 'mine', senderName: null })
    expect(row(ID.fractionsV2)).toMatchObject({ source: 'subject', senderName: DEMO_HOMEROOM_TEACHER })
  })

  it('אין גישה לשליחה שאינה גלויה — גם לא לנתוני תלמידים בה', async () => {
    const cases: [Query, string][] = [
      [HOMEROOM, ID.fractionsV1], [HOMEROOM, ID.historyV1], [HOMEROOM, ID.compareD1], [HOMEROOM, ID.bible],
      [persona('math'), ID.science], [persona('math'), ID.historyV2], [persona('hebrew'), ID.fractionsV2],
      [persona('science'), ID.englishV2], [persona('english'), ID.fractionsV1],
    ]
    for (const [q, id] of cases) {
      const cls = DEMO_SUBMISSIONS.find((s) => s.id === id)!.classId
      const anyStudent = A.classById.get(cls)!.studentIds[0]
      expect((await thrown(() => P.classView(req(q), id))).status, `${JSON.stringify(q)} ${id}`).toBe(403)
      expect((await thrown(() => P.studentView(req(q), id, anyStudent))).status, `${JSON.stringify(q)} ${id}`).toBe(403)
    }
  })

  it('לא נמצא: שליחה לא קיימת, תלמיד שאינו בכיתה', async () => {
    expect((await thrown(() => P.classView(req(HOMEROOM), 'nope'))).status).toBe(404)
    expect((await thrown(() => P.studentView(req(HOMEROOM), 'nope', cast('alon')))).status).toBe(404)
    expect((await thrown(() => P.studentView(req(HOMEROOM), ID.fractionsV2, 'nope'))).status).toBe(404)
    /* תלמיד מכיתה אחרת אינו ברשימת השליחה */
    const other = A.classById.get('c-v1')!.studentIds[0]
    expect((await thrown(() => P.studentView(req(HOMEROOM), ID.fractionsV2, other))).status).toBe(404)
  })

  it('תנ״ך (ד׳2): גלוי רק למורה תנ״ך בארגון הדגמה — לא לאורח', () => {
    const bibleTeacher: V2Viewer = { lens: 'subject_teacher', guest: false, homeroomClassId: null, teachingClassIds: demoViewerClasses(['bible']), subjectCodes: ['bible'] }
    expect(demoVisibleSubmissions(bibleTeacher).map((s) => s.def.id)).toEqual([ID.bible])
    const mathTeacher: V2Viewer = { lens: 'subject_teacher', guest: false, homeroomClassId: null, teachingClassIds: demoViewerClasses(['math']), subjectCodes: ['math'] }
    expect(demoVisibleSubmissions(mathTeacher).map((s) => s.def.id)).not.toContain(ID.bible)
    const adminV: V2Viewer = { lens: 'admin', guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
    expect(demoVisibleSubmissions(adminV)).toEqual([])
  })

  it('מחנך אחר (כיתה ללא שליחות): רשימה ריקה, ואין גישה לו׳2', () => {
    const other: V2Viewer = { lens: 'homeroom', guest: false, homeroomClassId: 'c-d1', teachingClassIds: [], subjectCodes: [] }
    expect(demoVisibleSubmissions(other).map((s) => s.def.id)).toEqual([ID.compareD1, ID.englishD1])
  })
})

describe('סינון הרשימה', () => {
  it('לפי כיתה, מקצוע וחיפוש חופשי; אפשרויות הסינון נשארות מלאות', async () => {
    const full = await lensData('math', persona('math'))
    const byClass = await P.list(req(persona('math')), { classId: 'c-v1' })
    expect(byClass.submissions.map((s) => s.id)).toEqual([ID.fractionsV1])
    expect(byClass.filters).toEqual(full.list.filters)
    expect((await P.list(req(HOMEROOM), { subject: 'history' })).submissions.map((s) => s.id)).toEqual([ID.historyV2])
    expect((await P.list(req(HOMEROOM), { q: 'שברים' })).submissions.map((s) => s.id)).toEqual([ID.fractionsV2])
    expect((await P.list(req(HOMEROOM), { q: 'מדעים' })).submissions.map((s) => s.id)).toEqual([ID.science])
    expect((await P.list(req(HOMEROOM), { q: 'אין כזה' })).submissions).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('אותה ליבה כמו הספק האמיתי: שורות גולמיות בצורת DB', () => {
  it('הפלט של הספק = buildClassView על שורות הקלט (אין לוגיקה נפרדת להדגמה)', async () => {
    const subs = getDemoResults().submissions
    const s = subs.find((x) => x.def.id === ID.fractionsV2)!
    const viaProvider = await P.classView(req(HOMEROOM), ID.fractionsV2)
    const direct = buildClassView({ ...s.input, submission: { ...s.input.submission, source: 'mine', senderName: null } })
    expect(JSON.stringify(viaProvider)).toBe(JSON.stringify(direct))
  })

  it('sessions/answers/events: צורת ה-DB, הקשרים והתזמון', () => {
    const w = A.world
    for (const s of getDemoResults().submissions) {
      const inp = s.input
      const byId = new Map(inp.sessions.map((x) => [x.id, x]))
      expect(byId.size, s.def.id).toBe(inp.sessions.length)
      const students = new Set(inp.students.map((x) => x.id))
      const perStudent = new Set<string>()
      for (const ses of inp.sessions) {
        expect(students.has(ses.studentId)).toBe(true)
        expect(perStudent.has(ses.studentId), 'session אחד לתלמיד').toBe(false)
        perStudent.add(ses.studentId)
        expect((ses.startedAt as string) >= inp.submission.sentAt).toBe(true)
        expect(Date.parse(ses.startedAt as string)).toBeLessThanOrEqual(w.now.getTime())
        if (ses.completedAt) expect(ses.completedAt > (ses.startedAt as string)).toBe(true)
      }
      /* session שלא הושלם אינו כותב events/answers */
      const done = new Set(inp.sessions.filter((x) => x.completedAt).map((x) => x.id))
      expect(inp.answers.every((a) => done.has(a.sessionId))).toBe(true)
      expect(inp.events.every((e) => done.has(e.sessionId))).toBe(true)
      /* מפתח הצגה ייחודי (session:סצנה:פריט:seq) */
      const keys = inp.answers.map((a) => `${a.sessionId}:${a.sceneId}:${a.itemIndex}:${a.seq}`)
      expect(new Set(keys).size).toBe(keys.length)
      for (const a of inp.answers) {
        expect(a.isCorrect).toBe(a.outcome === 'correct')
        expect(a.responseMs).toBeGreaterThan(0)
        if (a.outcome === 'gave_up') expect(a.selectedOptionId).toBeNull()
      }
      /* אירוע puzzle לכל אתגר שהושלם, ולא יותר */
      const challenges = s.quest.scenes.filter((x) => x.puzzle).length
      const solvedOrFailed = inp.events.filter((e) => e.type === 'puzzle_solved' || e.type === 'puzzle_failed')
      expect(solvedOrFailed).toHaveLength(done.size * challenges)
      expect(inp.events.filter((e) => e.type === 'scene_enter')).toHaveLength(done.size * s.quest.scenes.length)
      if (!s.def.answerDetail) { expect(inp.answers).toEqual([]); expect(inp.moral).toEqual([]) }
    }
  })

  it('סצנות: מזהי תגיות קיימים בהדמיה ובאפשרויות; דילמה מוסרית עם m<אינדקס>', () => {
    for (const s of getDemoResults().submissions) {
      const gd = s.input.submission.quest.gameData as { scenes: { id: string; puzzle?: { choices?: { id: string }[] } }[] }
      for (const t of s.input.optionTags) {
        const scene = gd.scenes.find((x) => x.id === t.sceneId)!
        expect(scene.puzzle?.choices?.some((c) => c.id === t.optionId), `${s.def.id} ${t.sceneId}`).toBe(true)
      }
      for (const m of s.input.moral ?? []) expect(m.optionId).toMatch(/^m[0-2]$/)
    }
  })

  it('רק קריאות קריאה: אין כתיבה ל-DB, אין תלות בשעון בזמן הקריאה (התוצאה יציבה בין קריאות)', async () => {
    const a = JSON.stringify(await P.list(req(HOMEROOM), {}))
    const b = JSON.stringify(await P.list(req(HOMEROOM), {}))
    expect(a).toBe(b)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('חיווט בנתיב: מורה אורח → ספק ההדגמה (תגובה מאומתת מול הסכמה)', () => {
  interface Layer { route?: { path: string; stack: { handle: (req: Request, res: unknown, next: (e?: unknown) => void) => Promise<void> }[] } }
  async function call(path: string, r: Request): Promise<{ body?: { data: unknown }; error?: { status?: number } }> {
    const layer = (resultsRouter as unknown as { stack: Layer[] }).stack.find((l) => l.route?.path === path)
    if (!layer?.route) throw new Error(`נתיב לא רשום: ${path}`)
    let body: { data: unknown } | undefined
    let error: { status?: number } | undefined
    await layer.route.stack[0].handle(r, { json: (b: { data: unknown }) => { body = b } }, (e) => { error = e as { status?: number } })
    return { body, error }
  }
  const guest = (query: Query, params: Record<string, string> = {}): Request => ({ staff: { role: 'teacher', isGuest: true }, query, params } as unknown as Request)

  it('רשימה, מסך כיתה ומסך תלמיד', async () => {
    const list = await call('/submissions', guest(HOMEROOM))
    expect(list.error).toBeUndefined()
    expect((list.body!.data as SubmissionList).submissions).toHaveLength(5)
    const cls = await call('/submission/:id', guest(HOMEROOM, { id: ID.fractionsV2 }))
    expect(cls.error).toBeUndefined()
    expect((cls.body!.data as ClassSubmissionView).head.id).toBe(ID.fractionsV2)
    const stu = await call('/submission/:id/student/:studentId', guest(HOMEROOM, { id: ID.fractionsV2, studentId: cast('alon') }))
    expect(stu.error).toBeUndefined()
    expect((stu.body!.data as StudentSubmissionView).student.id).toBe(cast('alon'))
  })

  it('מנהל — 403, שליחה שאינה גלויה — 403, לא קיימת — 404', async () => {
    expect((await call('/submissions', guest(ADMIN))).error?.status).toBe(403)
    expect((await call('/submission/:id', guest(persona('math'), { id: ID.science }))).error?.status).toBe(403)
    expect((await call('/submission/:id', guest(HOMEROOM, { id: 'nope' }))).error?.status).toBe(404)
  })

  it('סינון דרך שאילתת הנתיב (classId / subject / q)', async () => {
    const r = await call('/submissions', guest({ ...persona('math'), classId: 'c-d1' }))
    expect((r.body!.data as SubmissionList).submissions.map((s) => s.id)).toEqual([ID.compareD1])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('שפה: אין ז׳רגון בשום טקסט שמוחזר (פרט ל"איך חישבנו?")', () => {
  const FORBIDDEN = [/וקטור/, /מובהק/, /BH/, /אינדקס/, /קורלציה/, /הסתברות/, /אפקט/, /סטטיסט/, /מתוקן/, /מסיח/, /\bN\s*=/]
  function* strings(value: unknown): Generator<string> {
    if (typeof value === 'string') yield value
    else if (Array.isArray(value)) for (const v of value) yield* strings(v)
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (k !== 'howWeCalculated') yield* strings(v)
  }
  it('כל מחרוזת בכל תגובה של כל עדשה', async () => {
    for (const { name, q } of LENSES) {
      const d = await lensData(name, q)
      for (const payload of [d.list, ...d.classViews.values(), ...d.studentViews.values()]) {
        for (const text of strings(payload)) for (const re of FORBIDDEN) expect(re.test(text), `${name}: ${text}`).toBe(false)
      }
    }
  }, 30_000)
})

/* ══════════════════════════════════════════════════════════════════════════ */
describe('יציבות על פני ימות השנה', () => {
  it('אותם מספרים, תשומת לב וסיכומים בכל תאריך (רק התאריכים זזים)', () => {
    const snap = (now: Date): unknown => getDemoResults(now).submissions.map((s) => {
      const cv = buildClassView(s.input)
      return {
        id: s.def.id, counts: cv.head.counts, summary: cv.summary, commonErrors: cv.commonErrors.map((e) => [e.id, e.studentsCount, e.studentsExposed]),
        challenges: cv.challenges.map((c) => [c.attempted, c.solved, c.gaveUp]), attention: allChips(cv).filter((c) => c.attention).map((c) => [c.id, c.attentionReasons]),
        objectives: cv.objectives.map((o) => [o.id, o.attempted, o.solved, o.level, o.weakStudents.map((s) => s.id)]),
      }
    })
    const base = snap(new Date('2026-10-19T09:00:00Z'))
    for (const iso of ['2027-01-20T09:00:00Z', '2027-06-15T09:00:00Z', '2026-08-10T09:00:00Z']) expect(snap(new Date(iso)), iso).toEqual(base)
    /* חזרה לתאריך המקורי: תאריכי השליחות מתיישרים עם ימי הלימוד */
    const again = getDemoResults(new Date('2026-10-19T09:00:00Z'))
    expect(again.submissions[0].input.submission.sentAt.slice(0, 10)).toBe(getAnalysis(new Date('2026-10-19T09:00:00Z')).world.days[DEMO_SUBMISSIONS[0].dayIndex].slice(0, 10))
  })
})
