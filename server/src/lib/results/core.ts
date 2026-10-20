/* ──────────────────────────────────────────────────────────────────────────
   results/core — הליבה הטהורה של טאב "תוצאות". חוזה: src/shared/types/resultsV1.ts.

   · טהור: בלי DB, בלי Express, בלי Date.now(). מקבל שורות גולמיות פשוטות (CoreInput) ומחזיר אובייקטי חוזה.
   · **שני ספקים, אותה ליבה**: הספק האמיתי (realResults.ts) ממפה שורות DB לטיפוסים כאן; ספק ההדגמה מייצר
     שורות סינתטיות באותם טיפוסים בדיוק וקורא לאותן פונקציות — כך שהמספרים והמשפטים זהים בשניהם.
   · כל משפט שמוצג למשתמש נבנה ב-findingsNarrative.ts (אין כאן עברית משפטית).
   · עובדות בלבד: אין פרשנות על תלמיד. "תשומת לב" = ATTENTION_RULE (analyticsConfig) בלבד.

   סמנטיקה (תקציר):
   · אתגר = סצנה עם puzzle, לפי סדר הסצנות. finalQuiz = אתגר אחד שפריטיו הן שאלותיו. moralDilemma אין בו נכון/שגוי
     (נפתר = ניסה), והתפלגות הבחירות שלו מגיעה ללא שמות תלמידים (moral_choices אינה קשורה לתלמיד בכוונה).
   · לכל תלמיד נספר ה-session האחרון בלבד (כמו באנליטיקה הקיימת).
   · תוצאת אתגר: קודם מ-answers (פירוט מלא), ואם אין — מ-events מסוכמים (puzzle_solved/puzzle_failed; options=null).
     session שלא הושלם אינו כותב events/answers (השליחה מרוכזת בסיום) — אתגריו "לא הגיע".
   · "טעות נפוצה" רק מתגיות מסיחים (option_tags) ורק כשלפחות COMMON_ERROR_MIN_STUDENTS תלמידים בחרו בה.
   ────────────────────────────────────────────────────────────────────────── */
import type {
  AttentionReason, ChallengeResult, ClassSubmissionView, CommonErrorRow, Counts, ItemResult, OptionCount, Outcome,
  ResultsSubject, SlideFact, StudentChallenge, StudentChip, StudentItem, StudentStatus, StudentSubmissionView,
  SubmissionHead, SubmissionRow,
} from '../../../../src/shared/types/resultsV1.js'
import { ATTENTION_RULE, COMMON_ERROR_MIN_STUDENTS } from '../../../../src/shared/lib/analyticsConfig.js'
import { slideWordCount } from '../../../../src/shared/lib/answerTelemetry.js'
import {
  howWeCalcResultsLines, narrateClassSummary, narrateListSummary, narrateStudentSummary,
  type ClassSummaryInput,
} from '../../../../src/shared/lib/findingsNarrative.js'
import { puzzleTypeLabel } from '../../../../src/shared/lib/labels.js'
import { SUBJECTS, isSubjectCode } from '../../../../src/shared/lib/subjects.js'

/* ══════════════════════════════════════════════════════════════════════════
   טיפוסי הקלט — יציבים. ספק ההדגמה מייצר שורות באותה צורה.
   ══════════════════════════════════════════════════════════════════════════ */

export interface CoreQuest {
  id: string
  title: string
  /* null = "לא סווג" */
  subject: ResultsSubject | null
  /* game_data של ההדמיה (scenes[], objectives[]...) — מבנה חופשי, נקרא בהגנתיות */
  gameData: unknown
  thumbUrl: string | null
}

export interface CoreSubmissionInfo {
  /* מזהה השליחה (assignments.id) */
  id: string
  quest: CoreQuest
  classId: string
  className: string
  /* תאריך השליחה, ISO */
  sentAt: string
  source: 'mine' | 'homeroom' | 'subject'
  senderName: string | null
}

export interface CoreStudent { id: string; name: string }

/* sessions: אפשר להעביר את כל ה-sessions של התלמידים בהדמיה — הליבה בוחרת את האחרון (startedAt) לכל תלמיד */
export interface CoreSession {
  id: string
  studentId: string
  startedAt: string | null
  /* null = לא הושלם (באמצע) */
  completedAt: string | null
}

export type CoreAnswerOutcome = 'correct' | 'wrong' | 'timeout' | 'gave_up' | 'closed'

/* שורת answers (טבלת answers; שורה לכל הצגה של אתגר, ובמבחן סיכום שורה לכל שאלה). */
export interface CoreAnswerRow {
  sessionId: string
  sceneId: string
  /* שאלה בתוך מבחן סיכום; 0 לאתגר בודד */
  itemIndex: number
  puzzleType: string
  /* id של הבחירה (multipleChoice/trueFalse) או "o<אינדקס מקורי>" (finalQuiz); null אם לא נבחר */
  selectedOptionId: string | null
  isCorrect: boolean
  attemptNo: number
  responseMs: number | null
  outcome: CoreAnswerOutcome
  /* מספר ההצגה (הסיפא של client_event_id = session:scene:item:seq). שורות מאותה אצווה חולקות created_at, ולכן
     הסדר בין הצגות נקבע לפי seq. ברירת מחדל 0 (סדר הקלט). */
  seq?: number
}

/* שורת events מסוכמת: puzzle_solved/puzzle_failed (payload: puzzleType/difficulty/attempts/solveTimeMs/shards)
   ו-scene_enter (payload: dwellMs, word_count?, closed_dwell_ms?) */
export interface CoreEventRow {
  sessionId: string
  type: 'puzzle_solved' | 'puzzle_failed' | 'scene_enter'
  sceneId: string | null
  payload: Record<string, unknown>
}

/* תגית מסיח (option_tags + misconceptions + misconception_content_links) */
export interface CoreOptionTag {
  sceneId: string
  itemIndex: number
  optionId: string
  misconceptionId: string
  /* misconceptions.title_he / description_he */
  title: string
  description: string
  linkedQuest: { questId: string; title: string } | null
}

/* בחירות בדילמה מוסרית (moral_choices): בלי תלמיד/session, optionId = "m<אינדקס>" */
export interface CoreMoralRow { sceneId: string; optionId: string }

export interface CoreInput {
  submission: CoreSubmissionInfo
  students: CoreStudent[]
  sessions: CoreSession[]
  answers: CoreAnswerRow[]
  events: CoreEventRow[]
  optionTags: CoreOptionTag[]
  moral?: CoreMoralRow[]
  /* התאריך (ISO) שממנו קיימת לכידת תשובות במערכת (min answers.created_at), או null אם אין עדיין */
  detailAvailableFrom: string | null
}

/* ══════════════════════════════════════════════════════════════════════════
   עזרים
   ══════════════════════════════════════════════════════════════════════════ */

const heCmp = (a: string, b: string): number => a.localeCompare(b, 'he')
const byName = <T extends { name: string; id: string }>(a: T, b: T): number => heCmp(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const toSeconds = (ms: unknown): number | null => (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null)
const toCount = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback)
const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

/* סף "תחום חלש" לבוחן ההצעה לחזרה — משקף את lib/weakConcepts.ts (WEAK_RATE / MIN_ATTEMPTS) */
export const WEAK_RATE = 0.6
export const WEAK_MIN_ATTEMPTS = 2

export function subjectOfCode(code: string | null | undefined): ResultsSubject | null {
  if (!code || !isSubjectCode(code)) return null
  return { code, nameHe: SUBJECTS.find((s) => s.code === code)!.nameHe }
}

interface GamePuzzle {
  type?: string
  question?: string
  situation?: string
  choices?: { id?: string; text?: string; isCorrect?: boolean }[]
  questions?: { question?: string; options?: string[]; correctIndex?: number }[]
  moralChoices?: { text?: string }[]
  objectiveId?: string | null
}
interface GameScene {
  id: string
  title?: string
  narrative?: string
  drHoloDialog?: string
  imageUrl?: string
  puzzle?: GamePuzzle
}
interface GameDataLike { scenes?: GameScene[]; entrySceneId?: string; objectives?: { id: string; text: string }[] }

const scenesOf = (gameData: unknown): GameScene[] => {
  const s = (gameData as GameDataLike | null)?.scenes
  return Array.isArray(s) ? s.filter((x) => x && typeof x.id === 'string') : []
}

/* תמונת הפתיחה של ההדמיה — לכרטיס ברשימה */
export function questThumbUrl(gameData: unknown): string | null {
  const gd = gameData as GameDataLike | null
  const scenes = scenesOf(gameData)
  const entry = scenes.find((s) => s.id === gd?.entrySceneId) ?? scenes[0]
  return typeof entry?.imageUrl === 'string' && entry.imageUrl ? entry.imageUrl : null
}

/* ── הגדרת האתגרים מתוך ההדמיה ── */
export interface OptionDef { id: string; text: string; isCorrect: boolean }
export interface ItemDef { itemIndex: number; prompt: string; options: OptionDef[] | null }
export interface ChallengeDef {
  sceneId: string
  /* 1..N בין האתגרים */
  order: number
  /* מיקום הסצנה (שקף) במבנה ההדמיה, 1..M */
  slideOrder: number
  title: string
  type: string
  typeLabel: string
  items: ItemDef[]
  objectiveId: string | null
}

export function extractChallenges(gameData: unknown): ChallengeDef[] {
  const out: ChallengeDef[] = []
  scenesOf(gameData).forEach((scene, idx) => {
    const p = scene.puzzle
    if (!p) return
    const type = p.type ?? 'multipleChoice'
    let items: ItemDef[]
    if (type === 'finalQuiz') {
      items = (Array.isArray(p.questions) ? p.questions : []).map((q, i) => ({
        itemIndex: i,
        prompt: q.question ?? '',
        options: (Array.isArray(q.options) ? q.options : []).map((text, oi) => ({ id: `o${oi}`, text, isCorrect: oi === q.correctIndex })),
      }))
    } else if (type === 'moralDilemma') {
      items = [{
        itemIndex: 0,
        prompt: p.situation ?? p.question ?? '',
        options: (Array.isArray(p.moralChoices) ? p.moralChoices : []).map((c, i) => ({ id: `m${i}`, text: c.text ?? '', isCorrect: false })),
      }]
    } else if (type === 'multipleChoice' || type === 'trueFalse') {
      items = [{
        itemIndex: 0,
        prompt: p.question ?? '',
        options: (Array.isArray(p.choices) ? p.choices : []).map((c, i) => ({ id: c.id ?? String(i), text: c.text ?? '', isCorrect: c.isCorrect === true })),
      }]
    } else {
      items = [{ itemIndex: 0, prompt: p.question ?? '', options: null }]
    }
    out.push({
      sceneId: scene.id, order: out.length + 1, slideOrder: idx + 1,
      title: scene.title ?? scene.id, type, typeLabel: puzzleTypeLabel(type), items,
      objectiveId: p.objectiveId ?? null,
    })
  })
  return out
}

/* ══════════════════════════════════════════════════════════════════════════
   ניתוח השליחה
   ══════════════════════════════════════════════════════════════════════════ */

interface ItemRes {
  selectedOptionId: string | null
  isCorrect: boolean
  outcome: CoreAnswerOutcome
  attempts: number
  seconds: number | null
}
interface SceneRes {
  outcome: Outcome
  attempts: number
  seconds: number | null
  /* האם יש פירוט מ-answers (אחרת: events בלבד) */
  detailed: boolean
  items: Map<number, ItemRes>
}
interface StudentAnalysis {
  student: CoreStudent
  status: StudentStatus
  session: CoreSession | null
  hasRows: boolean
  scenes: Map<string, SceneRes>
  solved: number
  attempted: number
  gaveUp: number
  reasons: AttentionReason[]
}
interface ItemAgg {
  def: ItemDef
  attempted: number
  solved: number
  /* optionId → מזהי התלמידים שבחרו (null = אין פירוט לפריט) */
  picks: Map<string, string[]> | null
}
interface ChallengeAgg {
  def: ChallengeDef
  attempted: number
  solved: number
  wrong: number
  gaveUp: number
  gaveUpStudentIds: string[]
  items: ItemAgg[]
  hasDetail: boolean
}
export interface Analysis {
  input: CoreInput
  challenges: ChallengeDef[]
  students: StudentAnalysis[]
  byStudent: Map<string, StudentAnalysis>
  aggs: ChallengeAgg[]
  hasAnswerRows: boolean
  tagByKey: Map<string, CoreOptionTag>
}

const tagKey = (sceneId: string, itemIndex: number, optionId: string): string => `${sceneId}|${itemIndex}|${optionId}`

/* ההכרעה בין הצגות חוזרות של אותו פריט: נכון אם יש; אחרת ההצגה האחרונה שנענתה; אחרת האחרונה (נסגרה) */
function decide(rows: CoreAnswerRow[]): CoreAnswerRow {
  const ord = rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.seq ?? 0) - (b.r.seq ?? 0) || a.i - b.i).map((x) => x.r)
  const correct = [...ord].reverse().find((r) => r.outcome === 'correct')
  if (correct) return correct
  const answered = [...ord].reverse().find((r) => r.outcome !== 'closed')
  return answered ?? ord[ord.length - 1]
}

const outcomeOfRow = (o: CoreAnswerOutcome): Outcome => o

const ts = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? -Infinity : t
}

function latestSessions(sessions: CoreSession[]): Map<string, CoreSession> {
  const map = new Map<string, CoreSession>()
  for (const s of sessions) {
    const cur = map.get(s.studentId)
    if (!cur) { map.set(s.studentId, s); continue }
    const a = ts(s.startedAt)
    const b = ts(cur.startedAt)
    if (a > b || (a === b && !!s.completedAt && !cur.completedAt)) map.set(s.studentId, s)
  }
  return map
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

export function analyzeSubmission(input: CoreInput): Analysis {
  const challenges = extractChallenges(input.submission.quest.gameData)
  const seen = new Set<string>()
  const students = input.students.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))).sort(byName)
  const latest = latestSessions(input.sessions)
  const latestIds = new Set([...latest.values()].map((s) => s.id))

  const answersBySession = groupBy(input.answers.filter((a) => latestIds.has(a.sessionId)), (a) => a.sessionId)
  const puzzleEvBySession = new Map<string, Map<string, CoreEventRow>>()
  for (const e of input.events) {
    if (!latestIds.has(e.sessionId) || !e.sceneId || (e.type !== 'puzzle_solved' && e.type !== 'puzzle_failed')) continue
    const m = puzzleEvBySession.get(e.sessionId) ?? new Map<string, CoreEventRow>()
    m.set(e.sceneId, e)
    puzzleEvBySession.set(e.sessionId, m)
  }

  const out: StudentAnalysis[] = []
  for (const stu of students) {
    const session = latest.get(stu.id) ?? null
    const status: StudentStatus = !session ? 'not_started' : session.completedAt ? 'completed' : 'in_progress'
    const an: StudentAnalysis = { student: stu, status, session, hasRows: false, scenes: new Map(), solved: 0, attempted: 0, gaveUp: 0, reasons: [] }
    if (session) {
      const rows = answersBySession.get(session.id) ?? []
      an.hasRows = rows.length > 0
      const rowsByScene = groupBy(rows, (r) => r.sceneId)
      const evByScene = puzzleEvBySession.get(session.id)
      for (const ch of challenges) {
        const res = sceneResult(ch, rowsByScene.get(ch.sceneId) ?? [], evByScene?.get(ch.sceneId) ?? null)
        if (res) an.scenes.set(ch.sceneId, res)
      }
    }
    for (const ch of challenges) {
      const r = an.scenes.get(ch.sceneId)
      if (!r || r.outcome === 'not_reached') continue
      an.attempted++
      if (r.outcome === 'correct') an.solved++
      if (r.outcome === 'gave_up' || r.outcome === 'closed') an.gaveUp++
    }
    /* "ויתר" נספר רק כשיש שורות answers (בלעדיהן אי אפשר להבדיל בין שגיאה לוויתור) */
    if (!an.hasRows) an.gaveUp = 0
    if (ATTENTION_RULE.notStarted && status === 'not_started') an.reasons.push('not_started')
    if (an.gaveUp >= ATTENTION_RULE.gaveUpAtLeast) an.reasons.push('gave_up_often')
    if (status === 'completed' && challenges.length > 0 && an.solved / challenges.length < ATTENTION_RULE.solvedShareBelow) an.reasons.push('low_success')
    out.push(an)
  }

  const tagByKey = new Map<string, CoreOptionTag>()
  for (const t of input.optionTags) tagByKey.set(tagKey(t.sceneId, t.itemIndex, t.optionId), t)

  const analysis: Analysis = {
    input, challenges, students: out, byStudent: new Map(out.map((a) => [a.student.id, a])),
    aggs: [], hasAnswerRows: input.answers.some((a) => latestIds.has(a.sessionId)), tagByKey,
  }
  analysis.aggs = challenges.map((ch) => aggregateChallenge(ch, out))
  return analysis
}

/* תוצאת תלמיד באתגר אחד: answers → events → null (לא הגיע) */
function sceneResult(ch: ChallengeDef, rows: CoreAnswerRow[], ev: CoreEventRow | null): SceneRes | null {
  const evOutcome = (): Outcome | null => (ev ? (ev.type === 'puzzle_solved' ? 'correct' : 'wrong') : null)
  const evAttempts = ev ? Math.max(1, toCount(ev.payload.attempts, 1)) : 1
  const evSeconds = ev ? toSeconds(ev.payload.solveTimeMs) : null

  /* דילמה מוסרית: אין שורות answers (בכוונה); "נפתר = ניסה" נלקח מה-events */
  if (ch.type === 'moralDilemma') {
    if (!ev) return null
    return { outcome: 'correct', attempts: 1, seconds: evSeconds, detailed: false, items: new Map() }
  }

  if (rows.length > 0) {
    const byItem = groupBy(rows, (r) => String(r.itemIndex))
    const items = new Map<number, ItemRes>()
    for (const [k, list] of byItem) {
      const d = decide(list)
      items.set(Number(k), {
        selectedOptionId: d.selectedOptionId, isCorrect: d.outcome === 'correct', outcome: d.outcome,
        attempts: Math.max(1, toCount(d.attemptNo, 1)), seconds: toSeconds(d.responseMs),
      })
    }
    if (ch.type === 'finalQuiz') {
      const total = ch.items.length
      const correct = [...items.values()].filter((i) => i.isCorrect).length
      /* כמו המנוע: ציון חלקי, "נפתר" כשלפחות חצי מהשאלות נכונות; ה-event (אם קיים) קובע */
      const outcome: Outcome = evOutcome() ?? (total > 0 && correct / total >= 0.5 ? 'correct' : 'wrong')
      const secs = [...items.values()].map((i) => i.seconds).filter((x): x is number => x !== null)
      return { outcome, attempts: 1, seconds: secs.length ? secs.reduce((a, b) => a + b, 0) : null, detailed: true, items }
    }
    const main = items.get(0) ?? [...items.values()][0]
    return { outcome: outcomeOfRow(main.outcome), attempts: main.attempts, seconds: main.seconds, detailed: true, items }
  }

  const o = evOutcome()
  if (!o) return null
  return { outcome: o, attempts: evAttempts, seconds: evSeconds, detailed: false, items: new Map() }
}

function aggregateChallenge(ch: ChallengeDef, students: StudentAnalysis[]): ChallengeAgg {
  const agg: ChallengeAgg = { def: ch, attempted: 0, solved: 0, wrong: 0, gaveUp: 0, gaveUpStudentIds: [], items: [], hasDetail: false }
  const reached = students.filter((s) => { const r = s.scenes.get(ch.sceneId); return !!r && r.outcome !== 'not_reached' })
  for (const s of reached) {
    const r = s.scenes.get(ch.sceneId)!
    agg.attempted++
    if (r.outcome === 'correct') agg.solved++
    else if (r.outcome === 'wrong' || r.outcome === 'timeout') agg.wrong++
    else if (r.outcome === 'gave_up' || r.outcome === 'closed') { agg.gaveUp++; agg.gaveUpStudentIds.push(s.student.id) }
    if (r.detailed) agg.hasDetail = true
  }
  agg.items = ch.items.map((def) => {
    const picks = agg.hasDetail && def.options ? new Map<string, string[]>(def.options.map((o) => [o.id, []])) : null
    const item: ItemAgg = { def, attempted: 0, solved: 0, picks }
    for (const s of reached) {
      const r = s.scenes.get(ch.sceneId)!
      if (ch.type === 'finalQuiz') {
        const ir = r.items.get(def.itemIndex)
        if (!ir) continue
        item.attempted++
        if (ir.isCorrect) item.solved++
        if (picks && ir.selectedOptionId !== null) picks.get(ir.selectedOptionId)?.push(s.student.id)
      } else {
        item.attempted++
        if (r.outcome === 'correct') item.solved++
        const ir = r.items.get(def.itemIndex)
        if (picks && ir?.selectedOptionId != null) picks.get(ir.selectedOptionId)?.push(s.student.id)
      }
    }
    return item
  })
  /* דילמה מוסרית: התפלגות מ-moral_choices — בלי שמות, ובלי קשר לתלמיד */
  return agg
}

/* ── טעויות נפוצות ── */
interface TopError { title: string; count: number; optionText: string }

function itemTopError(an: Analysis, sceneId: string, item: ItemAgg): TopError | null {
  if (!item.picks || !item.def.options) return null
  const groups = new Map<string, { title: string; count: number; best: { text: string; n: number } }>()
  for (const o of item.def.options) {
    const tag = an.tagByKey.get(tagKey(sceneId, item.def.itemIndex, o.id))
    if (!tag || o.isCorrect) continue
    const n = item.picks.get(o.id)?.length ?? 0
    if (n === 0) continue
    const g = groups.get(tag.misconceptionId) ?? { title: tag.title, count: 0, best: { text: o.text, n: 0 } }
    g.count += n
    if (n > g.best.n) g.best = { text: o.text, n }
    groups.set(tag.misconceptionId, g)
  }
  let top: TopError | null = null
  for (const g of groups.values()) {
    if (g.count >= COMMON_ERROR_MIN_STUDENTS && (!top || g.count > top.count)) top = { title: g.title, count: g.count, optionText: g.best.text }
  }
  return top
}

function classCommonErrors(an: Analysis): CommonErrorRow[] {
  interface Acc { tag: CoreOptionTag; chosen: Set<string>; exposed: Set<string> }
  const acc = new Map<string, Acc>()
  for (const agg of an.aggs) {
    for (const item of agg.items) {
      if (!item.picks || !item.def.options) continue
      const answered = new Set<string>()
      for (const ids of item.picks.values()) for (const id of ids) answered.add(id)
      for (const o of item.def.options) {
        const tag = an.tagByKey.get(tagKey(agg.def.sceneId, item.def.itemIndex, o.id))
        if (!tag) continue
        const a = acc.get(tag.misconceptionId) ?? { tag, chosen: new Set<string>(), exposed: new Set<string>() }
        for (const id of answered) a.exposed.add(id)
        if (!o.isCorrect) for (const id of item.picks.get(o.id) ?? []) a.chosen.add(id)
        acc.set(tag.misconceptionId, a)
      }
    }
  }
  return [...acc.values()]
    .filter((a) => a.chosen.size >= COMMON_ERROR_MIN_STUDENTS)
    .sort((a, b) => b.chosen.size - a.chosen.size || heCmp(a.tag.title, b.tag.title))
    .map((a) => ({
      id: a.tag.misconceptionId, title: a.tag.title, description: a.tag.description,
      studentsCount: a.chosen.size, studentsExposed: a.exposed.size, linkedQuest: a.tag.linkedQuest,
    }))
}

/* ── סיכום ── */
function countsOf(an: Analysis): Counts {
  const total = an.students.length
  const completed = an.students.filter((s) => s.status === 'completed').length
  const inProgress = an.students.filter((s) => s.status === 'in_progress').length
  return { total, completed, inProgress, notStarted: total - completed - inProgress }
}

/* האתגר הקשה ביותר = שיעור הטעות הגבוה ביותר (טעו/ניסו); רק אתגר שיש בו טעות */
function hardestOf(an: Analysis): ClassSummaryInput['hardest'] {
  let best: ChallengeAgg | null = null
  for (const a of an.aggs) {
    if (a.attempted === 0 || a.wrong === 0) continue
    if (!best) { best = a; continue }
    const ra = a.wrong / a.attempted
    const rb = best.wrong / best.attempted
    if (ra > rb || (ra === rb && a.wrong > best.wrong)) best = a
  }
  if (!best) return null
  let text: string | null = null
  let count = 0
  /* אפשרות שגויה נבחרת ביותר — רק באתגר שאלה בודדת (במבחן סיכום הספירה היא פר-שאלה ולא פר-תלמיד) */
  if (best.def.type !== 'finalQuiz' && best.def.type !== 'trueFalse') {
    const item = best.items[0]
    for (const o of item?.def.options ?? []) {
      if (o.isCorrect) continue
      const n = item.picks?.get(o.id)?.length ?? 0
      if (n > count) { count = n; text = o.text }
    }
  }
  return { title: best.def.title, attempted: best.attempted, wrong: best.wrong, topErrorOptionText: text, topErrorCount: count }
}

function summaryInput(an: Analysis): ClassSummaryInput {
  const c = countsOf(an)
  const done = an.students.filter((s) => s.status === 'completed')
  const total = an.challenges.length
  const avg = done.length > 0 && total > 0 ? done.reduce((sum, s) => sum + s.solved / total, 0) / done.length : null
  return { ...c, avgSolvedShare: avg, hardest: hardestOf(an) }
}

/* מספר התחומים החלשים — לבוחן ההצעה "הדמיית חזרה" (0 = לא מציגים) */
function weakCountOf(an: Analysis): number {
  const gd = an.input.submission.quest.gameData as GameDataLike | null
  const objectives = Array.isArray(gd?.objectives) ? gd.objectives.filter((o) => o?.id && o?.text) : []
  const weak = (attempted: number, solved: number): boolean => attempted >= WEAK_MIN_ATTEMPTS && solved / attempted < WEAK_RATE
  if (objectives.length > 0) {
    let n = 0
    for (const o of objectives) {
      const mine = an.aggs.filter((a) => a.def.objectiveId === o.id)
      if (mine.length > 0 && weak(mine.reduce((s, a) => s + a.attempted, 0), mine.reduce((s, a) => s + a.solved, 0))) n++
    }
    return n
  }
  return an.aggs.filter((a) => weak(a.attempted, a.solved)).length
}

/* האם יש פירוט תשובות לשליחה: נתונים בפועל, או שהיא נשלחה אחרי שהלכידה התחילה */
function submissionDetail(an: Analysis): boolean {
  if (an.hasAnswerRows) return true
  const from = an.input.detailAvailableFrom
  return from !== null && ts(an.input.submission.sentAt) >= ts(from)
}

const chipOf = (s: StudentAnalysis): StudentChip => ({
  id: s.student.id, name: s.student.name, status: s.status, attention: s.reasons.length > 0, attentionReasons: s.reasons,
})

function headOf(an: Analysis): SubmissionHead {
  const sub = an.input.submission
  return {
    id: sub.id, questId: sub.quest.id, title: sub.quest.title, thumbUrl: sub.quest.thumbUrl, subject: sub.quest.subject,
    classId: sub.classId, className: sub.className, sentAt: sub.sentAt, counts: countsOf(an),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   נקודות הכניסה
   ══════════════════════════════════════════════════════════════════════════ */

export function buildListRow(input: CoreInput): SubmissionRow {
  const an = analyzeSubmission(input)
  const sub = input.submission
  return {
    id: sub.id, questId: sub.quest.id, title: sub.quest.title, thumbUrl: sub.quest.thumbUrl, subject: sub.quest.subject,
    classId: sub.classId, className: sub.className, sentAt: sub.sentAt, counts: countsOf(an),
    summary: narrateListSummary(summaryInput(an)),
    attentionCount: an.students.filter((s) => s.reasons.length > 0).length,
    source: sub.source, senderName: sub.senderName,
  }
}

function moralOptions(an: Analysis, agg: ChallengeAgg): OptionCount[] | null {
  const rows = (an.input.moral ?? []).filter((m) => m.sceneId === agg.def.sceneId)
  const opts = agg.def.items[0]?.options
  /* אין שורות moral_choices (הדמיה ישנה / עוד לא נשלחו) = אין פירוט */
  if (!opts || opts.length === 0 || rows.length === 0) return null
  return opts.map((o) => ({
    optionId: o.id, text: o.text, isCorrect: false, count: rows.filter((m) => m.optionId === o.id).length,
    errorTag: null, students: [],
  }))
}

function optionCounts(an: Analysis, agg: ChallengeAgg, item: ItemAgg): OptionCount[] | null {
  if (agg.def.type === 'moralDilemma') return moralOptions(an, agg)
  if (!item.picks || !item.def.options) return null
  return item.def.options.map((o) => {
    const tag = an.tagByKey.get(tagKey(agg.def.sceneId, item.def.itemIndex, o.id))
    const ids = item.picks!.get(o.id) ?? []
    return {
      optionId: o.id, text: o.text, isCorrect: o.isCorrect, count: ids.length,
      errorTag: tag && !o.isCorrect ? { id: tag.misconceptionId, title: tag.title } : null,
      students: ids.map((id) => ({ id, name: an.byStudent.get(id)?.student.name ?? '' })).sort(byName),
    }
  })
}

function challengeResult(an: Analysis, agg: ChallengeAgg): ChallengeResult {
  /* מבחן סיכום בלי פירוט שאלות (events בלבד / אף אחד לא סיים): אין מה לפרט פר-שאלה — לא מציגים "0 מתוך 0" */
  const itemAggs = agg.def.type === 'finalQuiz' && !agg.hasDetail ? [] : agg.items
  const items: ItemResult[] = itemAggs.map((item) => ({
    itemIndex: item.def.itemIndex, prompt: item.def.prompt, attempted: item.attempted, solved: item.solved,
    options: optionCounts(an, agg, item), commonError: itemTopError(an, agg.def.sceneId, item),
  }))
  let commonError: TopError | null = null
  for (const item of agg.items) {
    const e = itemTopError(an, agg.def.sceneId, item)
    if (e && (!commonError || e.count > commonError.count)) commonError = e
  }
  return {
    sceneId: agg.def.sceneId, order: agg.def.order, title: agg.def.title, type: agg.def.type, typeLabel: agg.def.typeLabel,
    attempted: agg.attempted, solved: agg.solved, gaveUp: agg.gaveUp,
    gaveUpStudents: agg.gaveUpStudentIds.map((id) => ({ id, name: an.byStudent.get(id)?.student.name ?? '' })).sort(byName),
    items, commonError,
  }
}

export function buildClassView(input: CoreInput): ClassSubmissionView {
  const an = analyzeSubmission(input)
  const detail = submissionDetail(an)
  const chips = an.students.map(chipOf)
  return {
    head: headOf(an),
    summary: narrateClassSummary(summaryInput(an)),
    detailAvailableFrom: detail ? null : input.detailAvailableFrom,
    hasAnswerDetail: detail,
    roster: {
      completed: chips.filter((c) => c.status === 'completed'),
      inProgress: chips.filter((c) => c.status === 'in_progress'),
      notStarted: chips.filter((c) => c.status === 'not_started'),
    },
    challenges: an.aggs.map((a) => challengeResult(an, a)),
    commonErrors: classCommonErrors(an),
    review: { weakCount: weakCountOf(an) },
    howWeCalculated: howWeCalcResultsLines(),
  }
}

/* ── מצב "לפי תלמיד" ── */
function studentItems(an: Analysis, ch: ChallengeDef, res: SceneRes | undefined, stuOutcome: Outcome): StudentItem[] {
  if (!res || stuOutcome === 'not_reached') return []
  const out: StudentItem[] = []
  for (const def of ch.items) {
    const ir = res.items.get(def.itemIndex)
    if (!ir) {
      /* אין פירוט לפריט: events בלבד (או דילמה מוסרית — הבחירה אינה קשורה לתלמיד בכוונה) */
      out.push({
        itemIndex: def.itemIndex, prompt: def.prompt, answerText: null, correctText: null,
        isCorrect: ch.type === 'finalQuiz' || ch.type === 'moralDilemma' ? null : stuOutcome === 'correct',
        errorTag: null, attempts: ch.type === 'finalQuiz' ? 0 : res.attempts, seconds: ch.type === 'finalQuiz' ? null : res.seconds,
      })
      continue
    }
    const opts = def.options
    const selected = ir.selectedOptionId !== null ? opts?.find((o) => o.id === ir.selectedOptionId) : undefined
    const tag = selected && !selected.isCorrect ? an.tagByKey.get(tagKey(ch.sceneId, def.itemIndex, selected.id)) : undefined
    out.push({
      itemIndex: def.itemIndex, prompt: def.prompt,
      answerText: selected ? selected.text : null,
      correctText: opts ? (opts.find((o) => o.isCorrect)?.text ?? null) : null,
      isCorrect: ir.isCorrect, errorTag: tag ? { id: tag.misconceptionId, title: tag.title } : null,
      attempts: ir.attempts, seconds: ir.seconds,
    })
  }
  return out
}

function slideFacts(an: Analysis, s: StudentAnalysis): SlideFact[] {
  if (!s.session) return []
  const scenes = scenesOf(an.input.submission.quest.gameData)
  const order = new Map(scenes.map((sc, i) => [sc.id, { order: i + 1, scene: sc }]))
  const acc = new Map<string, { words: number | null; ms: number | null }>()
  for (const e of an.input.events) {
    if (e.type !== 'scene_enter' || e.sessionId !== s.session.id || !e.sceneId || !order.has(e.sceneId)) continue
    const closed = e.payload.closed_dwell_ms
    const raw = typeof closed === 'number' ? closed : e.payload.dwellMs
    const ms = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
    const wc = e.payload.word_count
    const cur = acc.get(e.sceneId) ?? { words: null, ms: null }
    if (cur.words === null && typeof wc === 'number' && wc >= 0) cur.words = Math.round(wc)
    if (ms !== null) cur.ms = (cur.ms ?? 0) + ms
    acc.set(e.sceneId, cur)
  }
  return [...acc.entries()]
    .map(([sceneId, v]) => {
      const o = order.get(sceneId)!
      return { order: o.order, title: o.scene.title ?? sceneId, words: v.words ?? slideWordCount(o.scene), seconds: toSeconds(v.ms) }
    })
    .sort((a, b) => a.order - b.order)
}

/* null = התלמיד אינו ברשימת הכיתה */
export function buildStudentView(input: CoreInput, studentId: string): StudentSubmissionView | null {
  const an = analyzeSubmission(input)
  const s = an.byStudent.get(studentId)
  if (!s) return null
  const roster = an.students.map(chipOf)
  const idx = roster.findIndex((c) => c.id === studentId)
  const chip = roster[idx]
  const submissionDetailOn = submissionDetail(an)
  /* מי שעוד לא סיים: אין לו מה לאבד — יורש את מצב השליחה. מי שסיים: לפי השורות שלו עצמו */
  const detail = s.status === 'completed' ? s.hasRows : submissionDetailOn
  const challenges: StudentChallenge[] = an.challenges.map((ch) => {
    const res = s.scenes.get(ch.sceneId)
    const outcome: Outcome = res ? res.outcome : 'not_reached'
    const items = studentItems(an, ch, res, outcome)
    return {
      sceneId: ch.sceneId, order: ch.order, title: ch.title, type: ch.type, typeLabel: ch.typeLabel,
      outcome, attempts: res && outcome !== 'not_reached' ? res.attempts : 0, seconds: res && outcome !== 'not_reached' ? res.seconds : null, items,
    }
  })
  return {
    head: headOf(an),
    student: chip,
    roster,
    prevId: idx > 0 ? roster[idx - 1].id : null,
    nextId: idx < roster.length - 1 ? roster[idx + 1].id : null,
    summary: narrateStudentSummary({
      firstName: firstName(s.student.name), status: s.status, totalChallenges: an.challenges.length,
      attempted: s.attempted, solved: s.solved, gaveUp: s.gaveUp,
    }),
    detailAvailableFrom: detail ? null : input.detailAvailableFrom,
    hasAnswerDetail: detail,
    challenges,
    slides: slideFacts(an, s),
    howWeCalculated: howWeCalcResultsLines(),
  }
}
