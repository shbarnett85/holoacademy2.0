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
   · לכל תלמיד נספרת ההרצה האחרונה **שהושלמה** (session פתוח חדש אינו מוחק הרצה שהושלמה); אם אין הרצה שהושלמה — ה-session הפתוח האחרון ("באמצע").
   · תלמיד ששיחק בגרסה אישית (answers.variant_id): הפרומפטים/האפשרויות/התשובה הנכונה/התגיות נלקחים מהגרסה שלו, לא מהבסיס.
   · תוצאת אתגר: קודם מ-answers (פירוט מלא), ואם אין — מ-events מסוכמים (puzzle_solved/puzzle_failed; options=null).
     session שלא הושלם אינו כותב events/answers (השליחה מרוכזת בסיום) — אתגריו "לא הגיע".
   · "טעות נפוצה" רק מתגיות מסיחים (option_tags) ורק כשלפחות COMMON_ERROR_MIN_STUDENTS תלמידים בחרו בה.
   ────────────────────────────────────────────────────────────────────────── */
import type {
  AttentionReason, ChallengeResult, ClassSubmissionView, CommonErrorRow, Counts, ItemResult, ObjectiveLevel, ObjectiveResult,
  OptionCount, Outcome, ResultsSubject, SlideFact, StudentChallenge, StudentChip, StudentItem, StudentStatus, StudentSubmissionView,
  SubmissionHead, SubmissionRow,
} from '../../../../src/shared/types/resultsV1.js'
import {
  ATTENTION_RULE, COMMON_ERROR_MIN_STUDENTS, MORAL_MIN_COMPLETED, MORAL_MIN_ROWS, OBJECTIVE_BANDS, REVIEW_MIN_COMPLETED,
} from '../../../../src/shared/lib/analyticsConfig.js'
import { slideWordCount } from '../../../../src/shared/lib/answerTelemetry.js'
import {
  howWeCalcObjectivesLines, howWeCalcResultsLines, israelDayKey, narrateClassSummary, narrateListSummary, narrateStudentSummary, objectiveLevelText,
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
  /* answers.variant_id: הגרסה האישית של ההדמיה ששוחקה (quest_variants.id). null/חסר = ההדמיה הבסיסית.
     בגרסה אישית החידות נוצרו מחדש, ולכן selectedOptionId מתייחס לאפשרויות הגרסה ולא לאפשרויות הבסיס. */
  variantId?: string | null
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

/* בחירות בדילמה מוסרית (moral_choices): בלי תלמיד/session, optionId = "m<אינדקס>".
   variantId = moral_choices.variant_id — בחירה בגרסה אישית אינה ניתנת לשיוך לאפשרויות הבסיס, ולכן אינה נכנסת להתפלגות. */
export interface CoreMoralRow { sceneId: string; optionId: string; variantId?: string | null }

/* גרסה אישית של ההדמיה (quest_variants): game_data משלה (חידות שנוצרו מחדש), ותגיות מסיחים משלה — לעולם לא ממוזגות לתגיות הבסיס */
export interface CoreVariant { id: string; studentId: string; gameData: unknown; optionTags?: CoreOptionTag[] }

export interface CoreInput {
  submission: CoreSubmissionInfo
  students: CoreStudent[]
  sessions: CoreSession[]
  answers: CoreAnswerRow[]
  events: CoreEventRow[]
  optionTags: CoreOptionTag[]
  /* הגרסאות האישיות שחלק מהתשובות שוחקו בהן (מזוהות לפי answers.variant_id) */
  variants?: CoreVariant[]
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
  questions?: { question?: string; options?: string[]; correctIndex?: number; objectiveId?: string | null }[]
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
interface GameDataLike { scenes?: GameScene[]; entrySceneId?: string; objectives?: { id?: unknown; text?: unknown }[] }

/* מזהה יעד תקין = מחרוזת לא ריקה (game_data הוא jsonb חופשי) */
const objectiveIdOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

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
/* objectiveId: יעד הלמידה של הפריט — רק למבחן סיכום, שבו כל שאלה מתויגת בנפרד (באתגר בודד היעד הוא של ה-ChallengeDef) */
export interface ItemDef { itemIndex: number; prompt: string; options: OptionDef[] | null; objectiveId: string | null }
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
        objectiveId: objectiveIdOf(q.objectiveId),
      }))
    } else if (type === 'moralDilemma') {
      items = [{
        itemIndex: 0,
        prompt: p.situation ?? p.question ?? '',
        options: (Array.isArray(p.moralChoices) ? p.moralChoices : []).map((c, i) => ({ id: `m${i}`, text: c.text ?? '', isCorrect: false })),
        objectiveId: null,
      }]
    } else if (type === 'multipleChoice' || type === 'trueFalse') {
      items = [{
        itemIndex: 0,
        prompt: p.question ?? '',
        options: (Array.isArray(p.choices) ? p.choices : []).map((c, i) => ({ id: c.id ?? String(i), text: c.text ?? '', isCorrect: c.isCorrect === true })),
        objectiveId: null,
      }]
    } else {
      items = [{ itemIndex: 0, prompt: p.question ?? '', options: null, objectiveId: null }]
    }
    out.push({
      sceneId: scene.id, order: out.length + 1, slideOrder: idx + 1,
      title: scene.title ?? scene.id, type, typeLabel: puzzleTypeLabel(type), items,
      objectiveId: objectiveIdOf(p.objectiveId),
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
/* הגרסה האישית ששוחקה (אם בכלל): הגדרות האתגרים שלה לפי סצנה, תגיות המסיחים שלה, והדמיית הגרסה עצמה (לשקפים) */
interface StudentVariant { defs: Map<string, ChallengeDef>; tagByKey: Map<string, CoreOptionTag>; gameData: unknown }
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
  /* שורות ה-answers מצביעות על גרסה אישית (variantId). variant = נתוני הגרסה אם נטענו; null עם variantId = לא נטענו (אין לאן לתרגם) */
  variantId: string | null
  variant: StudentVariant | null
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

/* ── גרסאות אישיות ──
   תלמיד/ה ששיחק/ה בגרסה אישית (quest_variants — חידות שנוצרו מחדש לרמה שלו/ה) ענה/תה על שאלות ואפשרויות שאינן בהדמיית הבסיס. לכן:
   · מסך התלמיד/ה (שאלה, מה ענה/תה, מהי התשובה הנכונה, תגית) נבנה מהגרסה שלו/ה, עם התגיות שלה בלבד.
   · התפלגות האפשרויות הכיתתית (והטעויות הנפוצות) כוללת בחירה של תלמיד/ה כזה/ת רק כשהשאלה והאפשרות זהות לאלה שבבסיס (אותו טקסט,
     אותה נכונות) — אחרת היא אינה נספרת בהתפלגות, אך כן נספרת ב"ניסו" ו"הצליחו" (לפי נכונות התשובה).
   · תגיות הגרסה לעולם לא נכנסות למפת התגיות של הבסיס. */
function studentVariantOf(v: CoreVariant, base: ChallengeDef[]): StudentVariant {
  const baseType = new Map(base.map((b) => [b.sceneId, b.type]))
  const defs = new Map<string, ChallengeDef>()
  for (const vc of extractChallenges(v.gameData)) if (baseType.get(vc.sceneId) === vc.type) defs.set(vc.sceneId, vc)
  const tagByKey = new Map<string, CoreOptionTag>()
  for (const t of v.optionTags ?? []) tagByKey.set(tagKey(t.sceneId, t.itemIndex, t.optionId), t)
  return { defs, tagByKey, gameData: v.gameData }
}

/* מה שוחק באתגר: הבסיס; גרסה (עם ההגדרה שלה); או גרסה שאין לנו את התוכן שלה (לא נטענה / חסרה סצנה) */
type Played = { kind: 'base' } | { kind: 'variant'; def: ChallengeDef } | { kind: 'unknown' }
function playedOf(s: StudentAnalysis, ch: ChallengeDef): Played {
  if (!s.variantId) return { kind: 'base' }
  const def = s.variant?.defs.get(ch.sceneId)
  return def ? { kind: 'variant', def } : { kind: 'unknown' }
}

const normText = (t: string): string => t.replace(/\s+/g, ' ').trim()

/* מזהה אפשרות הבסיס שהבחירה של התלמיד/ה מתאימה לה בהתפלגות; null = אינה ניתנת לשיוך לבסיס (לא נספרת בהתפלגות) */
function basePickOption(s: StudentAnalysis, ch: ChallengeDef, def: ItemDef, selected: string | null): string | null {
  if (selected === null) return null
  const played = playedOf(s, ch)
  if (played.kind === 'base') return selected
  if (played.kind === 'unknown' || !def.options) return null
  const vitem = played.def.items.find((it) => it.itemIndex === def.itemIndex)
  const vopt = vitem?.options?.find((o) => o.id === selected)
  if (!vitem || !vopt || normText(vitem.prompt) !== normText(def.prompt)) return null
  return def.options.find((b) => b.isCorrect === vopt.isCorrect && normText(b.text) === normText(vopt.text))?.id ?? null
}

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

/* איזו הרצה נספרת לתלמיד/ה: ההרצה האחרונה **שהושלמה**. session שנפתח עכשיו (ריק — השליחה מרוכזת בסיום, ולכן עד שהוא מסתיים אין לו
   אירועים או תשובות) אינו מוחק הרצה שהושלמה; רק כשאין שום הרצה שהושלמה נספר ה-session הפתוח האחרון ("באמצע").
   בין שתי הרצות באותו מצב (שתיהן הושלמו / שתיהן פתוחות) — המאוחרת לפי startedAt. */
export function preferSession(cur: CoreSession, next: CoreSession): CoreSession {
  const curDone = !!cur.completedAt
  const nextDone = !!next.completedAt
  if (curDone !== nextDone) return nextDone ? next : cur
  return ts(next.startedAt) > ts(cur.startedAt) ? next : cur
}

function latestSessions(sessions: CoreSession[]): Map<string, CoreSession> {
  const map = new Map<string, CoreSession>()
  for (const s of sessions) {
    const cur = map.get(s.studentId)
    map.set(s.studentId, cur ? preferSession(cur, s) : s)
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

  const variantsById = new Map((input.variants ?? []).map((v) => [v.id, v]))

  const out: StudentAnalysis[] = []
  for (const stu of students) {
    const session = latest.get(stu.id) ?? null
    const status: StudentStatus = !session ? 'not_started' : session.completedAt ? 'completed' : 'in_progress'
    const an: StudentAnalysis = {
      student: stu, status, session, hasRows: false, scenes: new Map(), solved: 0, attempted: 0, gaveUp: 0, reasons: [], variantId: null, variant: null,
    }
    if (session) {
      const rows = answersBySession.get(session.id) ?? []
      an.hasRows = rows.length > 0
      /* ההרצה שנספרת שוחקה בגרסה אישית? (כל שורות ההרצה חולקות variant_id) — הפרומפטים/האפשרויות/התשובה הנכונה נלקחים ממנה, לא מהבסיס */
      an.variantId = rows.find((r) => r.variantId)?.variantId ?? null
      const variant = an.variantId ? variantsById.get(an.variantId) : undefined
      if (variant && variant.studentId === stu.id) an.variant = studentVariantOf(variant, challenges)
      const rowsByScene = groupBy(rows, (r) => r.sceneId)
      const evByScene = puzzleEvBySession.get(session.id)
      for (const ch of challenges) {
        const played = playedOf(an, ch)
        const res = sceneResult(played.kind === 'variant' ? played.def : ch, rowsByScene.get(ch.sceneId) ?? [], evByScene?.get(ch.sceneId) ?? null)
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
        const pick = basePickOption(s, ch, def, ir.selectedOptionId)
        if (picks && pick !== null) picks.get(pick)?.push(s.student.id)
      } else {
        item.attempted++
        if (r.outcome === 'correct') item.solved++
        const ir = r.items.get(def.itemIndex)
        const pick = basePickOption(s, ch, def, ir?.selectedOptionId ?? null)
        if (picks && pick !== null) picks.get(pick)?.push(s.student.id)
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

/* האתגר הקשה ביותר = החלק הגבוה ביותר של מי שניסו ולא הצליחו — טעו, ויתרו או נגמר להם הזמן. אתגר שכולם נטשו יכול להיות הקשה ביותר.
   ההשוואה במספרים שלמים (הכפלה צולבת), כך שסדר האתגרים/התלמידים לא משפיע; שוויון — יותר תלמידים שלא הצליחו, ואז האתגר המוקדם. */
function hardestOf(an: Analysis): ClassSummaryInput['hardest'] {
  const notSolved = (a: ChallengeAgg): number => a.attempted - a.solved
  let best: ChallengeAgg | null = null
  for (const a of an.aggs) {
    if (a.attempted === 0 || notSolved(a) === 0) continue
    if (!best) { best = a; continue }
    const lhs = notSolved(a) * best.attempted
    const rhs = notSolved(best) * a.attempted
    if (lhs > rhs || (lhs === rhs && notSolved(a) > notSolved(best))) best = a
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
  return { title: best.def.title, attempted: best.attempted, wrong: notSolved(best), topErrorOptionText: text, topErrorCount: count }
}

function summaryInput(an: Analysis): ClassSummaryInput {
  const c = countsOf(an)
  const done = an.students.filter((s) => s.status === 'completed')
  const total = an.challenges.length
  /* חלק האתגרים שנפתרו בממוצע = סך הפתרונות חלקי (מי שסיימו × האתגרים): מספרים שלמים, כך שסדר השמות לא משנה את המשפט בגבולות 0.5 / 0.75 */
  const solvedSum = done.reduce((sum, s) => sum + s.solved, 0)
  const avg = done.length > 0 && total > 0 ? solvedSum / (done.length * total) : null
  return { ...c, avgSolvedShare: avg, totalChallenges: total, hardest: hardestOf(an) }
}

/* יעדי הלמידה שהוגדרו בהדמיה (game_data.objectives), בלי כפילויות ובלי רשומות פגומות */
export function questObjectives(gameData: unknown): { id: string; text: string }[] {
  const raw = (gameData as GameDataLike | null)?.objectives
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: { id: string; text: string }[] = []
  for (const o of raw) {
    const id = objectiveIdOf(o?.id)
    const text = typeof o?.text === 'string' ? o.text.trim() : ''
    if (!id || !text || seen.has(id)) continue
    seen.add(id)
    out.push({ id, text })
  }
  return out
}

/* ── יעדי למידה: כמה תלמידים הצליחו בכל יעד, ומי מתקשה ──
   · יחידה = אתגר שתויג ביעד (puzzle.objectiveId), או שאלה במבחן סיכום שתויגה בנפרד (questions[].objectiveId; שאלה בלי תיוג
     יורשת את תיוג המבחן). מקור התוצאה: answers (פירוט, גם פר-שאלה); בלי פירוט — events (אתגר שלם; מבחן סיכום רק אם תויג כולו).
   · שאלות מוסר אינן יחידה: אין בהן נכון/שגוי ("נפתר" = ניסה), והן היו מנפחות את ההצלחה ביעד.
   · תלמיד/ה "הצליח/ה ביעד" כשהצליח/ה לפחות OBJECTIVE_BANDS.partial מיחידות היעד שניסה; פחות מזה = מתקשה (weakStudents).
   · רמת היעד לפי חלק התלמידים שהצליחו מבין מי שניסה: strong ≥ OBJECTIVE_BANDS.strong, partial ≥ OBJECTIVE_BANDS.partial, אחרת weak.
   · יעד שאף אתגר/שאלה לא תויגו בו (או רק שאלות מוסר) אינו ניתן למדידה ולא מוצג. מי שלא סיים לא נספר (אין לו שורות). */
/* יחידת מדידה: אתגר שלם (itemIndex=null) או שאלה במבחן סיכום */
export interface ReviewUnit { sceneId: string; itemIndex: number | null }

function objectiveResults(an: Analysis): ObjectiveResult[] {
  return objectiveAnalysis(an).results
}

function objectiveAnalysis(an: Analysis): { results: ObjectiveResult[]; units: Map<string, ReviewUnit[]> } {
  const units = new Map<string, ReviewUnit[]>()
  const defs = questObjectives(an.input.submission.quest.gameData)
  if (defs.length === 0) return { results: [], units }
  const known = new Set(defs.map((d) => d.id))
  const measurable = new Set<string>()
  const addUnit = (objectiveId: string, u: ReviewUnit): void => { units.set(objectiveId, [...(units.get(objectiveId) ?? []), u]) }
  /* יעד → תלמיד → יחידות שניסה / הצליח */
  const perObjective = new Map<string, Map<string, { attempted: number; solved: number }>>()
  const count = (objectiveId: string, studentId: string, solved: boolean): void => {
    const byStudent = perObjective.get(objectiveId) ?? new Map<string, { attempted: number; solved: number }>()
    const c = byStudent.get(studentId) ?? { attempted: 0, solved: 0 }
    c.attempted++
    if (solved) c.solved++
    byStudent.set(studentId, c)
    perObjective.set(objectiveId, byStudent)
  }

  for (const ch of an.challenges) {
    if (ch.type === 'moralDilemma') continue
    const whole = ch.objectiveId && known.has(ch.objectiveId) ? ch.objectiveId : null
    const itemObjective = (item: ItemDef): string | null => {
      const id = item.objectiveId ?? ch.objectiveId
      return id && known.has(id) ? id : null
    }
    if (whole) { measurable.add(whole); if (ch.type !== 'finalQuiz') addUnit(whole, { sceneId: ch.sceneId, itemIndex: null }) }
    if (ch.type === 'finalQuiz') {
      for (const item of ch.items) { const id = itemObjective(item); if (id) { measurable.add(id); addUnit(id, { sceneId: ch.sceneId, itemIndex: item.itemIndex }) } }
    }

    for (const s of an.students) {
      const res = s.scenes.get(ch.sceneId)
      if (!res || res.outcome === 'not_reached') continue
      if (ch.type === 'finalQuiz' && res.items.size > 0) {
        for (const item of ch.items) {
          const id = itemObjective(item)
          const ir = res.items.get(item.itemIndex)
          if (id && ir) count(id, s.student.id, ir.isCorrect)
        }
      } else if (whole) {
        count(whole, s.student.id, res.outcome === 'correct')
      }
    }
  }

  const results = defs.filter((d) => measurable.has(d.id)).map((d): ObjectiveResult => {
    const byStudent = perObjective.get(d.id) ?? new Map<string, { attempted: number; solved: number }>()
    let attempted = 0
    let solved = 0
    const weakStudents: { id: string; name: string }[] = []
    for (const [studentId, c] of byStudent) {
      attempted++
      if (c.solved / c.attempted >= OBJECTIVE_BANDS.partial) solved++
      else weakStudents.push({ id: studentId, name: an.byStudent.get(studentId)?.student.name ?? '' })
    }
    const share = attempted > 0 ? solved / attempted : 0
    const level: ObjectiveLevel | null = attempted === 0 ? null : share >= OBJECTIVE_BANDS.strong ? 'strong' : share >= OBJECTIVE_BANDS.partial ? 'partial' : 'weak'
    return { id: d.id, text: d.text, attempted, solved, level, levelText: objectiveLevelText(level), weakStudents: weakStudents.sort(byName) }
  })
  return { results, units }
}

/* ── תחומים לחיזוק (הצעה ל"תרגול חזרה", ויצירת הדמיית החזרה עצמה) ──
   מקור אחד לספירה שבמסך ולרשימה שנקודת ההקצאה מקבלת, כך שהם מסכימים תמיד:
   · יש יעדי למידה שאפשר למדוד (הטאב "יעדי הלמידה" קיים): תחום = יעד ברמה "עדיין קשה" — בדיוק מה שהטאב מציג.
   · אין: תחום = אתגר שפחות מ-WEAK_RATE ממי שניסו הצליחו בו (לפחות WEAK_MIN_ATTEMPTS ניסו). דילמת מוסר אינה נספרת (אין בה נכון/שגוי);
     במבחן סיכום (עם פירוט) כל שאלה נספרת בנפרד.
   · מתחת ל-REVIEW_MIN_COMPLETED תלמידים שסיימו אין הצעה בכלל. */
export interface ReviewConcept {
  /* יעד הלמידה, אם התחום הוא יעד */
  objectiveId: string | null
  text: string
  /* חלק ההצלחה (0..1): בין התלמידים שניסו את היעד, או בין מי שניסו את האתגר */
  successRate: number
  units: ReviewUnit[]
}

export function reviewConceptsOf(an: Analysis): ReviewConcept[] {
  const completed = an.students.filter((s) => s.status === 'completed').length
  if (completed < REVIEW_MIN_COMPLETED) return []
  const { results, units } = objectiveAnalysis(an)
  const out: ReviewConcept[] = []
  if (results.length > 0) {
    for (const o of results) {
      if (o.level === 'weak') out.push({ objectiveId: o.id, text: o.text, successRate: o.attempted > 0 ? o.solved / o.attempted : 0, units: units.get(o.id) ?? [] })
    }
  } else {
    const weak = (attempted: number, solved: number): boolean => attempted >= WEAK_MIN_ATTEMPTS && solved / attempted < WEAK_RATE
    for (const agg of an.aggs) {
      if (agg.def.type === 'moralDilemma') continue
      if (agg.def.type === 'finalQuiz' && agg.hasDetail) {
        for (const item of agg.items) {
          if (weak(item.attempted, item.solved)) {
            out.push({ objectiveId: null, text: item.def.prompt || agg.def.title, successRate: item.solved / item.attempted, units: [{ sceneId: agg.def.sceneId, itemIndex: item.def.itemIndex }] })
          }
        }
      } else if (weak(agg.attempted, agg.solved)) {
        out.push({ objectiveId: null, text: agg.def.title, successRate: agg.solved / agg.attempted, units: [{ sceneId: agg.def.sceneId, itemIndex: null }] })
      }
    }
  }
  return out.sort((a, b) => a.successRate - b.successRate)
}

/* בסיס הדמיית חזרה לשליחה אחת — לנקודת ההקצאה (review-quest): כמה סיימו, והתחומים לחיזוק */
export function buildReviewBasis(input: CoreInput): { completed: number; concepts: ReviewConcept[] } {
  const an = analyzeSubmission(input)
  return { completed: an.students.filter((s) => s.status === 'completed').length, concepts: reviewConceptsOf(an) }
}

/* האם יש פירוט תשובות לשליחה: נתונים בפועל, או שהיא נשלחה אחרי שהלכידה התחילה.
   ההשוואה ביום ישראלי (Asia/Jerusalem) ולא ברגע: שליחה באותו יום ישראלי כמו התשובה הראשונה שנלכדה נחשבת שיש לה פירוט,
   וזה בדיוק היום שהטקסט "פירוט התשובות זמין מ-…" מציג (dateHe). */
function submissionDetail(an: Analysis): boolean {
  if (an.hasAnswerRows) return true
  const from = an.input.detailAvailableFrom
  if (from === null) return false
  const sent = israelDayKey(an.input.submission.sentAt)
  const first = israelDayKey(from)
  return sent !== null && first !== null && sent >= first
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

/* התפלגות בחירות בדילמה מוסרית. ב-moral_choices אין שם/תלמיד בכוונה — לכן התפלגות על מעט תלמידים הייתה מאפשרת לזהות מי בחר מה
   (תלמיד/ה בודד/ת ששיחק/ה שוב ושוב נראה כקבוצה). מוצגת רק כשיש לפחות MORAL_MIN_ROWS שורות בחירה **וגם** לפחות MORAL_MIN_COMPLETED
   תלמידים שסיימו; אחרת options=null ("אין פירוט"). בחירות בגרסה אישית (variantId) אינן ניתנות לשיוך לאפשרויות הבסיס ולא נספרות. */
function moralOptions(an: Analysis, agg: ChallengeAgg): OptionCount[] | null {
  const rows = (an.input.moral ?? []).filter((m) => m.sceneId === agg.def.sceneId && !m.variantId)
  const opts = agg.def.items[0]?.options
  /* אין שורות moral_choices (הדמיה ישנה / עוד לא נשלחו) = אין פירוט */
  if (!opts || opts.length === 0 || rows.length === 0) return null
  const completed = an.students.filter((s) => s.status === 'completed').length
  if (rows.length < MORAL_MIN_ROWS || completed < MORAL_MIN_COMPLETED) return null
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
  const objectives = objectiveResults(an)
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
    objectives,
    review: { weakCount: reviewConceptsOf(an).length },
    howWeCalculated: objectives.length > 0 ? [...howWeCalcResultsLines(), ...howWeCalcObjectivesLines(OBJECTIVE_BANDS)] : howWeCalcResultsLines(),
  }
}

/* ── מצב "לפי תלמיד" ── */
/* פריטי אתגר אחד של תלמיד/ה. שאלה, אפשרויות, תשובה נכונה ותגית נלקחות מהגרסה ששוחקה (בסיס או גרסה אישית) —
   ואם שוחקה גרסה שאין לנו את תוכנה, לא מנחשים מהבסיס: מציגים רק נכון/לא נכון, בלי טקסט תשובה. */
function studentItems(an: Analysis, s: StudentAnalysis, ch: ChallengeDef, res: SceneRes | undefined, stuOutcome: Outcome): StudentItem[] {
  if (!res || stuOutcome === 'not_reached') return []
  const played = playedOf(s, ch)
  const defs = played.kind === 'variant' ? played.def.items : ch.items
  const tags = played.kind === 'variant' ? (s.variant?.tagByKey ?? new Map<string, CoreOptionTag>()) : an.tagByKey
  const out: StudentItem[] = []
  for (const def of defs) {
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
    if (played.kind === 'unknown') {
      out.push({ itemIndex: def.itemIndex, prompt: def.prompt, answerText: null, correctText: null, isCorrect: ir.isCorrect, errorTag: null, attempts: ir.attempts, seconds: ir.seconds })
      continue
    }
    const opts = def.options
    const selected = ir.selectedOptionId !== null ? opts?.find((o) => o.id === ir.selectedOptionId) : undefined
    const tag = selected && !selected.isCorrect ? tags.get(tagKey(ch.sceneId, def.itemIndex, selected.id)) : undefined
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
  /* תלמיד/ה בגרסה אישית קרא/ה את הנרטיב של הגרסה (כתוב לרמת הקריאה שלו/ה) — ספירת המילים לפיו */
  const scenes = scenesOf(s.variant?.gameData ?? an.input.submission.quest.gameData)
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
    const items = studentItems(an, s, ch, res, outcome)
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
      attempted: s.attempted, solved: s.solved, gaveUp: s.gaveUp, attentionReasons: s.reasons,
    }),
    detailAvailableFrom: detail ? null : input.detailAvailableFrom,
    hasAnswerDetail: detail,
    challenges,
    slides: slideFacts(an, s),
    howWeCalculated: howWeCalcResultsLines(),
  }
}
