import { z } from 'zod'
import { supabaseAdmin } from './supabase.js'
import { hasAnswerLevel, hasQuestSubjectId, hasQuestVariants } from './activeColumn.js'
import {
  ANSWER_SCHEMA_VERSION, validLevel, MAX_ANSWER_ROWS, MAX_GATE_EVENTS, MAX_INTERACTION_BYTES, MAX_INTERACTION_EVENTS, GATE_EVENT_TYPES, capInteraction,
} from '../../../src/shared/lib/answerTelemetry.js'

/* ── כתיבת טלמטריית תשובות (שלב 1B) ───────────────────────────────────────────
   · כל הפרסור סובלני: שורה פגומה נזרקת, לא מפילה את ה-complete (כיול 60/80 נשאר).
   · subject_id / class_id / student_id / variant_id נלקחים כאן בשרת — לעולם לא מהקליינט.
   · אידמפוטנטי: upsert לפי client_event_id (ignoreDuplicates).
   · דילמות מוסריות: moral_choices בלבד, בלי student_id ובלי session_id. */

const OUTCOMES = ['correct', 'wrong', 'timeout', 'gave_up', 'closed'] as const

const answerWire = z.object({
  clientEventId: z.string().min(3).max(220),
  sceneId: z.string().min(1).max(120),
  itemIndex: z.number().int().min(0).max(60),
  puzzleType: z.string().min(1).max(40),
  selectedOptionId: z.string().max(240).nullable(),
  selectedPosition: z.number().int().min(0).max(60).nullable(),
  correctPosition: z.number().int().min(-1).max(60).nullable(),
  displayedOrder: z.array(z.string().max(120)).max(40).nullable(),
  isCorrect: z.boolean(),
  attemptNo: z.number().int().min(1).max(200),
  responseMs: z.number().min(0).max(6 * 3600_000).nullable(),
  outcome: z.enum(OUTCOMES),
  interaction: z.record(z.string(), z.unknown()).nullable(),
  /* הרמה שבה שוחק האתגר (1-20) והממד. ערך לא תקין נזרק (catch → undefined) ולא מפיל את השורה */
  levelAtPlay: z.number().int().min(1).max(20).nullable().optional().catch(undefined),
  levelDimension: z.string().max(40).nullable().optional().catch(undefined),
})
export type AnswerWireParsed = z.infer<typeof answerWire>

const moralWire = z.object({ sceneId: z.string().min(1).max(120), optionId: z.string().min(1).max(40) })

const gateWire = z.object({
  type: z.enum(GATE_EVENT_TYPES as unknown as [string, ...string[]]),
  sceneId: z.string().max(120).nullable(),
  payload: z.record(z.string(), z.unknown()),
  clientTs: z.number(),
})

/* מחזיר רק שורות תקינות, עד התקרה */
function parseRows<T>(raw: unknown, schema: z.ZodType<T>, max: number): T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  for (const r of raw) {
    if (out.length >= max) break
    const p = schema.safeParse(r)
    if (p.success) out.push(p.data)
  }
  return out
}

/* חיתוך JSON לתקרת בתים — אותה פונקציה כמו בקליינט (shared); השרת מקצץ שוב כהגנה */
export function capJsonBytes(obj: Record<string, unknown> | null, maxBytes = MAX_INTERACTION_BYTES): Record<string, unknown> | null {
  return capInteraction(obj, MAX_INTERACTION_EVENTS, maxBytes)
}

export interface AnswerContext {
  sessionId: string
  studentId: string
  classId: string | null
  questId: string
  variantId: string | null
  subjectId: string | null
  /* עמודות הרמה קיימות במסד (lesson_summary_data.sql). בלעדיהן לא כותבים אותן — insert עם עמודה לא קיימת היה מפיל את כל האצווה */
  withLevel?: boolean
  /* sceneId → puzzle.difficulty מה-game_data ששוחק; משלים כשהקליינט (ישן) לא שלח רמה */
  derivedLevels?: Map<string, number> | null
}

/* טהור: שורת insert ל-answers. outcome הוא מקור האמת ל-is_correct (עקביות). */
export function toAnswerRow(a: AnswerWireParsed, ctx: AnswerContext) {
  return {
    client_event_id: a.clientEventId,
    session_id: ctx.sessionId,
    student_id: ctx.studentId,
    class_id: ctx.classId,
    quest_id: ctx.questId,
    variant_id: ctx.variantId,
    scene_id: a.sceneId,
    item_index: a.itemIndex,
    puzzle_type: a.puzzleType,
    subject_id: ctx.subjectId,
    selected_option_id: a.selectedOptionId,
    selected_position: a.selectedPosition,
    correct_position: a.correctPosition !== null && a.correctPosition < 0 ? null : a.correctPosition,
    displayed_order: a.displayedOrder,
    is_correct: a.outcome === 'correct',
    attempt_no: a.attemptNo,
    response_ms: a.responseMs === null ? null : Math.round(a.responseMs),
    outcome: a.outcome,
    interaction: capJsonBytes(a.interaction),
    schema_version: ANSWER_SCHEMA_VERSION,
    is_synthetic: false,
    ...(ctx.withLevel ? levelColumns(a, ctx) : {}),
  }
}

/* הרמה בפועל: מה שהקליינט דיווח (puzzle.difficulty שהוא ראה); אחרת מה-game_data ששוחק; אחרת NULL (לא משווים). הממד = סוג האתגר */
function levelColumns(a: AnswerWireParsed, ctx: AnswerContext): { level_at_play: number | null; level_dimension: string | null } {
  const level = validLevel(a.levelAtPlay) ?? validLevel(ctx.derivedLevels?.get(a.sceneId))
  return { level_at_play: level, level_dimension: level === null ? null : (a.levelDimension ?? a.puzzleType) }
}

/* sceneId → puzzle.difficulty של ה-game_data ששוחק (גרסה אישית אם יש; אחרת הבסיס) */
export async function levelsFromGameData(questId: string, variantId: string | null): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const q = variantId
      ? await supabaseAdmin.from('quest_variants').select('game_data').eq('id', variantId).maybeSingle()
      : await supabaseAdmin.from('quests').select('game_data').eq('id', questId).maybeSingle()
    const scenes = ((q.data as { game_data?: { scenes?: { id?: string; puzzle?: { difficulty?: unknown } }[] } } | null)?.game_data?.scenes) ?? []
    for (const s of scenes) { const lv = validLevel(s.puzzle?.difficulty); if (s.id && lv !== null) out.set(s.id, lv) }
  } catch { /* best-effort */ }
  return out
}

export function parseAnswers(raw: unknown) { return parseRows(raw, answerWire, MAX_ANSWER_ROWS) }
export function parseMoral(raw: unknown) { return parseRows(raw, moralWire, 40) }
export function parseGateEvents(raw: unknown) { return parseRows(raw, gateWire, MAX_GATE_EVENTS) }

/* שורות events לשערים/מפתחות/בחירות — payload מצומצם (מפתחות מותרים בלבד) */
const GATE_PAYLOAD_KEYS = ['itemId', 'sceneId', 'choiceId', 'blocked'] as const
export function toGateEventRow(g: z.infer<typeof gateWire>, base: { session_id: string; user_id: string; quest_id: string }) {
  const payload: Record<string, unknown> = { clientTs: g.clientTs }
  for (const k of GATE_PAYLOAD_KEYS) {
    const v = g.payload[k]
    if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') payload[k] = v
  }
  return { ...base, type: g.type, scene_id: g.sceneId, payload }
}

/* ── כתיבה ל-DB (best-effort; לעולם לא זורק) ── */
export async function writeAnswerTelemetry(opts: {
  sessionId: string
  studentId: string
  classId: string | null
  questId: string
  answers: AnswerWireParsed[]
  moral: z.infer<typeof moralWire>[]
  /* האם זו שליחה חוזרת של אותו complete — דילמות לא נכתבות שוב (אין מפתח אידמפוטנטי: בלי student_id) */
  isRetry: boolean
}): Promise<{ answers: number; moral: number }> {
  const out = { answers: 0, moral: 0 }
  try {
    if (opts.answers.length === 0 && opts.moral.length === 0) return out
    let subjectId: string | null = null
    if (await hasQuestSubjectId()) {
      const { data } = await supabaseAdmin.from('quests').select('subject_id').eq('id', opts.questId).maybeSingle()
      subjectId = (data as { subject_id?: string | null } | null)?.subject_id ?? null
    }
    let variantId: string | null = null
    if (await hasQuestVariants()) {
      const { data } = await supabaseAdmin.from('quest_variants').select('id').eq('quest_id', opts.questId).eq('student_id', opts.studentId).maybeSingle()
      variantId = (data as { id?: string } | null)?.id ?? null
    }
    const withLevel = await hasAnswerLevel()
    const derivedLevels = withLevel && opts.answers.some((a) => validLevel(a.levelAtPlay) === null) ? await levelsFromGameData(opts.questId, variantId) : null
    const ctx: AnswerContext = { sessionId: opts.sessionId, studentId: opts.studentId, classId: opts.classId, questId: opts.questId, variantId, subjectId, withLevel, derivedLevels }

    if (opts.answers.length > 0) {
      const rows = opts.answers.map((a) => toAnswerRow(a, ctx))
      const { error } = await supabaseAdmin.from('answers').upsert(rows, { onConflict: 'client_event_id', ignoreDuplicates: true })
      if (!error) out.answers = rows.length
    }
    if (opts.moral.length > 0 && !opts.isRetry) {
      const rows = opts.moral.map((m) => ({ quest_id: opts.questId, variant_id: variantId, scene_id: m.sceneId, option_id: m.optionId, class_id: opts.classId }))
      const { error } = await supabaseAdmin.from('moral_choices').insert(rows)
      if (!error) out.moral = rows.length
    }
  } catch {
    /* טלמטריה — best-effort */
  }
  return out
}
