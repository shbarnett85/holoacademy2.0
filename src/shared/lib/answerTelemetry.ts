/* ── טלמטריית תשובות — לוגיקה טהורה משותפת (קליינט + שרת + בדיקות) ──────────────
   אין כאן DOM ואין React. מגדיר:
   · ערבוב-בהצגה של אפשרויות (בחירה מרובה / מבחן סיכום) תוך שמירת מיפוי לאפשרות המקורית.
   · הפיכת רשומת-הצגה (presentation) לשורות answers.
   · ספירת מילים של שקופית (פונקציה אחת בכל מקום).
   **לא נוגע בלוגיקת הפאזלים** — בדיקת נכונות/ניקוד/onResult נשארים בקומפוננטות. */

export const ANSWER_SCHEMA_VERSION = 1
/* אנימציית הכניסה של האתגר (DigitalEntrance) = 0.8ש׳; מאותו רגע האתגר מוכן לאינטראקציה */
export const PUZZLE_READY_DELAY_MS = 800
/* תקרות גודל — מונעות פיצוץ payload (גם בצד השרת, שמקצץ מחדש) */
export const MAX_INTERACTION_EVENTS = 200
export const MAX_INTERACTION_BYTES = 12000
export const MAX_ANSWER_ROWS = 400
export const MAX_GATE_EVENTS = 300

/* ── ערבוב בזמן הצגה ───────────────────────────────────────────────────────── */

/* Fisher-Yates על עותק. rand ניתן להזרקה לבדיקות דטרמיניסטיות. */
export function shuffleIndices(n: number, rand: () => number = Math.random): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export interface ChoiceLike { id: string; text: string; isCorrect: boolean }

export interface PresentedChoices<C extends ChoiceLike> {
  /* האפשרויות בסדר ההצגה — אותם אובייקטים (id/isCorrect נשמרים) */
  choices: C[]
  /* מזהי האפשרויות בסדר ההצגה */
  displayedOrder: string[]
  correctPosition: number
}

/* בחירה מרובה: מערבב את האפשרויות. נכון/לא-נכון (שתי אפשרויות בדיוק עם id t/f או "נכון"/"לא נכון")
   נשאר בסדר קבוע. correctPosition = מיקום האפשרות הנכונה אחרי הערבוב. */
export function presentChoices<C extends ChoiceLike>(choices: C[], opts: { fixed?: boolean; rand?: () => number } = {}): PresentedChoices<C> {
  const order = opts.fixed ? choices.map((_, i) => i) : shuffleIndices(choices.length, opts.rand)
  const shown = order.map((i) => choices[i])
  return {
    choices: shown,
    displayedOrder: shown.map((c) => c.id),
    correctPosition: shown.findIndex((c) => c.isCorrect),
  }
}

/* נכון/לא-נכון: שני כפתורים בסדר קבוע — לא מערבבים */
export function isTrueFalse(type: string | undefined, choices: ChoiceLike[] | undefined): boolean {
  return type === 'trueFalse' || (!!choices && choices.length === 2 && choices.every((c) => /^(t|f|true|false)$/i.test(c.id)))
}

export interface QuizQuestionLike {
  question: string
  options: string[]
  correctIndex: number
  explanationCorrect?: string
  explanationIncorrect?: string
}
export interface PresentedQuizQuestion extends QuizQuestionLike {
  /* אינדקסי האפשרויות *המקוריות* בסדר ההצגה (option_id = 'o<originalIndex>') */
  order: number[]
}

/* מבחן סיכום: מערבב את options ומיישר את correctIndex לסדר החדש, כך שהלוגיקה הקיימת
   (i === q.correctIndex) ממשיכה לעבוד ללא שינוי על הנתונים המוצגים. */
export function presentQuizQuestion(q: QuizQuestionLike, rand: () => number = Math.random): PresentedQuizQuestion {
  const order = shuffleIndices(q.options.length, rand)
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
    order,
  }
}

export const quizOptionId = (originalIndex: number) => `o${originalIndex}`

/* ── ספירת מילים של שקופית — פונקציה אחת (קליינט שולח, שרת מאמת) ── */
export function wordCount(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}
export function slideWordCount(scene: { narrative?: string | null; drHoloDialog?: string | null }): number {
  return wordCount(scene.narrative) + wordCount(scene.drHoloDialog)
}

/* ── רשומות ─────────────────────────────────────────────────────────────────── */
export type AnswerOutcome = 'correct' | 'wrong' | 'timeout' | 'gave_up' | 'closed'

export interface InteractionEvent { k: string; t: number; [key: string]: unknown }

/* שורת answers כפי שהקליינט מייצר (לפני הוספת sessionId/מזהים בשרת) */
export interface AnswerRecord {
  /* מזהה מקומי יציב: scene:item:presentationSeq — השרת מוסיף את sessionId */
  localId: string
  sceneId: string
  itemIndex: number
  puzzleType: string
  selectedOptionId: string | null
  selectedPosition: number | null
  correctPosition: number | null
  displayedOrder: string[] | null
  isCorrect: boolean
  attemptNo: number
  responseMs: number | null
  outcome: AnswerOutcome
  interaction: { events?: InteractionEvent[]; truncated?: boolean; [key: string]: unknown } | null
  /* הרמה (1-20) שבה האתגר שוחק בפועל = puzzle.difficulty של ה-game_data שהתלמיד/ה קיבל/ה (גרסה אישית או בסיס); null כשאין.
     levelDimension = סוג האתגר (מפתח per_puzzle_level). השוואה בין תלמידים נעשית רק באותו ממד וברמות קרובות. */
  levelAtPlay?: number | null
  levelDimension?: string | null
}

/* טעויות ברצף באתגר הפתוח — לכלל "נתקע" בתצוגה החיה (LIVE_RULES.stuckMistakes). רצף = הפעולות האחרונות שהיו טעות, עד פעולה נכונה.
   טעות: סידור/השלמה שהוגשו לא נכון, החלפת אריחים "גרועה", התאמה שגויה בזיכרון, אות שגויה בתפזורת/קוד. פעולה נכונה (כולל מילה שנמצאה) מאפסת. */
export function trailingMistakes(events: readonly { k: string; [key: string]: unknown }[]): number {
  let streak = 0
  for (const e of events) {
    if (e.k === 'submit' || e.k === 'attempt' || e.k === 'letter') streak = e.correct === true ? 0 : e.correct === false ? streak + 1 : streak
    else if (e.k === 'swap') streak = e.bad === true ? streak + 1 : 0
    else if (e.k === 'pair') streak = e.match === true ? 0 : e.match === false ? streak + 1 : streak
    else if (e.k === 'word_found') streak = 0
  }
  return streak
}

/* רמה תקפה (שלם 1-20) או null — puzzle.difficulty מגיע מ-JSON חופשי */
export function validLevel(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 20 ? Math.round(v) : null
}

export interface MoralChoiceRecord { sceneId: string; optionId: string }

/* אירועי שערים/מפתחות/בחירות — היום נזרקים; מ-1B נשלחים ל-events (types קיימים ב-enum) */
export type GateEventType = 'item_used' | 'item_used_wrong' | 'choice_made' | 'item_collected'
export const GATE_EVENT_TYPES: readonly GateEventType[] = ['item_used', 'item_used_wrong', 'choice_made', 'item_collected']
export interface GateEvent { type: GateEventType; sceneId: string | null; payload: Record<string, unknown>; clientTs: number }

/* מה שנשמר מקומית ל-resume — כך טלמטריה לא אובדת ברענון באמצע הדמיה */
export interface TelemetrySnapshot {
  answers: AnswerRecord[]
  moral: MoralChoiceRecord[]
  gate: GateEvent[]
  /* מספר ההצגות שכבר נוצרו לכל סצנה (למניעת התנגשות client_event_id אחרי resume) */
  seqs: Record<string, number>
}

/* מה שמחזיר PuzzleTelemetry.finish(...) */
export interface PresentationRecord {
  sceneId: string
  puzzleType: string
  /* הצגה מס' N של האתגר בסצנה (פתיחה/סגירה חוזרת = הצגה חדשה) */
  seq: number
  answers: AnswerRecord[]
  moral: MoralChoiceRecord | null
}

/* חיתוך interaction לתקרת גודל: כל מערך פנימי (events/flips/pairs/swaps/attempts/...) נחתך ל-maxEvents
   מהסוף, ואז הגדולים נחתכים בהדרגה עד שנכנס ל-maxBytes. מסומן truncated. טהור (משמש גם את השרת). */
export function capInteraction<T extends Record<string, unknown> | null>(it: T, maxEvents = MAX_INTERACTION_EVENTS, maxBytes = MAX_INTERACTION_BYTES): T {
  if (!it) return it
  const out: Record<string, unknown> = { ...it }
  const size = () => JSON.stringify(out).length
  let truncated = false
  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v) && v.length > maxEvents) { out[k] = v.slice(0, maxEvents); truncated = true }
  }
  for (let guard = 0; guard < 30 && size() > maxBytes; guard++) {
    let key: string | null = null
    let len = 1
    for (const [k, v] of Object.entries(out)) if (Array.isArray(v) && v.length > len) { key = k; len = v.length }
    if (!key) break
    const arr = out[key] as unknown[]
    out[key] = arr.slice(0, Math.max(1, Math.floor(arr.length * 0.8)))
    truncated = true
  }
  if (size() > maxBytes) return { truncated: true } as unknown as T
  if (truncated) out.truncated = true
  return out as T
}

/* ── PuzzleTelemetry — נאסף בתוך הצגה אחת של אתגר ─────────────────────────────
   הקומפוננטות מקבלות אותו כ-prop אופציונלי וקוראות act(...) *לצד* הלוגיקה הקיימת.
   כל כשל כאן נבלע — טלמטריה לעולם לא מפילה אתגר. */
export interface PuzzleTelemetry {
  markReady(): void
  /* פעולת תלמיד. kind חופשי (flip/swap/submit/attempt/letter/word_found/gave_up/timeout/...) */
  act(kind: string, data?: Record<string, unknown>): void
  /* קובע את סדר ההצגה של אפשרויות (בחירה מרובה) */
  setDisplay(displayedOrder: string[], correctPosition: number): void
  /* מבחן סיכום: שורה אחת לכל שאלה. t = חותמת פעולה, shownAt = מתי הוצגה */
  quizItem(item: { itemIndex: number; selectedOptionId: string; selectedPosition: number; correctPosition: number; displayedOrder: string[]; isCorrect: boolean; shownAt: number; answeredAt: number }): void
  /* משתמשים פנימית */
  readonly state: TelemetryState
}

export interface TelemetryState {
  readyAt: number | null
  lastActionAt: number | null
  events: InteractionEvent[]
  droppedEvents: number
  displayedOrder: string[] | null
  correctPosition: number | null
  quizItems: { itemIndex: number; selectedOptionId: string; selectedPosition: number; correctPosition: number; displayedOrder: string[]; isCorrect: boolean; responseMs: number }[]
  gaveUp: boolean
  timedOut: boolean
}

export function createPuzzleTelemetry(now: () => number = Date.now): PuzzleTelemetry {
  const state: TelemetryState = {
    readyAt: null, lastActionAt: null, events: [], droppedEvents: 0,
    displayedOrder: null, correctPosition: null, quizItems: [], gaveUp: false, timedOut: false,
  }
  return {
    state,
    markReady() {
      if (state.readyAt === null) state.readyAt = now()
    },
    act(kind, data) {
      try {
        const t = now()
        /* פעולה לפני שהאנימציה הסתיימה — האתגר בפועל כבר היה זמין */
        if (state.readyAt === null) state.readyAt = t
        state.lastActionAt = t
        if (kind === 'gave_up') state.gaveUp = true
        if (kind === 'timeout') state.timedOut = true
        if (state.events.length >= MAX_INTERACTION_EVENTS) { state.droppedEvents++; return }
        state.events.push({ k: kind, t: t - state.readyAt, ...(data ?? {}) })
      } catch { /* טלמטריה לא חוסמת */ }
    },
    setDisplay(displayedOrder, correctPosition) {
      state.displayedOrder = displayedOrder
      state.correctPosition = correctPosition
    },
    quizItem(item) {
      try {
        state.lastActionAt = item.answeredAt
        if (state.readyAt === null) state.readyAt = item.shownAt
        state.quizItems.push({
          itemIndex: item.itemIndex, selectedOptionId: item.selectedOptionId, selectedPosition: item.selectedPosition,
          correctPosition: item.correctPosition, displayedOrder: item.displayedOrder, isCorrect: item.isCorrect,
          responseMs: Math.max(0, item.answeredAt - item.shownAt),
        })
      } catch { /* ignore */ }
    },
  }
}

/* ── בניית שורות מתוך הצגה שהסתיימה (טהור — נבדק לכל סוג אתגר) ── */
export interface FinishInput {
  sceneId: string
  puzzleType: string
  seq: number
  /* תוצאת onResult הקיימת; null = נסגר בלי תשובה */
  result: { correct: boolean; score?: number } | null
  /* הרמה שבה האתגר מוצג (puzzle.difficulty); חסר = לא ידוע */
  level?: number | null
  /* מטא האתגר מהנתונים (לפי סוג) */
  puzzle: {
    choices?: ChoiceLike[]
    items?: { id: string; text: string }[]
    correctOrder?: string[]
    questions?: { options: string[]; correctIndex: number }[]
    moralChoices?: unknown[]
  }
}

function outcomeOf(st: TelemetryState, result: FinishInput['result']): AnswerOutcome {
  if (result === null) return 'closed'
  if (result.correct) return 'correct'
  if (st.gaveUp) return 'gave_up'
  if (st.timedOut) return 'timeout'
  return 'wrong'
}

const lastOf = (st: TelemetryState, kind: string) => [...st.events].reverse().find((e) => e.k === kind)
const countOf = (st: TelemetryState, kind: string) => st.events.filter((e) => e.k === kind).length

export function buildPresentation(tel: PuzzleTelemetry, input: FinishInput): PresentationRecord {
  const rec = buildPresentationRows(tel, input)
  const level = validLevel(input.level)
  return level === null ? rec : { ...rec, answers: rec.answers.map((a) => ({ ...a, levelAtPlay: level, levelDimension: a.puzzleType })) }
}

function buildPresentationRows(tel: PuzzleTelemetry, input: FinishInput): PresentationRecord {
  const st = tel.state
  const { sceneId, puzzleType, seq, result } = input
  const base = { sceneId, puzzleType, seq }
  const outcome = outcomeOf(st, result)
  const responseMs = st.lastActionAt !== null && st.readyAt !== null ? Math.max(0, st.lastActionAt - st.readyAt) : null
  const cap = (it: AnswerRecord['interaction']) => {
    const o: Record<string, unknown> = it ? { ...it } : {}
    if (st.droppedEvents > 0) o.truncated = true
    return capInteraction(o) as AnswerRecord['interaction']
  }
  const id = (item: number) => `${sceneId}:${item}:${seq}`

  /* דילמה מוסרית — לא נכתבת ל-answers (בלי student_id; רק moral_choices) */
  if (puzzleType === 'moralDilemma') {
    const pick = lastOf(st, 'moral_choice')
    return { ...base, answers: [], moral: pick ? { sceneId, optionId: `m${Number(pick.index)}` } : null }
  }

  /* מבחן סיכום — שורה לכל שאלה שנענתה */
  if (puzzleType === 'finalQuiz') {
    const answers: AnswerRecord[] = st.quizItems.map((q) => ({
      localId: id(q.itemIndex), sceneId, itemIndex: q.itemIndex, puzzleType,
      selectedOptionId: q.selectedOptionId, selectedPosition: q.selectedPosition, correctPosition: q.correctPosition,
      displayedOrder: q.displayedOrder, isCorrect: q.isCorrect, attemptNo: 1, responseMs: q.responseMs,
      outcome: q.isCorrect ? 'correct' : 'wrong', interaction: null,
    }))
    return { ...base, answers, moral: null }
  }

  let selectedOptionId: string | null = null
  let selectedPosition: number | null = null
  let attemptNo = 1
  let interaction: AnswerRecord['interaction']

  if (puzzleType === 'multipleChoice' || puzzleType === 'trueFalse' || puzzleType === undefined) {
    const sel = lastOf(st, 'select')
    if (sel) { selectedOptionId = String(sel.optionId); selectedPosition = Number(sel.position) }
    interaction = { events: st.events }
  } else if (puzzleType === 'sequenceOrder') {
    const submits = st.events.filter((e) => e.k === 'submit')
    attemptNo = Math.max(1, submits.length)
    interaction = { attempts: submits.map((s, i) => ({ attempt: i + 1, order: s.order, correct: s.correct, t: s.t })), events: undefined }
    if (st.displayedOrder) interaction.initialOrder = st.displayedOrder
  } else if (puzzleType === 'tileSwap' || puzzleType === 'slidingPuzzle') {
    const swaps = st.events.filter((e) => e.k === 'swap')
    attemptNo = Math.max(1, swaps.length)
    interaction = { swaps: swaps.map((s) => ({ from: s.from, to: s.to, tiles: s.tiles, bad: s.bad, t: s.t })), badSwaps: swaps.filter((s) => s.bad).length }
  } else if (puzzleType === 'memory') {
    const flips = st.events.filter((e) => e.k === 'flip')
    attemptNo = Math.max(1, countOf(st, 'pair'))
    interaction = {
      flips: flips.map((f) => ({ card: f.card, pair: f.pair, t: f.t })),
      pairs: st.events.filter((e) => e.k === 'pair').map((p) => ({ a: p.a, b: p.b, match: p.match, t: p.t })),
      mistakes: st.events.filter((e) => e.k === 'pair' && e.match === false).length,
    }
  } else if (puzzleType === 'wordCompletion') {
    const attempts = st.events.filter((e) => e.k === 'attempt')
    attemptNo = Math.max(1, attempts.length)
    interaction = { attempts: attempts.map((a, i) => ({ attempt: i + 1, value: a.value, values: a.values, blank: a.blank, correct: a.correct, t: a.t })) }
  } else if (puzzleType === 'wordSearch') {
    const found = st.events.filter((e) => e.k === 'word_found')
    interaction = { found: found.map((f) => ({ word: f.word, t: f.t })), foundCount: found.length }
  } else if (puzzleType === 'hangman') {
    const letters = st.events.filter((e) => e.k === 'letter')
    attemptNo = Math.max(1, letters.length)
    interaction = { letters: letters.map((l) => ({ letter: l.letter, correct: l.correct, t: l.t })), wrongLetters: letters.filter((l) => !l.correct).map((l) => l.letter) }
  } else {
    interaction = { events: st.events }
  }

  const isMc = puzzleType === 'multipleChoice' || puzzleType === 'trueFalse' || puzzleType === undefined
  return {
    ...base,
    answers: [{
      localId: id(0), sceneId, itemIndex: 0, puzzleType,
      selectedOptionId, selectedPosition,
      correctPosition: isMc ? st.correctPosition : null,
      displayedOrder: isMc ? st.displayedOrder : null,
      isCorrect: result?.correct === true,
      attemptNo, responseMs, outcome,
      interaction: cap(interaction),
    }],
    moral: null,
  }
}
