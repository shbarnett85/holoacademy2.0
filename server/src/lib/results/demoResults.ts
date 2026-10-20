/* ──────────────────────────────────────────────────────────────────────────
   demoResults — ספק ההדגמה של טאב "תוצאות" (מורה אורח / ארגון הדגמה). חוזה: src/shared/types/resultsV1.ts.

   · **אותה ליבה כמו הספק האמיתי**: מייצרים שורות גולמיות בצורת ה-DB (sessions, answers, events, תגיות מסיחים,
     בחירות מוסר) ומעבירים אותן ל-core.ts — כל המספרים והמשפטים הם פלט של הלוגיקה האמיתית, לא fixtures מוכנים.
   · **עקביות עם עולם הדמו** (analyticsV2/demoWorld + engine): התלמידים, הכיתות והמקצועות משם; סיכוי ההצלחה של תלמיד
     נגזר ממפגשיו האחרונים במקצוע; תלמיד בירידה מדווחת נשאר מתחת למחצית; מי שמציג תפיסה שגויה (misByClass) בוחר
     במסיח המתויג שלה; קצב הקריאה (איתי) מגיע ממפגשיו; רועי (תלמיד חדש) לא מסיים.
   · דטרמיניסטי (rngFor עם תת-זרם לכל תלמיד×שליחה), בלי Date.now/Math.random, בלי כתיבה ל-DB.
   · הצופה: resolveV2Viewer (עדשת האורח). מחנך — כל שליחות כיתת-החינוך; מורה מקצועי — מקצועו בכיתות שהוא מלמד;
     מנהל — אין תוצאות (403). נתוני תלמיד רק לשליחות הגלויות לצופה.
   · כל טקסט למשתמש מגיע מ-findingsNarrative דרך הליבה; בקובץ הזה אין משפטים (נאכף ב-noHardcodedResults.test.ts).
     תוכן ההדמיות (שאלות/נרטיב) הוא נתוני דומיין ב-demoCatalog.ts.
   ────────────────────────────────────────────────────────────────────────── */
import type { Request } from 'express'
import type { ClassSubmissionView, StudentSubmissionView, SubmissionList, SubmissionRow } from '../../../../src/shared/types/resultsV1.js'
import { slideWordCount } from '../../../../src/shared/lib/answerTelemetry.js'
import { ERR_NOT_FOUND, ERR_NO_ACCESS } from '../../../../src/shared/lib/findingsNarrative.js'
import { SUBJECTS, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { AppError } from '../../middleware/errors.js'
import { canViewClassSubject, type V2Viewer } from '../analyticsV2/access.js'
import { MISCONCEPTIONS } from '../analyticsV2/catalog.js'
import { getAnalysis } from '../analyticsV2/demoProvider.js'
import { rngFor, skey, type WorldStudent } from '../analyticsV2/demoWorld.js'
import type { Analysis } from '../analyticsV2/engine.js'
import { resolveV2Viewer } from '../analyticsV2/viewer.js'
import {
  buildClassView, buildListRow, buildStudentView, questThumbUrl, subjectOfCode,
  type CoreAnswerRow, type CoreEventRow, type CoreInput, type CoreMoralRow, type CoreOptionTag, type CoreSession, type CoreStudent,
} from './core.js'
import {
  DEMO_DETAIL_FROM_DAY_INDEX, DEMO_HOMEROOM_TEACHER, DEMO_SUBJECT_TEACHERS, DEMO_SUBMISSIONS,
  optionLetter, puzzleScenes, questById, questGameData, taggedOptions,
  type DemoPuzzle, type DemoQuest, type DemoSubmissionDef,
} from './demoCatalog.js'
import type { ResultsListQuery, ResultsProvider } from './provider.js'
import { MSG_RESULTS_NOT_FOR_ROLE } from './realResults.js'

/* ══════════════════════════════════════════════════════════════════════════
   פרופיל ביצוע של תלמיד במקצוע — נגזר מנתוני העולם
   ══════════════════════════════════════════════════════════════════════════ */
/* "לאחרונה" = 30 ימי הלימוד האחרונים (כמו חלון המגמה הקצר באנליטיקה) */
const RECENT_DAYS = 30
/* ממוצע הצלחה כשאין מפגשים במקצוע */
const DEFAULT_SUCCESS = 0.65
/* משקל הקושי של אתגר בבחירת האתגרים שבהם תלמיד נכשל (מול הרעש האקראי) */
const HARDNESS_WEIGHT = 0.3
/* תלמיד שמשחק זיכרון בשיעור פגיעות נמוך מזה נכשל באתגר הזיכרון */
const MEMORY_WEAK_RATE = 0.35
/* חלק מכישלונות "הוויתור" הכלליים בעולם שמתורגמים לוויתור באתגר */
const GIVE_UP_SCALE = 0.45

interface Profile {
  /* סיכוי הצלחה באתגר (0..1) */
  p: number
  /* ms למילה בקריאת שקף */
  msPerWord: number
  /* חלק הוויתורים מתוך כל ההמשכים-אחרי-כישלון */
  giveUpShare: number
  /* שיעור פגיעה במשחקי זיכרון (null = אין מספיק משחקים) */
  memRate: number | null
  /* ירידה מדווחת במקצוע */
  declining: boolean
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function profileOf(a: Analysis, studentId: string, subject: SubjectCode): Profile {
  const d = a.world.data.get(skey(studentId, subject))
  const sa = a.ss.get(skey(studentId, subject))
  const sessions = d?.sessions ?? []
  const recent = sessions.filter((s) => s.day < RECENT_DAYS)
  const success = mean((recent.length ? recent : sessions).map((s) => s.success))
  const words = sessions.filter((s) => s.words > 0)
  const msw = mean(words.map((s) => s.closedMs / s.words))
  const afterFail = sessions.reduce((n, s) => n + s.retries.afterFail, 0)
  const giveUps = sessions.reduce((n, s) => n + s.retries.giveUps, 0)
  const turns = (d?.memory ?? []).flatMap((g) => g.turns).filter((t) => t.avail)
  return {
    p: Number.isFinite(success) ? clamp(success, 0.05, 0.98) : DEFAULT_SUCCESS,
    msPerWord: Number.isFinite(msw) ? msw : 330,
    giveUpShare: afterFail + giveUps > 0 ? giveUps / (afterFail + giveUps) : 0.3,
    memRate: turns.length >= 8 ? turns.filter((t) => t.hit).length / turns.length : null,
    declining: !!sa?.findings.some((f) => f.status === 'reported' && f.kind === 'level_trend' && f.evidence?.kind === 'level_trend' && f.evidence.direction === 'down'),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   סימולציית ההרצה של תלמיד שסיים
   ══════════════════════════════════════════════════════════════════════════ */
/* זמן תגובה ממוצע (ms) לפי סוג האתגר */
const BASE_MS: Record<string, number> = {
  multipleChoice: 11000, trueFalse: 6500, finalQuiz: 14000, memory: 52000, tileSwap: 74000, sequenceOrder: 32000, wordSearch: 88000, wordCompletion: 26000,
}
/* תוספת קבועה לשקף (ms) מעבר לזמן הקריאה עצמו */
const SLIDE_BASE_MS = 2500

/* בחירת מסיח שגוי: המסיחים הראשונים בקטלוג סבירים יותר (משקל 1/(מקום+1)) */
function weightedIndex(n: number, u: number): number {
  const total = Array.from({ length: n }, (_, k) => 1 / (k + 1)).reduce((a, b) => a + b, 0)
  let acc = 0
  for (let k = 0; k < n; k++) { acc += 1 / (k + 1) / total; if (u < acc) return k }
  return n - 1
}

const puzzleTypeOf = (p: DemoPuzzle): string =>
  p.kind === 'choice' ? 'multipleChoice' : p.kind === 'truefalse' ? 'trueFalse' : p.kind === 'quiz' ? 'finalQuiz' : p.kind === 'moral' ? 'moralDilemma' : p.type

interface Run { answers: CoreAnswerRow[]; events: CoreEventRow[]; moral: CoreMoralRow[] }

function simulateRun(
  def: DemoSubmissionDef, quest: DemoQuest, st: WorldStudent, sessionId: string, prof: Profile, prone: (misconceptionId: string) => boolean,
): Run {
  const sel = rngFor(`results:${def.id}:${st.id}:sel`)
  const det = rngFor(`results:${def.id}:${st.id}:det`)
  const chs = puzzleScenes(quest)
  const eligible = chs.map((_, i) => i).filter((i) => chs[i].puzzle.kind !== 'moral')
  const moralCount = chs.length - eligible.length

  /* ── אילו אתגרים נכשלים: מספר הכישלונות נגזר מסיכוי ההצלחה, ובחירת האתגרים לפי קושי ורעש ── */
  const uK = sel()
  const draws = chs.map(() => ({ u: sel(), tagU: sel() }))
  const p = clamp(prof.p + (def.ease ?? 0), 0.05, 0.98)
  let solvedTarget = clamp(Math.floor(eligible.length * p + uK), 0, eligible.length)
  if (prof.declining) solvedTarget = Math.min(solvedTarget, Math.max(0, Math.ceil(chs.length / 2) - 1 - moralCount))
  const forced = new Map<number, number | null>()
  chs.forEach((c, i) => {
    const z = c.puzzle
    if (z.kind === 'choice') {
      const t = z.options.findIndex((o) => !!o.tag)
      if (t >= 0 && prone(z.options[t].tag as string) && draws[i].tagU < (z.tagPick ?? 1)) forced.set(i, t)
    } else if (z.kind === 'game' && z.type === 'memory' && prof.memRate !== null && prof.memRate < MEMORY_WEAK_RATE) {
      forced.set(i, null)
    }
  })
  const failCount = Math.max(eligible.length - solvedTarget, forced.size)
  const extra = eligible.filter((i) => !forced.has(i))
    .sort((x, y) => (draws[y].u + HARDNESS_WEIGHT * chs[y].puzzle.hardness) - (draws[x].u + HARDNESS_WEIGHT * chs[x].puzzle.hardness) || x - y)
    .slice(0, failCount - forced.size)
  const failed = new Set<number>([...forced.keys(), ...extra])

  const speed = clamp(Math.sqrt(prof.msPerWord / 330), 0.5, 1.5)
  const ms = (type: string, f = 1): number => Math.round(((BASE_MS[type] ?? 20000) * (0.6 + 0.9 * det()) * speed * f) / 100) * 100

  const answers: CoreAnswerRow[] = []
  const events: CoreEventRow[] = []
  const moral: CoreMoralRow[] = []
  const row = (sceneId: string, itemIndex: number, puzzleType: string, selectedOptionId: string | null, outcome: CoreAnswerRow['outcome'], attemptNo: number, responseMs: number): CoreAnswerRow => ({
    sessionId, sceneId, itemIndex, puzzleType, selectedOptionId, isCorrect: outcome === 'correct', attemptNo, responseMs, outcome, seq: 1,
  })
  const failOutcome = (timed: boolean): CoreAnswerRow['outcome'] => {
    if (timed && det() < 0.4) return 'timeout'
    return det() < prof.giveUpShare * GIVE_UP_SCALE ? 'gave_up' : 'wrong'
  }

  /* ── זמני שהייה בשקפים (כל השקפים — מי שסיים עבר בכולם) ── */
  for (const scene of quest.scenes) {
    const words = slideWordCount(scene)
    const dwell = Math.round(words * prof.msPerWord * (0.85 + 0.3 * det()) + SLIDE_BASE_MS * (0.7 + 0.6 * det()))
    events.push({ sessionId, type: 'scene_enter', sceneId: scene.id, payload: { dwellMs: Math.round(dwell * 1.06), closed_dwell_ms: dwell, word_count: words } })
  }

  chs.forEach((c, i) => {
    const p = c.puzzle
    const type = puzzleTypeOf(p)
    const solved = p.kind === 'moral' || !failed.has(i)
    let attempts = 1
    let solveMs = 0

    if (p.kind === 'moral') {
      solveMs = ms(type)
      moral.push({ sceneId: c.id, optionId: `m${Math.floor(det() * p.choices.length)}` })
    } else if (p.kind === 'choice') {
      const correctIdx = p.options.findIndex((o) => o.correct)
      let picked: number | null
      let outcome: CoreAnswerRow['outcome']
      if (solved) { picked = correctIdx; outcome = 'correct' }
      else if (forced.get(i) != null) { picked = forced.get(i) as number; outcome = 'wrong' }
      else {
        outcome = failOutcome(false)
        const wrong = p.options.map((o, k) => ({ o, k })).filter((x) => x.k !== correctIdx)
        const plain = wrong.filter((x) => !x.o.tag)
        const pool = plain.length ? plain : wrong
        picked = outcome === 'gave_up' ? null : pool[weightedIndex(pool.length, det())].k
      }
      solveMs = ms(type, solved ? 1 : 0.85)
      answers.push(row(c.id, 0, type, picked === null ? null : optionLetter(picked), outcome, 1, solveMs))
    } else if (p.kind === 'truefalse') {
      const correctId = p.answer ? 't' : 'f'
      let outcome: CoreAnswerRow['outcome'] = 'correct'
      let picked: string | null = correctId
      if (!solved) {
        outcome = failOutcome(false)
        picked = outcome === 'gave_up' ? null : correctId === 't' ? 'f' : 't'
      }
      solveMs = ms(type, solved ? 1 : 0.85)
      answers.push(row(c.id, 0, type, picked, outcome, 1, solveMs))
    } else if (p.kind === 'quiz') {
      const n = p.questions.length
      const half = Math.ceil(n / 2)
      const correctCount = solved
        ? n - (det() < 0.4 && n - 1 >= half ? 1 : 0)
        : (det() < 0.5 ? half - 1 : Math.max(0, half - 2))
      const order = p.questions.map((_, k) => ({ k, r: det() })).sort((x, y) => x.r - y.r).map((x) => x.k)
      const right = new Set(order.slice(0, correctCount))
      p.questions.forEach((q, k) => {
        const t = ms(type)
        solveMs += t
        if (right.has(k)) answers.push(row(c.id, k, type, `o${q.correctIndex}`, 'correct', 1, t))
        else {
          const wrongIdx = q.options.map((_, w) => w).filter((w) => w !== q.correctIndex)
          answers.push(row(c.id, k, type, `o${wrongIdx[Math.floor(det() * wrongIdx.length)]}`, 'wrong', 1, t))
        }
      })
    } else {
      const timed = p.type === 'memory' || p.type === 'wordSearch'
      let outcome: CoreAnswerRow['outcome'] = 'correct'
      if (solved) attempts = 1 + Math.floor(det() * 3)
      else { outcome = failOutcome(timed); attempts = outcome === 'gave_up' ? 1 : 3 }
      solveMs = ms(type, solved ? 1 : 1.1)
      answers.push(row(c.id, 0, type, null, outcome, attempts, solveMs))
    }

    events.push({
      sessionId, type: p.kind === 'moral' || solved ? 'puzzle_solved' : 'puzzle_failed', sceneId: c.id,
      payload: { type, difficulty: p.level, attempts, solveTimeMs: solveMs, shards: p.kind === 'moral' || solved ? 1 : 0 },
    })
  })
  return { answers, events, moral }
}

/* ══════════════════════════════════════════════════════════════════════════
   בניית קלט הליבה לכל שליחה
   ══════════════════════════════════════════════════════════════════════════ */
type Status = 'completed' | 'in_progress' | 'not_started'

/* "dayIso" הוא ISO של יום לימוד (12:00Z); minutes = דקות מ-08:00 באותו יום */
const at = (dayIso: string, minutes: number): string => new Date(Date.parse(`${dayIso.slice(0, 10)}T08:00:00.000Z`) + minutes * 60000).toISOString()

function optionTagsOf(quest: DemoQuest): CoreOptionTag[] {
  return taggedOptions(quest).map((t) => {
    const m = MISCONCEPTIONS.find((x) => x.id === t.misconceptionId)
    if (!m) throw new Error(`demo catalog: unknown misconception ${t.misconceptionId}`)
    return { sceneId: t.sceneId, itemIndex: t.itemIndex, optionId: t.optionId, misconceptionId: m.id, title: m.titleHe, description: m.descriptionHe, linkedQuest: m.linkedQuest }
  })
}

function assignStatuses(def: DemoSubmissionDef, students: WorldStudent[], proneIds: Set<string>): Map<string, Status> {
  const status = new Map<string, Status>(students.map((s) => [s.id, 'completed']))
  let inProgress = def.inProgress
  let notStarted = def.notStarted
  const roi = students.find((s) => s.cast === 'roi')
  if (roi) {
    const r = def.roi ?? 'not_started'
    status.set(roi.id, r)
    if (r === 'in_progress') inProgress--; else notStarted--
  }
  if (inProgress < 0 || notStarted < 0) throw new Error(`demo catalog: inconsistent counts in ${def.id}`)
  /* מי שאינו מהסגל (תרחישי העולם) ואינו מציג תפיסה שהמספרים שלה נבדקים */
  const pool = students.filter((s) => s.cast === null && !proneIds.has(s.id))
    .map((s) => ({ s, k: rngFor(`results:${def.id}:${s.id}:status`)() })).sort((x, y) => x.k - y.k || (x.s.id < y.s.id ? -1 : 1)).map((x) => x.s)
  if (pool.length < inProgress + notStarted) throw new Error(`demo catalog: not enough students for ${def.id}`)
  pool.slice(0, inProgress).forEach((s) => status.set(s.id, 'in_progress'))
  pool.slice(inProgress, inProgress + notStarted).forEach((s) => status.set(s.id, 'not_started'))
  return status
}

export interface DemoSubmissionData { def: DemoSubmissionDef; quest: DemoQuest; input: CoreInput }

function buildSubmission(a: Analysis, def: DemoSubmissionDef): DemoSubmissionData {
  const quest = questById(def.questId)
  if (!quest) throw new Error(`demo catalog: unknown quest ${def.questId}`)
  const w = a.world
  const cls = a.classById.get(def.classId)
  if (!cls) throw new Error(`demo catalog: unknown class ${def.classId}`)
  const roster = cls.studentIds.map((id) => a.studentById.get(id) as WorldStudent).filter((s) => s.subjects.includes(quest.subject))
  const proneOf = (mid: string): Set<string> => new Set(a.misByClass.get(`${def.classId}|${mid}`)?.students.map((s) => s.id) ?? [])
  /* מי שמציג בעולם תפיסה שיש לה מסיח מתויג בהדמיה — מסיים אותה, כדי שמספר הבוחרים במסיח יהיה בדיוק מספר המציגים */
  const keep = new Set(taggedOptions(quest).flatMap((t) => [...proneOf(t.misconceptionId)]))
  const statuses = assignStatuses(def, roster, keep)

  const sessions: CoreSession[] = []
  const answers: CoreAnswerRow[] = []
  const events: CoreEventRow[] = []
  const moral: CoreMoralRow[] = []
  for (const st of roster) {
    const status = statuses.get(st.id) as Status
    if (status === 'not_started') continue
    const t = rngFor(`results:${def.id}:${st.id}:time`)
    const startDay = w.days[Math.max(0, def.dayIndex - (t() < 0.3 ? 1 : 0))]
    const startMin = 30 + Math.floor(t() * 260)
    const sessionId = `${def.id}:${st.id}`
    sessions.push({
      id: sessionId, studentId: st.id, startedAt: at(startDay, startMin),
      completedAt: status === 'completed' ? at(startDay, startMin + 14 + Math.floor(t() * 22)) : null,
    })
    /* session שלא הושלם אינו כותב events/answers (השליחה מרוכזת בסיום) */
    if (status !== 'completed') continue
    const run = simulateRun(def, quest, st, sessionId, profileOf(a, st.id, quest.subject), (mid) => proneOf(mid).has(st.id))
    events.push(...run.events)
    if (def.answerDetail) { answers.push(...run.answers); moral.push(...run.moral) }
  }

  const gameData = questGameData(quest)
  const students: CoreStudent[] = roster.map((s) => ({ id: s.id, name: s.displayName }))
  return {
    def, quest,
    input: {
      submission: {
        id: def.id, classId: cls.id, className: cls.name, sentAt: `${w.days[def.dayIndex].slice(0, 10)}T07:30:00.000Z`,
        source: 'mine', senderName: null,
        quest: { id: quest.id, title: quest.title, subject: subjectOfCode(quest.subject), gameData, thumbUrl: questThumbUrl(gameData) },
      },
      students, sessions, answers, events, optionTags: optionTagsOf(quest), moral,
      detailAvailableFrom: w.days[Math.min(DEMO_DETAIL_FROM_DAY_INDEX, w.days.length - 1)],
    },
  }
}

export interface DemoResults { submissions: DemoSubmissionData[]; byId: Map<string, DemoSubmissionData> }

/* מטמון לפי יום (הנתונים זהים בכל יום; רק התאריכים זזים) */
const CACHE = new Map<string, DemoResults>()
export function getDemoResults(now?: Date): DemoResults {
  const a = getAnalysis(now)
  const key = a.world.now.toISOString().slice(0, 10)
  let r = CACHE.get(key)
  if (!r) {
    const submissions = DEMO_SUBMISSIONS.map((def) => buildSubmission(a, def))
    r = { submissions, byId: new Map(submissions.map((s) => [s.def.id, s])) }
    CACHE.clear()
    CACHE.set(key, r)
  }
  return r
}

/* ══════════════════════════════════════════════════════════════════════════
   הרשאות ותצוגה לפי צופה
   ══════════════════════════════════════════════════════════════════════════ */
/* מנהל — אין תוצאות ברמת תלמיד; ללא צופה (ההדגמה כבויה) — אין גישה */
async function viewerOf(req: Request): Promise<V2Viewer> {
  const v = await resolveV2Viewer(req, { ignoreFlag: true })
  if (!v) throw new AppError(403, ERR_NO_ACCESS)
  if (v.lens === 'admin') throw new AppError(403, MSG_RESULTS_NOT_FOR_ROLE)
  return v
}

const canView = (v: V2Viewer, s: DemoSubmissionData): boolean => canViewClassSubject(v, s.def.classId, s.quest.subject)

/* השליחות שהצופה רשאי לראות, החדשה ראשונה */
export function demoVisibleSubmissions(v: V2Viewer, now?: Date): DemoSubmissionData[] {
  if (v.lens === 'admin') return []
  return getDemoResults(now).submissions.filter((s) => canView(v, s))
    .sort((x, y) => (x.input.submission.sentAt < y.input.submission.sentAt ? 1 : x.input.submission.sentAt > y.input.submission.sentAt ? -1 : x.def.id < y.def.id ? -1 : 1))
}

/* מי שלח, מנקודת מבטו של הצופה: אני / מורה אחר ששלח לכיתת-החינוך שלי / מורה אחר בכיתה שלי */
function sourceOf(v: V2Viewer, s: DemoSubmissionData): { source: SubmissionRow['source']; senderName: string | null } {
  const sender = s.def.sender === 'homeroom' ? DEMO_HOMEROOM_TEACHER : (DEMO_SUBJECT_TEACHERS[s.quest.subject] ?? null)
  if (v.lens === 'homeroom') return s.def.sender === 'homeroom' ? { source: 'mine', senderName: null } : { source: 'homeroom', senderName: sender }
  return s.def.sender === 'subject' && v.subjectCodes.includes(s.quest.subject) ? { source: 'mine', senderName: null } : { source: 'subject', senderName: sender }
}

const inputFor = (v: V2Viewer, s: DemoSubmissionData): CoreInput => ({ ...s.input, submission: { ...s.input.submission, ...sourceOf(v, s) } })

function pick(v: V2Viewer, submissionId: string): DemoSubmissionData {
  const s = getDemoResults().byId.get(submissionId)
  if (!s) throw new AppError(404, ERR_NOT_FOUND)
  if (!canView(v, s)) throw new AppError(403, ERR_NO_ACCESS)
  return s
}

const subjectOrder = (code: string): number => SUBJECTS.findIndex((s) => s.code === code)

export const demoResultsProvider: ResultsProvider = {
  async list(req: Request, q: ResultsListQuery): Promise<SubmissionList> {
    const v = await viewerOf(req)
    const visible = demoVisibleSubmissions(v)

    /* אפשרויות הסינון — מכל מה שהצופה רואה, לפני הסינון עצמו */
    const classOpts = new Map<string, string>()
    const subjOpts = new Map<string, NonNullable<SubmissionRow['subject']>>()
    for (const s of visible) {
      classOpts.set(s.input.submission.classId, s.input.submission.className)
      const subj = s.input.submission.quest.subject
      if (subj) subjOpts.set(subj.code, subj)
    }

    const needle = (q.q ?? '').trim().toLowerCase()
    const shown = visible
      .filter((s) => !q.classId || s.input.submission.classId === q.classId)
      .filter((s) => !q.subject || s.input.submission.quest.subject?.code === q.subject)
      .filter((s) => !needle || [s.input.submission.quest.title, s.input.submission.className, s.input.submission.quest.subject?.nameHe ?? ''].some((t) => t.toLowerCase().includes(needle)))

    return {
      submissions: shown.map((s) => buildListRow(inputFor(v, s))),
      filters: {
        classes: [...classOpts.entries()].map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name, 'he')),
        subjects: [...subjOpts.values()].sort((x, y) => subjectOrder(x.code) - subjectOrder(y.code)),
      },
    }
  },

  async classView(req: Request, submissionId: string): Promise<ClassSubmissionView> {
    const v = await viewerOf(req)
    return buildClassView(inputFor(v, pick(v, submissionId)))
  },

  async studentView(req: Request, submissionId: string, studentId: string): Promise<StudentSubmissionView> {
    const v = await viewerOf(req)
    const view = buildStudentView(inputFor(v, pick(v, submissionId)), studentId)
    if (!view) throw new AppError(404, ERR_NOT_FOUND)
    return view
  },
}
